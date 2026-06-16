# Prayer Rooms — Stage 3 (Accountability) Design Spec

**Date:** 2026-06-16
**Status:** Draft — vision captured while fresh; **open design decisions (§6) must be
resolved before an implementation plan is written.**
**Builds on:** Stage 1 (rooms + topics) and Stage 2 (daily assignments + `prayer_log`).

## 1. Context

To sustain the habit, the bot gently holds members accountable: a nudge when you start
slipping, and — if prayer stops entirely — removal from the room so a room stays a circle of
people who actually pray for each other. Accountability is the motivation model (alongside
the joy of marking topics **answered**); there are no points or leaderboards.

## 2. Requirements (from the product owner, verbatim intent)

- If a member does not pray **2 days in a row** → the bot sends a **warning** about potential
  removal from that room.
- If a member does not pray **5 days in a row** (the 2 days before the warning + 3 days
  after) → the member is **automatically removed** from that room.
- This is **per room** (you're removed from the room where you went silent).
- "Pray" = the member marked at least one assigned topic as prayed that day in that room
  (a `prayer_log` row for that room/day — from Stage 2).
- A room **admin is exempt** from auto-removal in their **own** room (a room is never
  orphaned).
- Any prayer resets the miss-streak to zero.

## 3. Behaviour

- A daily job (the scheduler) evaluates each active, non-admin membership: compute the
  member's **consecutive missed days** in that room (a day with no `prayer_log` for the room,
  in the member's timezone).
- At **miss-streak = 2** → send the warning once (idempotent — don't re-warn each day).
- At **miss-streak = 5** → remove: delete the membership and the member's **active** personal
  topics in that room (mirroring Stage 1 "leave"; answered topics are kept), free their room
  slot, and DM both the **removed member** and the room **admin**.
- Removal is not a ban — the person can be re-invited and rejoin later.

## 4. Data Model

Streaks are derivable from `prayer_log` (Stage 2), but for efficient daily evaluation and
idempotent warnings, add a small per-membership state row:

```sql
CREATE TABLE membership_state (
  room_id          INTEGER NOT NULL,
  telegram_id      INTEGER NOT NULL,
  last_prayed_date TEXT,                 -- 'YYYY-MM-DD' of last prayer in this room
  miss_streak      INTEGER DEFAULT 0,    -- consecutive missed days
  warned_at        TEXT,                 -- date the 2-day warning was sent (null = not warned)
  PRIMARY KEY (room_id, telegram_id)
);
```

(Updated as part of the daily evaluation; `prayer_log` remains the source of truth.)

## 5. Reconcile-on-boot interaction

The template already has a `reconcileOnBoot()` seam. Because the daily job may be missed
during a Railway redeploy, evaluation must be **idempotent and catch-up safe**: on boot and
on each daily tick, recompute streaks from wall-clock dates (not "assume the job ran each
day"), so a missed tick doesn't wrongly skip a warning/removal or double-act.

## 6. Open Design Decisions (RESOLVE BEFORE PLANNING)

- **O1 — Exact day counting.** Pin down the "2 before + 3 after" wording into precise rules:
  warn when `miss_streak == 2`; remove when `miss_streak == 5`. Confirm a "missed day" is a
  full local day with no prayer, and how the join day / partial first day is treated.
- **O2 — Day boundary / timezone.** Use the member's timezone (tie to Stage 2 O3) so the
  daily boundary is consistent across reminders, assignments, and accountability.
- **O3 — New-member grace.** Do not warn/remove during the first day(s) after joining (no
  assignments have had a chance to be prayed yet). Define the grace window.
- **O4 — Warning idempotency & reset.** Warn once per streak (use `warned_at`); reset
  `miss_streak`/`warned_at` to zero on any prayer.
- **O5 — Admin exemption scope.** Confirm admins are exempt only in **their own** room (a
  person who is a plain member of another room is still subject there).
- **O6 — Edge cases.** Removal that would leave a room with only the admin (allowed). A
  member in multiple rooms is evaluated per room independently. Notification wording (warm,
  not punitive — the tone matters for a church).

## 7. Testing (anticipated)

Pure-logic unit tests: streak computation from a sequence of prayed/missed dates (incl. tz
boundary), warn-at-2 once (idempotent), remove-at-5, prayer resets the streak, admin
exemption, new-member grace, and catch-up safety after a missed daily tick.

## 8. Definition of Done (Stage 3)

A non-admin member who misses 2 consecutive days gets exactly one warning; missing 5
consecutive days removes them from that room (with member + admin notified, personal topics
handled like "leave"); any prayer resets the streak; admins are never auto-removed from their
own rooms; evaluation is correct even if a daily tick was missed during a redeploy.
