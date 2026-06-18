# CLAUDE.md — Prayer Bot codebase guide for AI assistants

This file maps every module, explains the key architectural patterns, and lists
the build/run commands. Read this before making changes.

---

## Module map

| Module | Responsibility |
|--------|----------------|
| `src/index.ts` | Composition root: wires all modules in the correct order, calls `reconcileOnBoot()`, registers SIGINT/SIGTERM shutdown handlers. Builds a `send` closure (returns `message_id`) over `bot.telegram.sendMessage` + `prayedKeyboard`; injects it into the scheduler instead of the old `notify`. |
| `src/config.ts` | `loadConfig(env)` reads environment variables into a frozen `Config` object; exports an eagerly-loaded default instance (fail-fast at boot). |
| `src/preferences.ts` | Committed code-reviewed tunables (`TELEGRAM_MAX_LENGTH`, `PAGE_SIZE`) and the `LOG_PREFIX` constants used by every log call. |
| `src/i18n.ts` | `LOCALES` dictionary (uk/en/ru, ~60 keys), `t(locale, key, vars)` translator with `{var}` interpolation, `resolveLocale(ctx)` stub (returns `config.defaultLocale`), `errorKey(RoomError)` maps every `RoomError` to its `err_*` locale key. |
| `src/rooms.ts` | Prayer-room domain logic: `createRoom` / `joinRoom` / `leaveRoom` / `closeRoom`, `addSharedTopic` / `addPersonalTopic`, `postUpdate` / `markAnswered`, `isRoomAdmin` / `isRoomMember`, `generateInviteCode`. All operations return `Result<T>` (`{ ok: true; value }` or `{ ok: false; error: RoomError }`). Enforces caps (3 rooms/user, 5 shared topics/room, 3 personal topics/member) and per-room role checks. |
| `src/assignments.ts` | Timezone/day helpers (`localDate`, `localTime`, `dayNumber`), shared-topic rotation (`sharedTopicOfDay`), personal-topic assignment algorithm (`assignPersonalTopics` — one other member's topic per member, rotated by day for full-cycle coverage), `generateDailyAssignments` (precompute one room's assignments for a date, idempotent via upsert), and `recordPrayer` thin wrapper. Pure functions + DB wrappers; no Telegraf dependency. |
| `src/reminders.ts` | Per-topic daily dispatch with an injected `send: SendFn`. `buildMessagesForUser` gathers today's shared + personal assignments across all of a user's active rooms (generates assignments on first touch, idempotent). `dispatchDueReminders(now, tz, send)` iterates all users with a reminder time set, skips those whose local time hasn't reached their reminder, skips those already sent today (`hasSentToday` — idempotent + catch-up safe), then sends one message per topic and records each via `recordSent`. |
| `src/ui.ts` | Pure render + inline-keyboard builders — no Telegraf calls, no DB. Exports: `mainMenu` (includes ⏰ Reminder time button), `roomsList`, `renderRoomView` (viewer-aware: admin vs member buttons), `confirmKb`, `ownTopicsKb`, `prayedKeyboard` (🙏 Prayed today inline button, carries `pray:done:<topicId>`), `errorText`. Depends only on `i18n.ts`, `notify.ts`, and types from `db/repo.ts` / `rooms.ts`. |
| `src/db/connection.ts` | better-sqlite3 singleton: `initDb(path)` opens the database in WAL mode, creates `bot_state`, runs migrations, and calls the reconcile hook; `getDb()` / `closeDb()`. Stage 2 tables: `daily_assignment`, `prayer_log`, `sent_assignment` (plus `reminder_time`/`reminder_enabled` columns on `users`). |
| `src/db/repo.ts` | The only SQL module: `getState`/`setState` (UPSERT), plus all prayer-domain SQL — users, rooms, members, topics, topic updates, Stage 2 assignment/prayer/sent-assignment operations (`recordSent`, `getSentByMessage`, `hasSentToday`, `listActiveRoomsForUser`, `listReminderRecipients`, `setReminderTime`, `setReminderEnabled`, `hasPrayed`, `recordPrayer`, and more). All future prayer-domain SQL goes here. |
| `src/bot.ts` | `createBot(token)` factory — `/start` (welcome + how-it-works + menu, handles deep-link `?start=join_<code>`), `/help`, `/rooms`, `/join [code]`; single `callback_query` prefix-router dispatching `menu:*` / `room:*` / `topic:*` / `do:*` / `pray:*` namespaces; `pray:done:<topicId>` records a prayer and acknowledges; `menu:reminder` starts the reminder-time wizard; per-user in-memory pending-input session `Map` for multi-step wizards (create_name, join_code, add_shared/personal, update_text, answer_note, set_reminder); voice/video/video_note reply handler — looks up `getSentByMessage`, resolves the topic owner, forwards the media via `copyMessage` with a named attribution caption; **per-room authorization checked in handlers** (`isRoomAdmin`/`isRoomMember`); `safeEditMessageText` helper. Does NOT call `bot.launch()`. |
| `src/scheduler.ts` | `register({ send })` — schedules a per-minute in-process node-cron job that calls `dispatchDueReminders(new Date(), config.tz, deps.send)`; returns stoppable `ScheduledTask[]`. The old heartbeat job is gone; `SendFn` is re-exported from `reminders.ts`. |
| `src/notify.ts` | `truncate(text, max)`, `lines(items)`, and `confirmKeyboard(yesData, noData)` — message-formatting helpers used by senders. |
| `src/utils.ts` | `normalize(input)` (Cyrillic-safe), `withTimeout(promise, ms)`, `withRetry(fn, opts)` — pure utility functions with no side-effects. |
| `src/server.ts` | `startHealthServer(port)` — minimal Node `http.createServer`; `GET /health` → `{"status":"ok"}`; everything else → 404. |

