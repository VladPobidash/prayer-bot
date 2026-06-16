# CLAUDE.md — Prayer Bot codebase guide for AI assistants

This file maps every module, explains the key architectural patterns, and lists
the build/run commands. Read this before making changes.

---

## Module map

| Module | Responsibility |
|--------|----------------|
| `src/index.ts` | Composition root: wires all modules in the correct order, calls `reconcileOnBoot()`, registers SIGINT/SIGTERM shutdown handlers. |
| `src/config.ts` | `loadConfig(env)` reads environment variables into a frozen `Config` object; exports an eagerly-loaded default instance (fail-fast at boot). |
| `src/preferences.ts` | Committed code-reviewed tunables (`TELEGRAM_MAX_LENGTH`, `PAGE_SIZE`) and the `LOG_PREFIX` constants used by every log call. |
| `src/i18n.ts` | `LOCALES` dictionary (uk/en/ru), `t(locale, key, vars)` translator with `{var}` interpolation, `resolveLocale(ctx)` stub (returns `config.defaultLocale`). |
| `src/db/connection.ts` | better-sqlite3 singleton: `initDb(path)` opens the database in WAL mode, creates `bot_state`, runs migrations, and calls the reconcile hook; `getDb()` / `closeDb()`. |
| `src/db/repo.ts` | The only SQL module: `getState(key)` / `setState(key, value)` (UPSERT). All future prayer-domain SQL goes here. |
| `src/bot.ts` | `createBot(token)` factory — registers admin middleware, `/start` / `/help` / `/ping` commands, and a single `callback_query` prefix-router; `safeEditMessageText` helper. Does NOT call `bot.launch()`. |
| `src/scheduler.ts` | `register({ notify })` — schedules in-process node-cron jobs (heartbeat as the worked example); returns stoppable `ScheduledTask[]`. |
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
3. Build `notify` closure over `bot.telegram.sendMessage`.
4. `startHealthServer(config.port)` — health endpoint before the bot is live.
5. `bot.launch()` — starts long-polling.
6. `reconcileOnBoot()` — reads/writes DB; safe now that the DB is open.
7. `registerSchedules({ notify })` — cron jobs started last.

### Setter/closure-injected `notify`

`src/scheduler.ts` receives a `Notify` function via `SchedulerDeps`. The
function is constructed in `index.ts` as a closure over `bot.telegram`. This
keeps `scheduler.ts` free of any Telegraf import and makes it straightforward
to inject a stub in tests.

### SQLite singleton + repo seam

`src/db/connection.ts` holds a module-level `db` variable initialised once by
`initDb()`. `getDb()` throws if called before that. All SQL is in
`src/db/repo.ts`; no other module may import `getDb()` directly. A future
Postgres swap requires changes only to `connection.ts` and `repo.ts`.

### `createBot()` factory (no launch)

`createBot()` returns a configured `Telegraf` instance without calling
`bot.launch()`. This allows tests to inspect the bot without starting
long-polling and avoids a race condition where handlers are registered after
the bot is already receiving updates.

### Single callback prefix-router

All `callback_query` events are handled by one `bot.on('callback_query', …)`
handler in `src/bot.ts`. Callback data follows the scheme
`namespace:action:id`. The switch dispatches on `namespace:action`. Keep all
callback routing here; do not scatter individual `bot.action()` calls across
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
