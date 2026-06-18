# Stage 2 — Manual QA Test Cases (Daily Rotation, Reminders, Confirmation)

Reusable checklist for the full QA pass. Best with **two Telegram accounts** (A = room
admin, B = member) sharing a room that already has a few **shared** topics (A) and
**personal** topics (A and B). Single bot timezone is **Europe/Podgorica**.

**Quick-test tip:** reminders fire when *local time ≥ your reminder time* and you haven't
been sent today. So set your reminder to a time **a minute or two in the past** (e.g. current
time minus 2 min) — within a minute the dispatcher sends that day's messages. No need to wait
for a future time.

## Reminder time
- [ ] **TC-S2-01** Menu → **⏰ Reminder time** → send `08:00` → "Reminder set for 08:00". Send `off` → "Reminders disabled". Send `9am` (bad) → "Invalid format".

## Daily delivery
- [ ] **TC-S2-02** With a reminder set (see quick-test tip), you receive **one message per assigned topic** — one **shared** + one **personal** per room — each with a **🙏 Prayed today** button. (Up to 3 shared + 3 personal if in 3 rooms.)
- [ ] **TC-S2-03** A and B receive the **same** shared topic that day (shared-of-the-day is one per room).
- [ ] **TC-S2-04** The **personal** topic you're sent is **someone else's**, never your own.
- [ ] **TC-S2-10** A member with **no reminder time set** receives nothing.
- [ ] **TC-S2-13** A member in 2–3 rooms gets per-topic messages for **each** room.

## Prayed confirmation
- [ ] **TC-S2-05** Tap **🙏 Prayed today** → "Counted for today". Tap again → "Already counted for today".
- [ ] **TC-S2-08** You are **not** re-sent the same day — after the first delivery, subsequent minutes send nothing (idempotent).

## Voice/video → owner
- [ ] **TC-S2-06** Reply to one of your **personal**-topic assignment messages with a **voice note** (or video / video-note) → the **owner of that topic** (another member) receives the media with caption "**{your name} prayed for your topic: …**".
- [ ] **TC-S2-07** Reply with voice/video to a **shared**-topic assignment message → it goes to the **room admin** (the shared topic's owner).
- [ ] **TC-S2-14** Replying with voice/video to a **non-assignment** message (e.g. a normal chat message) does nothing (no crash, no forward).

## Rotation & lifecycle
- [ ] **TC-S2-11** Over consecutive days: the **shared** topic rotates **in order**; **personal** assignments rotate so every active personal topic is prayed for within a cycle. *(Verify across a few days, or by inspecting that day-to-day assignments differ.)*
- [ ] **TC-S2-12** Mark a topic **answered** (Stage 1) → it **no longer appears** in the next day's assignments.
- [ ] **TC-S2-09 (catch-up)** If the bot is redeployed/down during your reminder minute, you still get that day's messages once it's back (time ≥ reminder AND not-yet-sent), not skipped.
- [ ] **TC-S2-15 (stale)** Tapping 🙏 on a message whose topic was since answered/removed → graceful ("no longer available"), no crash.

## Notes column (fill during QA)
| TC | Pass? | Note / improvement idea |
|----|-------|-------------------------|
|    |       |                         |
