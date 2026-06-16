# Architecture Decision Records

Each ADR captures a significant technical choice, its context, and the
trade-offs accepted. Decisions are listed in the order they were made during
initial development.

---

## ADR 1 — Long-polling transport vs webhook

**Status:** Accepted

**Context:** Telegram bots can receive updates either by registering a public
HTTPS webhook endpoint or by polling the Telegram API in a long-polling loop.
Webhooks require a stable public URL and TLS termination; Railway services
automatically get a public domain, but the domain changes if the service is
redeployed from scratch, which would require re-registering the webhook.

**Decision:** Use Telegraf's built-in long-polling (`bot.launch()`) for v1.
The bot calls the Telegram API outbound; no inbound route is needed, so the
Railway domain is irrelevant to bot connectivity.

**Consequences:** Long-polling adds a small steady stream of outbound requests
to the Telegram API and introduces slightly higher latency than webhooks
(typically under one second). Webhook support is deferred to a future ADR; the
Telegraf abstraction makes the switch straightforward when needed.

---

## ADR 2 — SQLite on a Railway Volume vs managed Postgres

**Status:** Accepted

**Context:** The bot needs durable key-value storage to persist state across
restarts and redeployments. Managed Postgres on Railway costs extra and
introduces a network hop. SQLite running on a Railway Volume provides durable
storage at zero additional cost, with synchronous reads and sub-millisecond
write latency.

**Decision:** Use better-sqlite3 (SQLite) in WAL mode, with the database file
on a Railway Volume mounted at `/data`. All SQL is concentrated in
`src/db/repo.ts` behind a `getDb()` singleton from `src/db/connection.ts`.

**Consequences:** The repo-seam design means a future migration to Postgres
requires changes only in `connection.ts` (switch driver) and `repo.ts`
(replace parameterised SQL). SQLite does not support concurrent write
connections, so a multi-instance deploy is not possible without migrating to
Postgres; this is acceptable for v1 single-instance deployments.

---

## ADR 3 — In-process node-cron + reconcile-on-boot vs Railway Cron

**Status:** Accepted

**Context:** The bot needs to fire scheduled jobs (reminders, heartbeat).
Railway offers a separate Cron service resource, but that would require an
additional HTTP endpoint to trigger jobs and a separate deployment unit.
An in-process scheduler shares the same SQLite connection and can read and
write state atomically.

**Decision:** Use node-cron v4 running inside the same Node process, wired
through `src/scheduler.ts`. On every boot, `reconcileOnBoot()` in `index.ts`
reads the last-processed timestamp from SQLite and can reset any jobs that were
in-flight when the process was killed.

**Consequences:** Missed ticks during a process restart are recovered by the
reconcile hook rather than replayed automatically. If a tick is missed (e.g.,
the container was down during the scheduled minute), the next reconcile marks
work as pending and re-queues it. This is sufficient for low-frequency reminder
jobs; high-frequency or exactly-once delivery would require a more robust queue.

---

## ADR 4 — Group-safe auth: admin gate + silent drop vs closed allow-list

**Status:** Accepted

**Context:** The bot is expected to be added to Telegram group chats. A naive
approach of replying "Unauthorized" to every unknown user would cause the bot
to generate noise in the group and risk being muted or removed. An alternative
is a closed allow-list that ignores all users not explicitly listed, but that
prevents any public read-only interaction.

**Decision:** Implement a silent admin gate in `src/bot.ts`. A middleware
function checks whether an incoming update is a write/admin command; if it is
and the sender is not in `ADMIN_USER_IDS`, the update is dropped silently
without a reply. Public read-only commands (`/start`, `/help`, `/ping`) pass
through for all users.

**Consequences:** The bot works naturally in group chats: regular members can
use read-only commands; admin-only write commands are simply ignored for
non-admins. Adding write commands in the future requires adding them to the
`isWriteCommand()` check in `bot.ts`.

---

## ADR 5 — Railway restart policy + graceful SIGTERM, no external supervisor

**Status:** Accepted

**Context:** The bot must survive container restarts without corrupting the
SQLite WAL. Railway supports configurable restart policies (`ON_FAILURE` with a
retry limit). Node processes receive `SIGTERM` before the container is killed,
giving a window for clean shutdown.

**Decision:** Configure `railway.json` with `restartPolicyType: ON_FAILURE` and
`restartPolicyMaxRetries: 10`. In `src/index.ts`, register `SIGTERM` and
`SIGINT` handlers that stop long-polling, close the HTTP server, and call
`closeDb()`. Closing the SQLite database flushes the WAL and releases the file
lock before the process exits.

**Consequences:** No external process supervisor (PM2, systemd) is needed.
The Railway restart policy handles transient failures. Graceful shutdown keeps
the SQLite file consistent across deployments. If the process is killed with
SIGKILL (e.g., a forced Railway redeploy), WAL recovery happens automatically
on the next `initDb()` call because SQLite WAL mode is self-healing.

---

## ADR 6 — TypeScript via Node native type-stripping vs tsc build vs plain JS

**Status:** Accepted

**Context:** Node.js ≥ 22.6 (stable in Node 24) can run `.ts` files directly
by stripping type annotations at load time, with no transpilation. An
alternative is a `tsc` build step that compiles to JavaScript; another is
writing plain JavaScript from the start. A build step adds CI complexity,
output directory management, and source-map handling.

**Decision:** Run TypeScript source files directly with `node src/index.ts`
(type-stripping). `tsconfig.json` sets `erasableSyntaxOnly: true` to enforce
that all TypeScript syntax is strip-safe (no `enum`, `namespace`, or
parameter-property syntax that would require actual transformation). Type
safety is provided by `tsc --noEmit` (the `typecheck` script), which runs as
the first step of `npm test`.

**Consequences:** There is no `dist/` directory and no build command; the
repository is simpler to understand and deploy. The constraint is that only
erasable TypeScript syntax is allowed — decorators, `const enum`, and other
transforming syntax are off-limits. This is acceptable because the codebase
uses only simple type annotations, interfaces, and `as const` assertions.
