# Prayer-Bot Blank Framework Template — Design Spec

**Date:** 2026-06-16
**Status:** Approved (pending written-spec review)
**Author:** Vlad (with Claude Code)

## 1. Context

We are building a brand-new Telegram **prayer bot**: Telegram groups organized around
prayer topics, scheduled reminders, and gamification (streaks/points/leaderboards) to
motivate consistent prayer. Business logic will be specified later.

This spec covers **only the blank framework/template** — the reusable architecture,
wiring, and code patterns — with **no prayer business logic**. The template must compile,
start, pass `GET /health`, and deploy to Railway, ready to receive the domain later.

The architecture is a deliberately framework-light, layered **TypeScript** (Node.js ESM)
stack (Telegraf + better-sqlite3 WAL + node-cron + a built-in `http` server + minimal
dependencies), run build-free via Node's native type-stripping and designed
for **Railway's ephemeral-container, redeploy-on-push model** — durable state lives on a
mounted Volume, process death is treated as normal, and missed work is reconciled on boot.

## 2. Goals

- Use a clean, proven layering (composition root → config → data → bot → background → presentation).
- Be the **thinnest** useful framework: wiring + patterns, no domain tables/logic.
- Deploy cleanly on Railway (personal account) with durable persistence.
- Support three UI locales from day one: **Ukrainian (uk), English (en), Russian (ru)**.
- Keep all SQL behind one repository module so a future Postgres swap is localized.
- Ship the three-tier doc discipline (README / CLAUDE.md / ADR log) from the start.
- **Be open-source and forkable**: MIT-licensed, hosted on GitHub, so anyone can fork it
  and run their own instance for a church/group with minimal effort.
- **Beginner-friendly docs**: the README and setup guide target a *non-developer* admin —
  a one-click "Deploy on Railway" path, step-by-step instructions, and clear links between
  guides. Low barrier to entry is a first-class requirement, not an afterthought.

## 3. Non-Goals (explicitly deferred)

- Any prayer domain: groups-as-rooms modeling, prayer topics, check-ins, streak/points
  math, reminders, leaderboards. (Tables + modules are stubbed/commented, not implemented.)
- LLM features (encouragements/verse suggestions). The DI seam is **omitted** for now,
  not stubbed — added when the feature is designed.
- Telegram webhooks (long-polling only for v1).
- Managed Postgres (SQLite-on-Volume now; the repo boundary makes the swap cheap later).
- A `/lang` switch command (needs a per-chat persistence decision = domain).

## 4. Key Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Template depth | **Thin layer skeleton** | Framework + patterns only; domain added when business logic lands. |
| D2 | Persistence | **SQLite on Railway Volume, abstracted** | Reuse better-sqlite3/WAL/repo patterns; all SQL behind `db/repo.ts` so a Postgres swap touches one boundary. Single-replica. |
| D3 | Transport | **Long-polling** | Zero public networking, simplest on Railway. `GET /health` keeps healthchecks green. Webhooks deferred. |
| D4 | Localization | **i18n: uk / en / ru** | `t(locale,key,vars)` + dictionaries; default locale configurable (`uk`). |
| D5 | Package mgr / deps | **npm; minimal runtime deps** | Runtime: `telegraf`, `better-sqlite3`, `node-cron`, `dotenv`. Dev only: `typescript`, `@types/*`. No build step; pin `engines.node`. |
| D6 | Process supervision | **Railway restart policy + graceful SIGTERM** | No external supervisor; rely on Railway's restart. A graceful SIGTERM handler runs `db.close()` so WAL flushes before SIGKILL. |
| D7 | License | **MIT** | Maximize free reuse/forking by churches and groups; lowest-friction permissive license. |
| D8 | Host / distribution | **GitHub** | Best forking UX + discoverability; native Railway "Deploy from GitHub" + one-click button. |
| D9 | Docs audience | **Non-developer admin first** | README/SETUP must let a non-coder fork and deploy; dev docs (CLAUDE.md/ADRs) are secondary. |
| D10 | Language | **TypeScript, run build-free** | Types as guardrails for agentic development. Run `.ts` directly via Node ≥24 native type-stripping — no `tsc`/bundler in the deploy path. `erasableSyntaxOnly` enforces strip-safe syntax; `tsc --noEmit` type-checks in CI/test. |

