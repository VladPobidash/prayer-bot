# Stage 3 — Manual QA Test Cases (Accountability)

Best with two Telegram accounts (A = admin, B = member) in one room with topics.
Bot timezone **Europe/Podgorica**; the daily sweep runs at **09:00** (and once on boot).

**Quick-test tip:** streaks derive from `prayer_log` dates and `room_members.joined_at` —
to simulate history, backdate `joined_at` / insert `prayer_log` rows in the DB, then
trigger the sweep by redeploying (boot catch-up) instead of waiting for 09:00.

## Warning
- [ ] **TC-S3-01** B misses 2 full days (no 🙏 in that room) → after the next sweep B gets one warm warning naming the room; A gets nothing.
- [ ] **TC-S3-02** Sweep runs again the same day (redeploy) → no second warning.
- [ ] **TC-S3-03** After the warning, B taps 🙏 → next sweep: no warning, streak reset; a later 2-day miss warns again (fresh cycle).

## Removal
- [ ] **TC-S3-04** B keeps missing: 5 consecutive missed days AND ≥3 days after the warning → B is removed from that room; B and A both receive a DM; B's active personal topics are gone, answered ones remain.
- [ ] **TC-S3-05** B can rejoin with a fresh invite code and gets join-day grace again.
- [ ] **TC-S3-06** A (room admin) never prays → never warned/removed in their own room.
- [ ] **TC-S3-07** A room where removal leaves only the admin is fine (room stays active).

## Grace & multi-room
- [ ] **TC-S3-08** A brand-new member is not warned on their first days (counting starts the day after joining).
- [ ] **TC-S3-09** A user in two rooms who prays only in room 1 is warned/removed only in room 2.

## Catch-up
- [ ] **TC-S3-10** Bot down across 09:00 → on boot the sweep runs once; a member at streak ≥5 who was never warned gets a warning (not silent removal); removal follows ≥3 days later if the silence continues.

## Notes column (fill during QA)
| TC | Pass? | Note / improvement idea |
|----|-------|-------------------------|
|    |       |                         |
