# Prayer Rooms — Stage 1 (Rooms + Topics) Design Spec

**Date:** 2026-06-16
**Status:** Approved (pending written-spec review)
**Author:** Vlad (with Claude Code)
**Builds on:** the deployed blank framework template (see `2026-06-16-prayer-bot-template-design.md`).

## 1. Context

The bot is a simple tool to plant a **continuous prayer habit** in a small church
(<20 people, occasionally more). The full product is delivered in stages; this spec
covers **Stage 1: Prayer Rooms + Topics** — the foundation everything else hangs off.

Deferred to later stages (NOT in this spec):
- **Stage 2** — daily rotation ("random taker"), per-member reminder times, per-topic
  "prayed today" confirmation, voice/video confirmation forwarded to the topic owner.
- **Stage 3** — accountability (2-day warning, 5-day auto-removal from a room).

## 2. Goals

- **Keep it simple above all.** Fewest possible steps to do anything; no jargon.
- **Self-documenting bot.** `/start` welcomes the user and explains how it works and what
  to do next; `/help` is the always-available, complete step-by-step reference. Every
  screen tells the user what to tap next.
- **Prayer Rooms**: create / join (invite) / leave / close; a person is in at most **3
  rooms total** (admin or member combined).
- **Topics**: shared (admin, ≤5 per room) and personal (member, ≤3 per room); the owner
  can post updates or mark a topic **answered** ("how we saw God answer") — the spiritual
  heart of the tool.
- Ukrainian-first, with `en`/`ru` available via the existing i18n layer.

## 3. Non-Goals (Stage 1)

- Daily rotation / assignments, reminders, "prayed" buttons, voice/video confirmation (Stage 2).
- Accountability / streaks / auto-removal (Stage 3).
- Points or leaderboards (not part of this product's motivation model — accountability +
  "see God answer" are the motivators).
- Any Telegram **group** chat integration — rooms are logical and DM-only.

## 4. Key Decisions

| # | Decision | Choice |
|---|----------|--------|
| K1 | What a room *is* | **Logical room, DM-only.** Members interact with the bot 1:1 in private; rooms are entities in the DB, joined via invite code/deep link. No Telegram group chats. |
| K2 | UX style | **Hybrid** — buttons/inline-keyboard menus are primary; a few slash shortcuts (`/start`, `/help`, `/rooms`, `/join <code>`) also work. |
| K3 | Room caps | **Combined: ≤3 rooms total** per user (admin or member). Creating a room counts as one of the 3. |
| K4 | Topic caps | Shared: **≤5 per room** (admin-owned). Personal: **≤3 per member per room**. |
| K5 | Auth model | **Per-room roles** checked in handlers (admin = room creator; member = joined). The template's global `ADMIN_USER_IDS` allow-list is **retired**; the bot is **open** (anyone who `/start`s can create rooms; joining is invite-gated). |
| K6 | Onboarding | `/start` = welcome + "how it works" instructions + menu. `/help` = full step-by-step reference, always available. |

## 5. Interaction Model & Onboarding

The bot runs in each user's **private chat** (chat.id == user.id). Hybrid UX:

- **`/start`** → upsert the user, then send a warm welcome that states the bot's purpose
  (build a daily prayer habit together) and a short **"How it works"** block:
  1. Create a prayer room, or join one with an invite link.
  2. In a room: the admin adds shared topics; you add your own personal topics (up to 3).
  3. Mark a topic **answered** when you see how God responded.
  *(A line notes that daily prayer reminders are coming soon — Stage 2.)*
  Then show the **main menu** buttons: 🏠 My Rooms · ➕ Create Room · 🔑 Join Room · ❓ Help.
- **`/help`** → the complete reference, organized **For everyone** (create/join/leave a room,
  add personal topics, post updates, mark answered) and **For room admins** (add shared
  topics, close the room), each as a short numbered step. Always reachable from the ❓ Help
  button too.
