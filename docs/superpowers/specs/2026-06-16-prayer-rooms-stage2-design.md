# Prayer Rooms — Stage 2 (Daily Rotation + Reminders + Confirmation) Design Spec

**Date:** 2026-06-16
**Status:** Approved — design decisions resolved (§7); ready for an implementation plan.
**Builds on:** Stage 1 (rooms + topics).

## 1. Context

Stage 1 gives rooms and topics. Stage 2 adds the **daily prayer rhythm**: each day every
member is handed a small, concrete prayer assignment and a one-tap way to confirm they
prayed, plus a way to encourage the topic owner. This is what turns the tool into a habit.

## 2. Goals

- Each day, per room, a member receives **1 shared topic** (the *same* one for everyone in
  the room that day) **+ 1 other member's personal topic** to pray for. Across ≤3 rooms →
  ≤3 shared + ≤3 personal per day.
- **Coverage promise:** if you post a personal topic, someone *will* pray for it — every
  active personal topic gets prayed for (over a rotation cycle, not necessarily same-day).
- **Personal reminder time:** each member chooses when the bot sends the day's assignments.
- **Confirmation:** each assigned topic arrives as its **own message** with a **"🙏 Prayed
  today"** button.
- **Encouragement:** replying to an assignment message with **voice/video** forwards it to
  that topic's **owner** as a confirmation someone is praying.

## 3. Non-Goals

- Accountability / warnings / auto-removal (Stage 3).
- Points / leaderboards.

## 4. Requirements (from the product owner, verbatim intent)

- Daily one member has 1 shared topic + 1 someone's personal topic to pray for (more if in
  multiple rooms, capped by the 3-room limit → max 3 + 3).
- All shared topics are the same for today for everyone in a room.
- Each member prays for *someone else's* personal topic; build trust that a posted personal
  topic is always received by someone as a prayer.
- The daily reminder time is personally adjustable.
- Send each assigned topic as a separate message with a "mark prayed today" button.
- A voice/video reply to that message is re-sent to the topic owner as confirmation.

## 5. Data Model Additions (additive to Stage 1)

```sql
-- users gains scheduling prefs
ALTER TABLE users ADD COLUMN timezone        TEXT;     -- IANA, e.g. Europe/Podgorica
ALTER TABLE users ADD COLUMN reminder_time    TEXT;    -- 'HH:MM' local
ALTER TABLE users ADD COLUMN reminder_enabled INTEGER DEFAULT 1;

-- the per-member daily assignment (one row per member per room per day)
CREATE TABLE daily_assignment (
  date             TEXT NOT NULL,           -- 'YYYY-MM-DD' (boundary tz: see O3)
  room_id          INTEGER NOT NULL,
  telegram_id      INTEGER NOT NULL,
  shared_topic_id  INTEGER,                 -- the room's shared topic of the day
  personal_topic_id INTEGER,               -- someone else's personal topic (nullable; see O2)
  created_at       TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (date, room_id, telegram_id)
);

-- prayer confirmations (drives owner encouragement now + Stage 3 accountability)
CREATE TABLE prayer_log (
  telegram_id INTEGER NOT NULL,
  room_id     INTEGER NOT NULL,
  topic_id    INTEGER NOT NULL,
  prayed_date TEXT NOT NULL,                -- 'YYYY-MM-DD'
  prayed_at   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (telegram_id, topic_id, prayed_date)   -- idempotent: one mark per topic/day
);
```

## 6. Mechanics (high level)

- **Day boundary:** a single bot timezone (`Europe/Podgorica`, the configured `TZ`) defines
  "today", the daily rollover, and the reminder clock for everyone. (Per-member timezones may
  be added later.)
- **Daily assignment generation, per room (precomputed once at the daily rollover):**
  - *Shared topic of the day:* rotate the admin's **active** shared topics in order (by day),
    same for every member; if the chosen one is answered, advance to the next active.
  - *Personal topic:* assign each member **one other member's** active personal topic, rotating
    day-to-day so every active personal topic is covered within a cycle; never the member's own;
    a room with only the admin → no personal assignment that day; a member with zero personal
    topics still receives assignments to pray for others.
  - Written to `daily_assignment` rows (one per member per room per day).
- **Reminder delivery:** each member has **one** daily `reminder_time` (bot tz). The node-cron
  job fires per due member and sends the day's assignments as **separate messages — one per
  assigned topic** across all the member's rooms (up to 3 shared + 3 personal). Each message
  shows the topic (+ which room) and a "🙏 Prayed today" button; the member acts on each
  independently, at any time during the day.
- **Prayed button:** upserts `prayer_log` (idempotent per topic/day) and acknowledges.
- **Voice/video reply:** a voice/video reply to an assignment message is forwarded to that
  topic's **owner** (personal → the posting member; shared → the room admin), **named**
  ("{name} prayed for your topic"). Skipped gracefully if the owner has left or the topic is
  answered/closed.

## 7. Resolved Design Decisions

- **R1 — Shared topic of the day:** rotate the admin's **active** shared topics **in order** by
  day (predictable, fair); if the next-in-order is answered, advance to the next active one.
- **R2 — Personal assignment & coverage:** **one** other member's active personal topic per
  member per day, rotated so every active personal topic is covered **within a cycle** (not
  necessarily same-day); never self; edge cases as in §6 (admin-only room → no personal that
  day; zero-personal member still prays for others; answered/owner-left topics drop out of the
  rotation).
- **R3 — Day boundary / timezone:** a **single bot timezone** (`Europe/Podgorica`) for "today",
  the rollover, reminders, and (Stage 3) streak boundaries. Per-member timezones deferred.
- **R4 — Generation timing:** **precompute** the day's assignments per room at one daily
  rollover job (keeps the shared topic consistent across the room).
- **R5 — Confirmation visibility:** **named** — the owner sees who prayed. Forward voice notes,
  video, and video-notes. Shared-topic confirmations go to the room admin (kept simple).
- **R6 — Reminder & delivery:** **one** daily reminder time per member (settable from the
  menu); at that time the bot sends **one message per assigned topic** (not combined, not
  per-room) — because the prayed-button and the voice/video reply are per-topic, and a member
  may pray for different topics at different times.

## 8. Testing (anticipated)

Pure-logic unit tests (no Telegram): the assignment algorithm (no self-assignment, fairness,
full coverage within a cycle, edge cases from O2), timezone/`reminder_time` "is it due now"
math, `prayer_log` idempotency.

## 9. Definition of Done (Stage 2)

Members receive their daily assignment messages at their chosen time; can mark each prayed
(idempotent); a voice/video reply reaches the topic owner; every active personal topic is
provably prayed for within one rotation cycle; reminder time is settable from the menu.