## 5. Architecture & Layering

Single long-lived Node process, framework-light, layered. The composition root wires
everything in a **strict dependency order — order is the contract**:

```
process error guards (unhandledRejection / uncaughtException, log-only)
  → initDb()                 // open SQLite (WAL), run idempotent schema, reconcile transient state
  → createBot()              // construct Telegraf (no launch)
  → setSendMessage(closure)  // inject bot.telegram.sendMessage into background modules
  → startHealthServer(PORT)  // node:http GET /health → 200
  → bot.launch()             // long polling
  → reconcileOnBoot()        // wired, empty-but-real (reads bot_state.last_processed_at)
  → scheduler.register()     // node-cron jobs, feature-flagged, per-target try/catch
  → process.once(SIGINT/SIGTERM, shutdown)   // bot.stop → server.close → db.close
```

Persistence is initialized before the client; the client before anything that sends.

### Module layout

```
prayer-bot/
├─ src/
│  ├─ index.ts        Composition root: wiring order, reconcileOnBoot(), graceful shutdown
│  ├─ config.ts       Frozen env-derived config (typed Config); fail-fast on required vars
│  ├─ preferences.ts  Committed non-string tunables (TELEGRAM_MAX_LENGTH, PAGE_SIZE, log prefixes)
│  ├─ i18n.ts         t(locale,key,vars), resolveLocale(ctx), uk/en/ru dicts; Locale/LocaleKey types
│  ├─ db/
│  │   ├─ connection.ts  better-sqlite3 singleton: DB_PATH, WAL, initDb(), getDb(), close()
│  │   └─ repo.ts        The ONLY module with SQL; typed named functions = the swap seam
│  ├─ bot.ts          createBot() factory (no launch): middleware, /start /help /ping, router, bot.catch
│  ├─ scheduler.ts    register({notify}) — node-cron wiring + one no-op heartbeat job
│  ├─ notify.ts       Pure formatters: truncate(4096), lines(), one keyboard-builder example
│  ├─ utils.ts        Cyrillic-safe normalize() (\p{L}\p{N}/u), withRetry(), withTimeout()
│  └─ server.ts       node:http server bound to PORT on 0.0.0.0: GET /health → 200
├─ tests/             node --test over tests/**/*.test.ts (Node strips types directly)
├─ docs/
│  ├─ architecture-decisions.md   ADR log (developer-facing)
│  ├─ SETUP.md                    Beginner step-by-step: BotFather → Railway deploy → verify
│  └─ USAGE.md                    How to use the bot (commands, admin vs member)
├─ .github/
│  └─ ISSUE_TEMPLATE.md           Simple bug/question template (optional, low-effort)
├─ .env.example
├─ tsconfig.json      noEmit, nodenext, strict, erasableSyntaxOnly, verbatimModuleSyntax
├─ package.json       "type":"module", engines.node ">=24", start=node src/index.ts, test=typecheck + node --test
├─ .gitignore         node_modules, .env, *.db, *.db-wal, *.db-shm, /data
├─ railway.json       start command for the Railway service
├─ LICENSE            MIT
├─ CONTRIBUTING.md    How to fork, run locally, test, and submit PRs
├─ CODE_OF_CONDUCT.md Contributor Covenant (lightweight)
├─ CLAUDE.md          Per-module map + Patterns section (for contributors using Claude Code)
└─ README.md          Friendly landing: what/who-for, 1-click deploy, links to docs/SETUP & docs/USAGE
```

**Why `db/` is two files:** `connection.ts` owns the driver and lifecycle; `repo.ts` is the
single seam every caller goes through (callers never see SQL). A future Postgres migration
rewrites these two files only. (Note: better-sqlite3 is synchronous; if Postgres is adopted
later, repo functions become async and callers must `await` — but the change stays contained
to the repo boundary + its direct callers.)

### TypeScript & build-free execution