- **Slash shortcuts:** `/rooms` (= My Rooms), `/join <code>`, `/help`.
- **Deep-link join:** `t.me/<bot>?start=join_<code>` joins in one tap (handled in `/start`).
- **Multi-step input** (room name, topic text, invite code, answer note) uses a per-user
  in-memory "pending input" session (the template's Map pattern, keyed by user id). Each
  prompt is a single question; the next text message is consumed. Sessions are transient
  (lost on restart = acceptable; the user just re-taps).
- **All inline buttons** route through the single `callback_query` prefix-router using the
  `namespace:action:id` convention (e.g. `room:open:<id>`, `topic:answer:<id>`,
  `room:join:<code>`). Every list/screen is rendered with the `truncate()` + lines helpers
  and re-rendered via `safeEditMessageText`.

**Simplicity rules:** never more than one question on screen at a time; every screen ends
with a clear next action; destructive actions (leave, close) get one confirm tap; the user
can always get back to the menu.

## 6. Data Model

New tables, created idempotently in `db/connection.ts` (DDL); all queries in `db/repo.ts`
(DML). `bot_state` stays.

```sql
CREATE TABLE IF NOT EXISTS users (
  telegram_id  INTEGER PRIMARY KEY,
  display_name TEXT,
  locale       TEXT,                         -- null = bot default
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  admin_id    INTEGER NOT NULL,              -- creator/owner
  invite_code TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'active', -- 'active' | 'closed'
  created_at  TEXT DEFAULT (datetime('now')),
  closed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_rooms_invite ON rooms(invite_code);

CREATE TABLE IF NOT EXISTS room_members (
  room_id     INTEGER NOT NULL,
  telegram_id INTEGER NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  joined_at   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (room_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON room_members(telegram_id);

CREATE TABLE IF NOT EXISTS topics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     INTEGER NOT NULL,
  owner_id    INTEGER NOT NULL,
  kind        TEXT NOT NULL,                  -- 'shared' | 'personal'
  text        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active', -- 'active' | 'answered'
  answer_note TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  answered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_topics_room ON topics(room_id, status);

CREATE TABLE IF NOT EXISTS topic_updates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id   INTEGER NOT NULL,
  author_id  INTEGER NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Caps enforced in `db/repo.ts` / `rooms.ts`** (typed, with clear error results, not raw
throws): rooms per user ≤3 (count `room_members`), shared topics per room ≤5, personal
topics per (room, owner) ≤3. Schema changes are additive-only (Stage 2/3 add columns/tables).

## 7. Core Flows (Stage 1)

1. **Onboard** — `/start`: upsert user → welcome + how-it-works + menu. (If started via
   `?start=join_<code>`, run the Join flow first, then welcome.)
2. **Create room** — *Create Room* → prompt name → enforce ≤3 total → create room (creator
   becomes `admin` member), generate `invite_code` → show the room + the **invite link to
   share** and a one-line "next: add shared topics / invite people".
3. **Join room** — *Join Room* (or `/join <code>` or deep link) → prompt/parse code →
   validate (exists, active, not already a member, user <3 rooms) → add as `member` →
   confirm + show the room + "next: add your personal topic".
4. **My Rooms** — `/rooms` or *My Rooms* → list each room with role badge + topic counts →
   tap → **Room view**.
5. **Room view** — shows room name, shared topics (active + answered), the user's personal
   topics, a count of others' personal topics, member count. Buttons by role:
   - **Members:** ➕ Add personal topic (if <3) · 📝/✅ on own topics · 🚪 Leave room · ⬅ Back.
   - **Admin:** ➕ Add personal topic (if <3) · ➕ Add shared topic (if <5) · 📝/✅ on own topics
     · 🔒 Close room · ⬅ Back. The admin **closes** their own room rather than leaving it (no
     Leave button), so a room is never orphaned.
6. **Add shared topic** (admin) — prompt text → enforce ≤5 → create (`kind=shared`,
   owner=admin).
7. **Add personal topic** (member) — prompt text → enforce ≤3 → create (`kind=personal`,
   owner=member).
8. **Topic owner actions** — 📝 **Post update** → prompt → append `topic_updates`. ✅ **Mark
   answered** → prompt "How did you see God answer?" → set `status=answered`, store
   `answer_note`, stamp `answered_at`. Answered topics stay visible (celebrated), with their
   answer note shown.
9. **Leave room** (member) — confirm → delete membership + delete that user's **active**
   personal topics in the room (answered ones are kept for the record) → frees a slot.
10. **Close room** (admin) — confirm → `status=closed`, `closed_at`, DM-notify all members,
    archive (room hidden from active lists; data retained). Frees everyone's slot.

## 8. Defaults (confirmed)

- a) Join = deep-link one-tap **and** manual code entry.
- b) Leaving a room deletes the leaver's **active** personal topics there (answered kept).
- c) Closing archives the room and DM-notifies members.
- d) Bot is **open** — anyone can `/start` + create rooms; joining is invite-gated.
- e) Answered topics are **kept** and celebrated, never deleted.
- f) Invite codes = short random (~8 url-safe chars), unique; admin can regenerate (old code
  stops working).

## 9. Changes to the Existing Template

- `db/connection.ts`: add the Stage 1 `CREATE TABLE`/index statements (keep `bot_state`).
- `db/repo.ts`: add typed repo functions for users, rooms, members, topics, updates, and the
  cap counts — all SQL stays here.
- `src/rooms.ts` (**new**): room/topic domain logic — invite-code generation, cap checks,
  membership rules, state transitions — keeping `bot.ts` thin. Pure where possible (unit-testable).
- `bot.ts`: replace the `/start /help /ping` stubs with the menu, room/topic command handlers,
  the `callback_query` routes, and the per-user pending-input session Map. **Remove the global
  admin-gate `bot.use` middleware**; replace with per-room authorization checks in handlers
  (is-admin-of-room / is-member-of-room). Keep `createBot()` factory, `safeEditMessageText`,
  `bot.catch`.
- `src/menu.ts` or extend `notify.ts`: inline-keyboard builders for menu, room list, room view,
  topic actions, confirmations.
- `i18n.ts`: add all new uk/en/ru strings (welcome, how-it-works, help reference, every prompt,
  confirmation, error). Keep keys complete in all three locales.
- `config.ts`: `ADMIN_USER_IDS` is no longer the access gate; keep `ADMIN_CHAT_ID` for operator
  alerts. (Document the change in an ADR.)
- `CLAUDE.md` / `docs/USAGE.md` / `docs/architecture-decisions.md`: update for the room model,
  per-room auth, and the command/menu surface. Add ADRs: "logical DM rooms + invite codes",
  "per-room auth replaces global allow-list".

## 10. Error Handling & Edge Cases

- Cap exceeded (rooms/topics) → friendly message stating the limit and what to do.
- Invalid/expired/own/duplicate invite code → clear, specific message.
- Acting on a room/topic you're not authorized for (not admin/member/owner) → silent no-op or
  gentle "that's not available" (never a scary error); `bot.catch` remains the backstop.
- Stale inline buttons after a room is closed/left → handled by the router `default` branch
  with a "this is no longer available" reply.
- Pending-input session lost (restart) → next text is ignored gracefully; user re-taps the menu.

## 11. Testing

`node --test` over pure logic (no Telegram, in-memory SQLite via `initDb(':memory:')`):
- Cap enforcement: 4th room rejected; 6th shared / 4th personal rejected.
- Invite codes: generated unique, validated (exists/active/not-member), regeneration invalidates old.
- Membership: join/leave updates `room_members`; leave deletes leaver's active personal topics,
  keeps answered.
- Topic state transitions: active→answered sets note + timestamp; close room archives.
- Authorization helpers: is-admin / is-member resolve correctly.

## 12. Definition of Done (Stage 1)

- `npm test` (typecheck + node --test) passes; runs build-free via type-stripping.
- A user can, entirely via DM buttons (and the slash shortcuts): `/start` and immediately
  understand what to do; create a room and get an invite link; join a room via link/code;
  add shared (admin) and personal topics within the caps; post an update; mark a topic
  answered with a note; leave a room; close a room (admin).
- `/help` lists every step accurately; `/start` explains the flow.
- Per-room authorization enforced; the global allow-list is gone; bot is open + invite-gated.
- uk/en/ru strings complete; no business logic beyond Stage 1; Stage 2/3 extension points
  noted in code comments.
- Docs (CLAUDE.md, USAGE.md, ADRs) updated; deploys to the existing Railway service (same
  Volume/SQLite — schema auto-creates on boot).

## 13. Future Stages (out of scope here)

- **Stage 2:** daily rotation (same shared topic for the room each day; each member assigned
  one *other* member's personal topic, with coverage over time), per-member reminder time,
  per-topic "prayed today" button, voice/video reply forwarded to the topic owner.
- **Stage 3:** accountability — 2-day-miss warning, 5-day-miss auto-removal (admins exempt
  from their own rooms), per-room streak tracking.
