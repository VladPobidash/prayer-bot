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

---

## ADR 7 — Logical DM prayer rooms joined by invite code (no Telegram groups)

**Status:** Accepted

**Context:** Shared prayer tracking could be implemented as a Telegram group bot (the bot joins a group chat), or as logical "rooms" managed entirely in DMs. A group-based approach ties the feature to Telegram group permissions, group admin rights, and the noise of a shared chat history.

**Decision:** Implement prayer rooms as logical entities in SQLite, joined by sharing an 8-character invite code or a `?start=join_<code>` deep-link. All bot interaction happens in each user's private DM with the bot; no Telegram group is created or required.

**Consequences:** Users keep their prayer activity private; there is no shared chat to scroll through. The invite code fits naturally in a message or link. The trade-off is that users cannot see each other's personal topics (only a count is shown), which is intentional for privacy. Adding group-chat support in a future version would require a separate handler path but does not affect the DM flow.

---

## ADR 8 — Per-room authorization replaces the global allow-list

**Status:** Accepted

**Context:** The original `bot.ts` used a global `ADMIN_USER_IDS` middleware that silently dropped commands from users not on the list. With prayer rooms, every registered user can create and own rooms, so a global allow-list is too coarse — it would block legitimate members.

**Decision:** Remove the global allow-list middleware. Authorization is now enforced per room inside each handler using `rooms.isRoomAdmin(userId, roomId)` and `rooms.isRoomMember(userId, roomId)`. Any Telegram user who messages the bot can create or join rooms; admin-level actions (add shared topic, close room) are gated on the user being the room creator.

**Consequences:** The bot is open to anyone who can find or be given the invite code, which is the intended behaviour for a small-group prayer tool. There is no server-side user deny-list. If rate-limiting or abuse prevention is needed in the future, it can be added as a separate concern without changing the per-room auth model.

---

## ADR 9 — Self-documenting bot: /start instructions + /help reference

**Status:** Accepted

**Context:** A Telegram bot's feature surface is not easily discoverable without documentation baked into the bot itself. Users arriving via an invite link have no prior context.

**Decision:** `/start` always shows a concise "how it works" explanation followed by the main action menu. `/help` shows the complete command and action reference. Both are available at any time and are driven by `i18n.ts` so they appear in the user's configured language. No external onboarding document is required to start using the bot.

**Consequences:** New users landing on the bot via a deep-link join (`?start=join_<code>`) are onboarded immediately — the join succeeds and the welcome text explains the next steps. Keeping the strings in `i18n.ts` means the docs and the bot stay in sync automatically; there is no separate content layer to maintain.

---

## ADR 10 — Daily assignments precomputed per room; in-order shared rotation + personal rotation for cycle coverage

**Status:** Accepted

**Context:** Each member needs to receive one shared and one personal topic per day. The assignments must be deterministic (same result on any process that runs the same day), fair (all topics are eventually covered), and efficient (no cross-room joins at send time).

**Decision:** Assignments are precomputed per room per date using two rotation strategies. The shared topic of the day is selected by `dayNumber(date) % activeShared.length` — a simple modulo index that advances one slot per calendar day. Personal topics use an offset-rotation (`(memberIndex + dayNum + k) % topics.length`) that skips self-assignment and guarantees that every topic is covered within a full cycle of days. Results are stored in the `daily_assignment` table (upsert, idempotent). The reminder dispatcher triggers generation on first touch for each room, so no background precompute job is needed.

**Consequences:** Assignments are stable within a day regardless of how many times the dispatcher runs. Adding a new topic mid-cycle does not invalidate past assignments. The trade-off is that very large rooms or topic lists may produce repetitive patterns until the cycle length increases; this is acceptable for the small-group target (≤20 members, ≤5 shared + ≤3×n personal topics).

---

## ADR 11 — Per-minute reminder dispatch; due = local-time-reached AND not-sent-today (catch-up safe)

**Status:** Accepted

**Context:** Reminders must fire at each member's chosen time. Missed ticks (process restart, redeploy, a skipped cron minute) must not silently drop messages for that day.

**Decision:** The scheduler fires a node-cron job every minute. Each tick calls `dispatchDueReminders(now, tz, send)`. A user is "due" when their local `HH:MM` (derived from `now` in `config.tz`) is greater than or equal to their `reminder_time` AND the `sent_assignment` table has no row for `(chat_id, sent_date)`. Because the check is `>=` rather than `==`, any tick after the due minute — even hours later after a restart — will still deliver the reminder for that day.

**Consequences:** Each user receives at most one batch of reminder messages per calendar day (idempotency enforced by the `sent_assignment` table). The per-minute polling adds negligible load for small user counts. A timezone-aware `localDate` / `localTime` helper using `Intl.DateTimeFormat` avoids manual UTC-offset arithmetic.

---

## ADR 12 — `sent_assignment` table: dispatch idempotency + voice-reply-to-owner mapping

**Status:** Accepted

**Context:** Two problems share the same table: (1) the dispatcher must not re-send a reminder the user already received today; (2) when a user replies to a reminder with a voice or video note, the bot must look up which topic the original message was about and who owns it.

**Decision:** `sent_assignment(chat_id, message_id, topic_id, room_id, sent_date)` is written immediately after each `sendMessage` call succeeds, keyed by `(chat_id, message_id)`. `hasSentToday(chatId, date)` queries the indexed `(chat_id, sent_date)` pair for idempotency. `getSentByMessage(chatId, messageId)` retrieves the topic/room for the voice-reply handler in `bot.ts`.

**Consequences:** A single small table serves both concerns cleanly. If a `sendMessage` call fails, no row is written, so that topic will be retried on the next tick (per-send resilience). The table grows one row per topic per user per day; at small scale this is negligible and can be pruned by a future maintenance job.

---

## ADR 13 — Single bot timezone for Stage 2

**Status:** Accepted

**Context:** Supporting per-user timezones requires storing each user's IANA timezone string, converting all reminder times on every dispatch tick, and handling DST transitions per user. For Stage 2 the target community is geographically concentrated.

**Decision:** A single IANA timezone (`config.tz`, defaulting to `UTC`, set to `Europe/Podgorica` in production) is used for all `localDate` / `localTime` calculations. Members set their reminder time as an `HH:MM` wall-clock time interpreted in this shared timezone.

**Consequences:** All members experience the same DST transitions. Members in significantly different timezones cannot set an accurate local reminder time. Per-user timezone support is deferred to a future ADR; when added, it requires only adding a `timezone` column to `users` and passing it through `dispatchDueReminders` — no structural change to `sent_assignment` or the scheduler.