Source is TypeScript, run **directly** by Node ≥24 via native type-stripping — `node
src/index.ts`, with no `tsc`/bundler/`dist/` in the run or deploy path. Setup:

- **Erasable-only syntax:** no `enum`, `namespace`, or constructor parameter properties
  (they need codegen, not just stripping). `tsconfig.json` sets `erasableSyntaxOnly: true`
  so the compiler rejects non-strip-safe syntax — use `const` objects + union types instead
  of enums. Plus `verbatimModuleSyntax: true` (explicit `import type`), `module: nodenext`,
  `rewriteRelativeImportExtensions: true`, `noEmit: true`, `strict: true`.
- **Type-checking is separate:** stripping does not check types. `npm test` runs `tsc
  --noEmit` before `node --test`; CI runs the same.
- **Deps:** `typescript`, `@types/node`, `@types/better-sqlite3`, `@types/node-cron` are
  **devDependencies**; runtime deps stay the four (Telegraf and dotenv ship their own types).
- **Typed seams for agentic work:** a `Config` interface, a `BotState` row type, and
  `Locale`/`LocaleKey` unions give compile-time contracts that catch wrong-shape calls
  before runtime.

## 6. Module Specifications

### `src/config.ts`
- `import 'dotenv/config'` on line 1 (no-ops on Railway where no `.env` exists).
- Fail-fast: `required = ['TELEGRAM_BOT_TOKEN']`; throw `Missing required env var: <KEY>` →
  surfaces as a one-line Railway crash-loop log.
- Exports a single `Object.freeze`d default config:
  - `telegramBotToken`
  - `dbPath` = `process.env.DB_PATH || './data/prayer-bot.db'`
  - `port` = `Number(process.env.PORT) || 3000`
  - `tz` = `process.env.TZ || 'UTC'`
  - `defaultLocale` = `process.env.DEFAULT_LOCALE || 'uk'`
  - `adminUserIds` = comma-list → `Set<number>`
  - `adminChatId` = `Number(process.env.ADMIN_CHAT_ID) || null`
  - `heartbeatCron` = `process.env.HEARTBEAT_CRON || '0 * * * *'`
- Deliberate numeric parsing that does not treat a legitimate `0` as falsy where it matters.

### `src/preferences.ts`
- Dependency-free committed constants: `TELEGRAM_MAX_LENGTH = 4096`, `PAGE_SIZE = 10`,
  `LOG_PREFIX = { bot:'[bot]', db:'[db]', scheduler:'[scheduler]', server:'[server]' }`.
- (User-facing strings live in `i18n.ts`, not here.)

### `src/i18n.ts`
- `LOCALES = { uk: {...}, en: {...}, ru: {...} }` — dictionaries for the stub strings
  (`start`, `help`, `ping`, plus a generic `unknownCommand`). Each key may contain
  `{placeholder}` tokens.
- `SUPPORTED_LOCALES` derived from `Object.keys(LOCALES)`.
- `t(locale, key, vars = {})`: returns the string for `locale`, falling back to
  `config.defaultLocale`, then to the key itself; interpolates `{var}` tokens.
- `resolveLocale(ctx)`: returns `config.defaultLocale` for now. **TODO** marker: read a
  per-group/user locale from the DB once the domain models it.

### `src/db/connection.ts`
- `initDb()`: open `better-sqlite3(config.dbPath)`, `pragma('journal_mode = WAL')`, run
  idempotent `CREATE TABLE IF NOT EXISTS` for the framework schema, run a PRAGMA-guarded
  additive-`ALTER` migration helper (worked example, currently a no-op), then **reconcile**
  (currently a no-op placeholder; the hook exists). Returns the handle.
- `getDb()`: accessor for `repo.ts`. `closeDb()`: `db.close()` for graceful shutdown.
- Single owner of the connection.

### `src/db/repo.ts`
- The only module importing `getDb()`. All SQL via prepared statements; all values bound.
- Worked example over `bot_state`: `getState(key)`, `setState(key, value)` (UPSERT via
  `ON CONFLICT DO UPDATE`).
- A large comment block marks where prayer-domain repo functions will go.