---

## Patterns

### Composition-root wiring order

`index.ts` initialises modules in this sequence so each layer depends only on
what is already ready:

1. `initDb()` — persistence first; nothing else may call SQL before this.
2. `createBot()` — Telegraf instance (no launch yet).
3. Build `send` closure over `bot.telegram.sendMessage` + `prayedKeyboard`; returns the sent `message_id`.
4. `startHealthServer(config.port)` — health endpoint before the bot is live.
5. `bot.launch()` — starts long-polling.
6. `reconcileOnBoot()` — reads/writes DB; safe now that the DB is open.
7. `registerSchedules({ send })` — cron jobs started last.

### Setter/closure-injected `send`

`src/scheduler.ts` (and `src/reminders.ts`) receive a `SendFn` function via
`SchedulerDeps`. The function is constructed in `index.ts` as a closure over
`bot.telegram.sendMessage` + `prayedKeyboard`, and returns the sent
`message_id` so that `recordSent` can store it for later voice-reply mapping.
This keeps `scheduler.ts` and `reminders.ts` free of any Telegraf import and
makes it straightforward to inject a stub in tests.

### SQLite singleton + repo seam

`src/db/connection.ts` holds a module-level `db` variable initialised once by
`initDb()`, which also creates the schema (DDL). `getDb()` throws if called
before that. All query SQL (DML) is in `src/db/repo.ts`; no other module may
import `getDb()` directly. A future Postgres swap requires changes only to
`connection.ts` and `repo.ts`.

### `createBot()` factory (no launch)

`createBot()` returns a configured `Telegraf` instance without calling
`bot.launch()`. This allows tests to inspect the bot without starting
long-polling and avoids a race condition where handlers are registered after
the bot is already receiving updates.

### Per-room authorization (not a global allow-list)

Authorization is enforced per room inside each handler. `rooms.isRoomAdmin(userId, roomId)` and `rooms.isRoomMember(userId, roomId)` are called at the point of action — no global `bot.use` middleware gate exists. Admin rights mean the user is the room creator (`room.adminId === userId`); member rights mean any active entry in `room_members`. Handlers that require admin access reply with `err_not_admin` from `i18n.ts` if the check fails.

### Pending-input session Map for multi-step wizards

`src/bot.ts` holds a module-level `Map<number, Pending>` (keyed by Telegram user id) to track in-progress wizard steps such as entering a room name, an invite code, or a topic text. When the user sends free text, the `bot.on('text', …)` handler looks up the pending entry, consumes it, and dispatches to the appropriate action. The map is purely in-memory — it does not survive a process restart (acceptable for wizard prompts; durable state goes to SQLite).

### Single callback prefix-router

All `callback_query` events are handled by one `bot.on('callback_query', …)`
handler in `src/bot.ts`. Callback data follows the scheme
`namespace:action:id` (≤64 bytes — carry only ids). Namespaces in use:
`menu` (home/rooms/help/create/join/reminder), `room` (open/addshared/addpersonal/update/answer/close/leave),
`topic` (update/answer), `do` (close/leave confirmations), `pray` (done — records a prayer for today).
Keep all callback routing here; do not scatter individual `bot.action()` calls across
the codebase.

### Persist-in-SQLite vs ephemeral boundary

Any state that must survive a process restart (user preferences, prayer topics,
timestamps) goes in SQLite via `src/db/repo.ts`. Ephemeral state (in-flight
variables, module-local caches) may be held in plain JavaScript variables. Do
not introduce an external cache (Redis, etc.) without an ADR.

### Erasable-only TypeScript + `.ts` import extensions

`tsconfig.json` sets `erasableSyntaxOnly: true` and
`allowImportingTsExtensions: true`. Every local import must use an explicit
`.ts` extension (`import { x } from './utils.ts'`). No `enum`, `namespace`, or
parameter-property syntax is allowed — use `const` + union types and
`import type` / inline `type` for type-only imports (`verbatimModuleSyntax` is
on).

### Bracketed log prefixes

Every `console.log` / `console.error` call begins with a bracketed module
prefix drawn from `LOG_PREFIX` in `src/preferences.ts`:

| Module | Prefix |
|--------|--------|
| bot | `[bot]` |
| database | `[db]` |
| scheduler | `[scheduler]` |
| health server | `[server]` |

---

## Build & Run

**Requirement: Node ≥ 24.** The bot runs directly via Node's native TypeScript
type-stripping — there is no build step. The `typecheck` script uses
`tsc --noEmit` for type safety in CI without emitting any files.

```bash
# Install dependencies (better-sqlite3 compiles a native binding)
npm install

# Start the bot (requires a .env with TELEGRAM_BOT_TOKEN set)
npm start

# Type-check + run all unit tests
npm test
```

Runtime dependencies: `telegraf`, `better-sqlite3`, `node-cron`, `dotenv`

Dev dependencies: `typescript`, `@types/node`, `@types/better-sqlite3`
