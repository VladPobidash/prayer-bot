# CLAUDE.md — Prayer Bot codebase guide for AI assistants

This file maps every module, explains the key architectural patterns, and lists
the build/run commands. Read this before making changes.

---

## Module map

| Module | Responsibility |
|--------|----------------|
| `src/index.ts` | Composition root: wires all modules in the correct order, calls `reconcileOnBoot()`, registers SIGINT/SIGTERM shutdown handlers. Builds a `send` closure (returns `message_id`) over `bot.telegram.sendMessage` + `prayedKeyboard` and a plain-DM `notify` closure; injects both into the scheduler. After registering schedules it fires one boot accountability catch-up (`evaluateAccountability`) in case a redeploy crossed the daily tick. |
| `src/config.ts` | `loadConfig(env)` reads environment variables into a frozen `Config` object; exports an eagerly-loaded default instance (fail-fast at boot). |
| `src/preferences.ts` | Committed code-reviewed tunables (`TELEGRAM_MAX_LENGTH`, `PAGE_SIZE`) and the `LOG_PREFIX` constants used by every log call. |
| `src/i18n.ts` | `LOCALES` dictionary (uk/en/ru, ~60 keys), `t(locale, key, vars)` translator with `{var}` interpolation, `resolveLocale(ctx)` stub (returns `config.defaultLocale`), `errorKey(RoomError)` maps every `RoomError` to its `err_*` locale key. |
| `src/rooms.ts` | Prayer-room domain logic: `createRoom` / `joinRoom` / `leaveRoom` / `closeRoom`, `addSharedTopic` / `addPersonalTopic`, `postUpdate` / `markAnswered`, `isRoomAdmin` / `isRoomMember`, `generateInviteCode`. All operations return `Result<T>` (`{ ok: true; value }` or `{ ok: false; error: RoomError }`). Enforces caps (3 rooms/user, 5 shared topics/room, 3 personal topics/member) and per-room role checks. `leaveRoom` (also the auto-removal path) deletes the member's active personal topics and their `membership_state` row. |
| `src/assignments.ts` | Timezone/day helpers (`localDate`, `localTime`, `dayNumber`), shared-topic rotation (`sharedTopicOfDay`), personal-topic assignment algorithm (`assignPersonalTopics` — one other member's topic per member, rotated by day for full-cycle coverage), `generateDailyAssignments` (precompute one room's assignments for a date, idempotent via upsert), and `recordPrayer` thin wrapper. Pure functions + DB wrappers; no Telegraf dependency. |
| `src/accountability.ts` | Stage 3 accountability: pure `computeMissStreak` (wall-clock derived — streak = days between `max(lastPrayed, joinDate)` and yesterday, so join-day grace and prayer-resets are automatic) + `decideAction` (warn at ≥2 missed days once per streak; remove at ≥5 only when the warning is ≥3 days old — a warning always precedes removal, even after downtime), and `evaluateAccountability(now, tz, notify)` — daily sweep over plain members of active rooms with an injected `NotifyFn`; members with no shared or other-member personal topic are exempt and have stale warnings cleared; removal reuses `rooms.leaveRoom` and DMs both the member and the room admin. Per-member try/catch: one failed DM never blocks the sweep. |
| `src/reminders.ts` | Per-topic daily dispatch with an injected `send: SendFn`. `buildMessagesForUser` gathers today's shared + personal assignments across all of a user's active rooms (generates assignments on first touch, idempotent). `dispatchDueReminders(now, tz, send)` iterates all users with a reminder time set, skips those whose local time hasn't reached their reminder, skips those already sent today (`hasSentToday` — idempotent + catch-up safe), then sends one message per topic (or a plain daily nudge if a room has no eligible topic) and records each via `recordSent`. `streakLine(telegramId, date, locale)` builds the 🔥 streak footer, appended to the **first** message of the day only. |
| `src/streak.ts` | Daily prayer streak: pure `computeStreak(prayedDates, today)` (current consecutive days counted back from today — an un-prayed today does not break the streak — plus all-time `best`, `prayedToday`, `lastPrayedDate`, and a 7-day `week` strip) and the DB wrapper `getStreakSummary(telegramId, today)` over `repo.listPrayedDates`. Streaks span all of a user's rooms. Consumed by the Mini App API (`GET /api/me/streak`, embedded in `GET /api/me`). |
| `src/ui.ts` | Pure render + inline-keyboard builders — no Telegraf calls, no DB. Exports: `mainMenu` (includes ⏰ Reminder time button), `roomsList`, `renderRoomView` (viewer-aware: admin vs member buttons), `confirmKb`, `ownTopicsKb`, `prayedKeyboard` (🙏 Prayed today inline button, carries `pray:done:<topicId>`), `errorText`. Depends only on `i18n.ts`, `notify.ts`, and types from `db/repo.ts` / `rooms.ts`. |
| `src/db/connection.ts` | better-sqlite3 singleton: `initDb(path)` opens the database in WAL mode, creates `bot_state`, runs migrations, and calls the reconcile hook; `getDb()` / `closeDb()`. Stage 2 tables: `daily_assignment`, `prayer_log`, `sent_assignment` (plus `reminder_time`/`reminder_enabled` columns on `users`). Stage 3 table: `membership_state` (per-membership `last_prayed_date`/`miss_streak`/`warned_at`; `prayer_log` stays the source of truth). |
| `src/db/repo.ts` | The only SQL module: `getState`/`setState` (UPSERT), plus all prayer-domain SQL — users, rooms, members, topics, topic updates, Stage 2 assignment/prayer/sent-assignment operations (`recordSent`, `getSentByMessage`, `hasSentToday`, `listActiveRoomsForUser`, `listReminderRecipients`, `setReminderTime`, `setReminderEnabled`, `hasPrayed`, `recordPrayer`, and more), and Stage 3 accountability operations (`getMembershipState`/`upsertMembershipState`/`deleteMembershipState`, `lastPrayedDate`, `hasPrayableTopicForMember`, `listEvaluableMemberships`, `getDisplayName`). All future prayer-domain SQL goes here. |
| `src/bot.ts` | `createBot(token)` factory — `/start` (welcome + how-it-works + menu, handles deep-link `?start=join_<code>`), `/help`, `/rooms`, `/join [code]`; single `callback_query` prefix-router dispatching `menu:*` / `room:*` / `topic:*` / `do:*` / `pray:*` namespaces; `pray:done:<topicId>` records a prayer and acknowledges with the updated 🔥 streak; `menu:reminder` starts the reminder-time wizard; per-user in-memory pending-input session `Map` for multi-step wizards (create_name, join_code, add_shared/personal, update_text, answer_note, set_reminder); voice/video/video_note reply handler — looks up `getSentByMessage`, resolves the topic owner, forwards the media via `copyMessage` with a named attribution caption; **per-room authorization checked in handlers** (`isRoomAdmin`/`isRoomMember`); `safeEditMessageText` helper. Does NOT call `bot.launch()`. |
| `src/scheduler.ts` | `register({ send, notify })` — schedules a per-minute node-cron job calling `dispatchDueReminders(new Date(), config.tz, deps.send)` and a daily 09:00 job calling `evaluateAccountability(new Date(), config.tz, deps.notify)`; returns stoppable `ScheduledTask[]`. `SendFn` / `NotifyFn` are re-exported from `reminders.ts` / `accountability.ts`. |
| `src/notify.ts` | `truncate(text, max)`, `lines(items)`, and `confirmKeyboard(yesData, noData)` — message-formatting helpers used by senders. |
| `src/utils.ts` | `normalize(input)` (Cyrillic-safe), `withTimeout(promise, ms)`, `withRetry(fn, opts)` — pure utility functions with no side-effects. |
| `src/auth.ts` | `validateInitData(initDataRaw, botToken)` verifies Telegram WebApp HMAC-SHA256 signature and returns authenticated `TelegramUser`. Includes test helper `generateTestInitData`. |
| `src/server.ts` | `startHealthServer(port)` — Node `http.createServer` serving `GET /health`, static Mini App frontend (`public/index.html`, `public/style.css`, `public/app.js`), and authenticated REST API endpoints (`/api/me`, `/api/rooms`, `/api/topics`, etc.). |

---

## Patterns

### Composition-root wiring order

`index.ts` initialises modules in this sequence so each layer depends only on
what is already ready:

1. `initDb()` — persistence first; nothing else may call SQL before this.
2. `createBot()` — Telegraf instance (no launch yet).
3. Build the `send` closure (over `bot.telegram.sendMessage` + `prayedKeyboard`; returns the sent `message_id`) and the plain-DM `notify` closure.
4. `startHealthServer(config.port)` — health endpoint before the bot is live.
5. `bot.launch()` — starts long-polling.
6. `reconcileOnBoot()` — reads/writes DB; safe now that the DB is open.
7. `registerSchedules({ send, notify })` — cron jobs started last, followed by one boot accountability catch-up sweep.

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

---

## Deployment & Branch Workflow

- **`staging` branch**: Triggers automatic deployment to Railway Staging (`prayer-bot-staging.up.railway.app`) connected to dev bot `@MyPrayerDevBot`.
- **`main` branch**: Triggers automatic deployment to Railway Production (`prayer-bot-production-58d7.up.railway.app`) connected to the production bot.
- See `docs/STAGING_DEPLOYMENT_GUIDE.md` for multi-environment setup details and `docs/LOCAL_TESTING_RUNBOOK.md` for local testing.