### `src/bot.ts`
- `createBot()` constructs `new Telegraf(config.telegramBotToken)` and returns it **without
  launching** (caller owns lifecycle/transport).
- **Admin-gating middleware scaffold:** one `bot.use` that gates *write/admin* commands
  against `config.adminUserIds`; **stays silent** on ordinary group messages and
  unauthorized taps (never replies "Unauthorized" — group-safe). For the thin skeleton the
  three stub commands are all read-only, so the middleware is wired with a documented
  `isWriteCommand()` predicate that currently matches nothing.
- Commands: `/start` (greets via `t()`, registers nothing yet), `/help`, `/ping`→`pong`.
- One `bot.on('callback_query')` **prefix-dispatch router** with the `namespace:action:id`
  convention and an example `demo:noop:<id>` handler; answers the callback immediately;
  `default → log` branch for stale buttons.
- `safeEditMessageText(ctx, text, markup)`: swallows Telegram's 400 "message is not
  modified", rethrows others.
- `bot.catch` global error boundary (logs; keeps process alive).

### `src/scheduler.ts`
- `register({ notify })`: registers node-cron jobs, each behind a feature flag and wrapped
  in per-iteration `try/catch`. Ships **one no-op heartbeat job** (`config.heartbeatCron`)
  that logs `[scheduler] heartbeat` — demonstrates the registration pattern.
- Takes an injected `notify(chatId, text, extra)` closure (never imports `bot.ts`).

### `src/notify.ts`
- Pure, stateless: `truncate(text)` (single shared helper at `TELEGRAM_MAX_LENGTH`),
  `lines(arr)` join helper, one example inline-keyboard builder. No Telegram API calls.
- One keyboard convention only (Telegraf `Markup`).

### `src/utils.ts`
- `normalize(str)`: Unicode-aware, `\p{L}\p{N}` with the `/u` flag (**Cyrillic-safe** — does
  not strip uk/ru text). Used later for title matching.
- `withRetry(fn, opts)` and `withTimeout(promise, ms)`: small manual wrappers (no deps) for
  any future outbound HTTP.

### `src/server.ts`
- `startHealthServer(port)`: framework-free `node:http` server bound to `0.0.0.0:port`,
  method+url if-chain, `GET /health → 200 {status:'ok'}`, 404 fallthrough. Returns the
  server so `index.ts` can `close()` it on shutdown. (Placeholder comment for a future
  `POST /telegram/<secret>` webhook route.)

### `src/index.ts`
- The composition root described in §5. `shutdown()` is a single idempotent function bound
  via `process.once` to SIGINT and SIGTERM: `bot.stop('SIGTERM') → server.close() →
  closeDb() → process.exit(0)`. Process-level error guards installed first.
- `reconcileOnBoot()` ships as a real function that reads `bot_state.last_processed_at`
  (currently informational) — the seam for reminder/streak recovery later.

## 7. Data Model

All tables created idempotently in `initDb()` (`CREATE TABLE IF NOT EXISTS`), WAL, at
`config.dbPath` (= `/data/prayer-bot.db` on a Railway Volume).

```sql
-- Framework-level operational bookkeeping (the worked repo example).
CREATE TABLE IF NOT EXISTS bot_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- e.g. ('last_processed_at', ISO timestamp) for reconcile-on-boot.
```

A commented block documents the planned prayer-domain tables (added later, additive-only):
`groups`, `group_admins`, `prayer_topics`, `topic_members`, `prayer_log`
(PK `(telegram_id, topic_id, prayed_date)` + `INSERT OR IGNORE` for idempotent check-ins),
`streaks` (denormalized per-group), `reminders` (`next_run_at` persisted).

## 8. Configuration / Environment

