# Prayer Rooms — Stage 2 (Daily Rotation + Reminders + Confirmation) Design Spec

**Date:** 2026-06-16
**Status:** Draft — vision captured while fresh; **open design decisions (§7) must be
resolved before an implementation plan is written.**
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

- **Daily assignment generation, per room:** at the day boundary, pick the room's shared
  topic of the day and compute each member's personal-topic assignment, writing
  `daily_assignment` rows.
- **Reminder delivery:** the scheduler (node-cron, already in the template) fires; at each
  member's `reminder_time` (in their `timezone`) it sends that member's assignment messages
  (one per assigned topic) with the "🙏 Prayed today" button.
- **Prayed button:** upserts `prayer_log` (idempotent per topic/day) and acknowledges.
- **Voice/video reply:** map the replied-to message → topic → owner; forward the media to the
  owner's DM as encouragement.

## 7. Open Design Decisions (RESOLVE BEFORE PLANNING)

- **O1 — Shared-topic-of-the-day selection.** Rotate through the admin's 1–5 shared topics
  in order (fair, predictable — *recommended*) vs random pick. Behaviour when a shared topic
  is marked answered mid-cycle.
- **O2 — Personal-topic assignment & coverage algorithm.** Each member prays for one other
  member's personal topic per day. Since a room can have more personal topics than members,
  "everyone's topic is prayed for" is a guarantee **over a rotation cycle**, not necessarily
  every day. Define the matching: round-robin/rotation that (a) never assigns your own topic,
  (b) is fair, (c) guarantees every active personal topic is covered within N days. Edge
  cases: a room with only the admin (no other's personal topic → no personal assignment that
  day); a member with zero personal topics (still prays for others); a topic answered/owner
  left mid-cycle.
- **O3 — Day boundary / timezone.** "Today" and the daily rollover: per-user timezone
  (recommended for reminders/streaks) — but the *shared* topic of the day must be consistent
  for the whole room, so reconcile (e.g. the room's shared rotation advances on the **admin's
  tz**, while each member's "today" for their own marks uses their tz). Pick one model and
  make it explicit.
- **O4 — Generation timing.** Precompute the day's assignments per room at a single rollover
  job, vs compute lazily when a member's reminder fires. (Precompute is simpler to reason
  about for the shared-topic consistency.)
- **O5 — Voice/video confirmation details.** Is the pray-er shown to the owner by name or
  kept anonymous ("a member of your room prayed for this")? Which media types (voice note,
  video, video-note)? Behaviour if the owner has left or the topic is answered.
- **O6 — Reminder UX.** Default reminder time; one combined daily reminder across all the
  member's rooms vs one per room; snooze; how the member sets/changes the time (menu).

## 8. Testing (anticipated)

Pure-logic unit tests (no Telegram): the assignment algorithm (no self-assignment, fairness,
full coverage within a cycle, edge cases from O2), timezone/`reminder_time` "is it due now"
math, `prayer_log` idempotency.

## 9. Definition of Done (Stage 2)

Members receive their daily assignment messages at their chosen time; can mark each prayed
(idempotent); a voice/video reply reaches the topic owner; every active personal topic is
provably prayed for within one rotation cycle; reminder time is settable from the menu.
