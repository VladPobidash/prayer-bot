# Stage 1 — Manual QA Test Cases (Prayer Rooms + Topics)

Short, reusable checklist for the **full QA pass** (run once all stages are built, before the
improvements round). Best with **two Telegram accounts**: **A** = room admin/creator, **B** =
joining member. All bot replies should be in **Ukrainian** (default locale). Bot: the live
Railway deployment (or a local `npm start`).

## Onboarding
- [ ] **TC-01** `/start` → welcome + "how it works" + menu buttons (🏠 My Rooms · ➕ Create Room · 🔑 Join Room · ❓ Help).
- [ ] **TC-02** `/help` → full step-by-step reference (for everyone / for admins). `/rooms` opens My Rooms.

## Create & invite (account A)
- [ ] **TC-03** Create Room → enter a name → room created; **invite link + code** shown; room view shows admin buttons (➕ Shared topic, 🔒 Close room).
- [ ] **TC-04 (cap)** While already in 3 rooms, create/join a 4th → refused with "max 3 rooms".

## Join (account B)
- [ ] **TC-05** B opens the invite **deep link** (`?start=join_<code>`) → joins → room view with **member** buttons (➕ My topic, 🚪 Leave); **no** Close button.
- [ ] **TC-06** B uses `/join <code>` manually → joins the same way.
- [ ] **TC-07** Bad code → "invalid invite"; re-joining → "already in this room"; code of a closed room → "room is closed". Each is a friendly message, no crash.

## Topics
- [ ] **TC-08** A adds a **shared** topic → appears in the Shared section. Adding a **6th** → refused (limit 5).
- [ ] **TC-09** B adds a **personal** topic → appears in B's Personal section. Adding a **4th** → refused (limit 3).
- [ ] **TC-10** Room view renders: Shared section, viewer's Personal section, "others' personal topics: N", members count.

## Updates & answered (the heart of it)
- [ ] **TC-11** Topic owner picks own topic → 📝 post an update → confirmed.
- [ ] **TC-12** Topic owner picks own topic → ✅ mark answered → enters "how God answered" → topic shows ✅ with the answer note, and **stays visible**.
- [ ] **TC-13** A non-owner tries to update/answer a topic that isn't theirs → "only the owner can do that" (the picker only offers your own active topics).

## Leave & close
- [ ] **TC-14** B taps 🚪 Leave → confirm Yes → membership removed; B's **active** personal topics gone from the room; **answered** ones kept; B's room slot freed.
- [ ] **TC-15** A taps 🔒 Close → confirm Yes → other members receive a "room was closed" DM; room disappears from active lists; everyone's slot freed.
- [ ] **TC-16** A (admin) has **no Leave** button (closes instead); B (member) has **no Close** button.

## Authorization & misc
- [ ] **TC-17** B (member) cannot add a shared topic or close the room (admin-only) → refused if attempted.
- [ ] **TC-18** Tapping a **stale** inline button (after the room was closed/left) → "no longer available", no crash.
- [ ] **TC-19 (ops)** `GET /health` → `{"status":"ok"}`.

## Notes column (fill during QA)
| TC | Pass? | Note / improvement idea |
|----|-------|-------------------------|
|    |       |                         |