`.env.example` mirrors every key (the Railway Variables checklist; secrets blank):

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | BotFather token |
| `DB_PATH` | No | `./data/prayer-bot.db` | SQLite path (set `/data/prayer-bot.db` on Railway Volume) |
| `PORT` | No | `3000` | Health server port (Railway injects this) |
| `TZ` | No | `UTC` | Container timezone |
| `DEFAULT_LOCALE` | No | `uk` | Default UI locale (`uk`/`en`/`ru`) |
| `ADMIN_USER_IDS` | No | — | Comma-separated Telegram user ids (admin/write gating) |
| `ADMIN_CHAT_ID` | No | — | Chat id for operator/error alerts |
| `HEARTBEAT_CRON` | No | `0 * * * *` | Demo scheduler job cadence |

## 9. Internationalization

- Three dictionaries (uk/en/ru) for the stub strings, `t()` with fallback chain
  (`requested locale → default locale → key`) and `{var}` interpolation.
- `resolveLocale(ctx)` returns the default locale now; the DB-backed per-chat resolution is
  a documented TODO. No `/lang` command yet.
- Adding a string = add the key to all three dictionaries.

## 10. Error Handling & Resilience

- Process-level `unhandledRejection` / `uncaughtException` guards (log-only, no `exit` —
  avoids Railway restart loops).
- `bot.catch` for ctx-scoped handler errors.
- `safeEditMessageText` swallows the benign "message is not modified" 400.
- `notify()` wrapper: a failed send logs and never throws into the caller.
- Scheduler jobs: per-iteration `try/catch`.
- `reconcileOnBoot()` + persisted `bot_state` are the seam to recover missed work after a
  Railway redeploy (treat process death as normal, not exceptional).

## 11. Railway Deployment

- **Transport:** long-polling (`bot.launch()`); no public webhook. The `GET /health` server
  binds `process.env.PORT` so Railway healthchecks pass and the service isn't treated as
  portless.
- **Persistence:** create a Railway **Volume** mounted at `/data`; set
  `DB_PATH=/data/prayer-bot.db`. The `.db`/`.db-wal`/`.db-shm` all persist there. **Single
  replica only** (WAL across replicas is unsafe).
- **Build:** Nixpacks runs `npm install` + `npm start` (= `node src/index.ts`); Node ≥24
  strips TypeScript types at load, so there is **no build step** and no `dist/`. better-sqlite3
  compiles fine. `railway.json` declares the start command; pin Node via `engines.node`.
- **Config:** all via the Railway Variables tab (no committed `.env`).
- **Shutdown:** rely on Railway's SIGTERM-then-SIGKILL; the graceful handler closes the DB.
- **One-click deploy:** publish a Railway template from the GitHub repo and embed a
  "Deploy on Railway" button in the README. The template pre-declares the Volume mount at
  `/data`, `DB_PATH=/data/prayer-bot.db`, and a `TELEGRAM_BOT_TOKEN` variable prompt, so a
  church admin's happy path is: click button → paste bot token → deploy. (Manual path is
  also documented in `docs/SETUP.md` as the fallback.)
- `docs/SETUP.md` documents the full beginner click-path with the manual fallback: create
  service from GitHub → add Volume `/data` → set `DB_PATH` + `TELEGRAM_BOT_TOKEN` → deploy →
  confirm `/health` and a `/ping` reply.

## 12. Testing

`node --test` over `tests/**/*.test.ts`, required env injected inline in the `test` script.
Cover the pure logic that exists in the skeleton:
- `utils.normalize()` — Cyrillic preserved, punctuation stripped.
- `notify.truncate()` — boundary at 4096.
- `config` parsing — required-var throw, numeric `0` handling, comma-list → Set.
- `i18n.t()` — fallback chain + `{var}` interpolation.

`npm test` runs `tsc --noEmit` (type-check) **then** `node --test`. Tests are `.ts` and run
directly via type-stripping — no separate compile.

## 13. Conventions

- Bracketed-prefix logging (`[bot] [db] [scheduler] [server]`).
- Persist-vs-ephemeral boundary: durable state in SQLite; transient UI/session state in
  in-memory Maps (none needed yet in the skeleton).
- One shared `truncate()`; one keyboard convention; `\p{L}\p{N}` normalizer (never `[a-z0-9]`).
- Three-tier docs kept in sync; one accurate dependency-count source of truth.
- TypeScript, erasable-only: no `enum`/`namespace`/parameter-properties (`erasableSyntaxOnly`
  enforces it); prefer `const` + union over `enum`; `import type` for type-only imports.
  Types are guardrails, not ceremony.

## 14. ADRs to Record (`docs/architecture-decisions.md`)

1. Telegram long-polling vs webhook on Railway (→ long-polling for v1).
2. SQLite-on-Volume (abstracted via repo) vs managed Postgres (→ SQLite now).
3. In-process node-cron + reconcile-on-boot vs Railway Cron (→ in-process).
4. Group-safe auth: admin-gating + silent-on-chatter vs closed allow-list.
5. Railway restart policy + graceful SIGTERM, with no external process supervisor.
6. TypeScript run via Node native type-stripping vs a `tsc` build vs plain JS (→ type-stripping, no build step).

## 15. Definition of Done (template)

- `npm install && npm start` boots locally: DB opens (WAL), bot connects (long-polling),
  `GET /health` returns 200, heartbeat cron logs on schedule, `/start` `/help` `/ping`
  respond in the default locale, SIGINT shuts down cleanly (DB closed).
- `npm test` passes (`tsc --noEmit` type-check + `node --test`).
- `npm start` runs `src/index.ts` directly via Node type-stripping — no build step, no `dist/`.
- Deploys to Railway with a Volume; data survives a redeploy.
- **A non-developer can deploy from the README**: the "Deploy on Railway" button + a
  `docs/SETUP.md` walkthrough get a fork running without editing code.
- `LICENSE` (MIT), `README.md`, `docs/SETUP.md`, `docs/USAGE.md`, `CONTRIBUTING.md`,
  `CLAUDE.md`, `tsconfig.json`, and the 6 ADRs are present, accurate, and cross-linked.
- No prayer business logic present; extension points are clearly commented.

## 16. Documentation Set (open-source, beginner-friendly)

Audience-split, **non-developer admin first**:

- **README.md** — the front door. One-line description + "who this is for"
  (churches/small groups); short feature list (grows with the domain); a prominent
  **"Deploy on Railway" button** + "Deploy your own in ~10 minutes" quickstart; links to
  `docs/SETUP.md` and `docs/USAGE.md`; a collapsed "Run locally (for developers)" section;
  badges (license, Railway); Contributing + License footer. Plain language, no unexplained
  jargon; every external step (BotFather, Railway) is a clickable link.
- **docs/SETUP.md** — the beginner deploy guide. Numbered, copy-paste, with screenshot
  placeholders: (1) create a Telegram bot via @BotFather, copy the token; (2) one-click
  Deploy on Railway *or* the manual create-from-GitHub path; (3) add the Volume at `/data`,
  set `DB_PATH` + `TELEGRAM_BOT_TOKEN`; (4) verify `/health` and a `/ping` reply.
  Troubleshooting box (wrong token, data lost = Volume missing, wrong timezone).
- **docs/USAGE.md** — using the bot once running: command list, admin vs member, locale
  note. Thin now (`/start /help /ping`), grows with the domain.
- **CONTRIBUTING.md** — for forkers/devs: prerequisites, `npm install`, `npm start`,
  `npm test`, conventions (the Patterns section), how to open a PR.
- **CODE_OF_CONDUCT.md** — Contributor Covenant (short, standard).
- **CLAUDE.md** — per-module map + Patterns, for contributors using Claude Code.
- **LICENSE** — MIT, with the author's copyright line.
- **.github/ISSUE_TEMPLATE.md** — minimal bug/question template.
- **.env.example** — every variable with a friendly one-line comment; required ones marked.

Cross-linking is mandatory (README → SETUP/USAGE; SETUP ↔ USAGE; guides → repo issues for
help). Keep one accurate dependency/feature source of truth; don't let docs drift out of sync.

## 17. Future Work (out of scope here)

Prayer domain (groups/topics/check-ins/streaks/reminders/leaderboards), per-chat locale +
`/lang`, the DI'd LLM encouragement seam (prefer Anthropic HTTP SDK), and — only if scale
demands — Telegram webhooks and/or the Postgres swap behind the repo boundary.
