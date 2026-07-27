# Using Prayer Bot

Prayer Bot helps a small group keep a daily prayer habit together — entirely in
Telegram DMs, no group chats required. Each person joins one or more private
**prayer rooms** and tracks shared and personal topics.

Need to set up the bot first? See [SETUP.md](SETUP.md).

---

## Getting started

Send `/start` to the bot at any time to receive the onboarding welcome message and main menu, or tap the **Prayer App** menu button next to the input line in Telegram.

The onboarding message explains how to open the built-in **Telegram Mini App**, which provides a complete visual user interface inside Telegram to:
- View your **Today's Prayer Focus** and mark prayers as prayed with a single tap.
- Manage **My Rooms**: view room details, invite codes, members, shared topics, and personal topics.
- Perform room actions: **Create Room**, **Join Room**, **Add Shared/Personal Topic**, **Post Update**, **Mark Answered**, **Leave Room**, or **Close Room**.
- Configure **Notification Settings**: toggle daily reminders and pick your preferred local reminder time.

You can also use `/start`, `/help`, and `/rooms` commands at any time.

---

## Slash commands

| Command | What it does |
|---|---|
| `/start` | Shows the welcome message with Mini App onboarding instructions and main menu. Also handles invite deep-links (`?start=join_<code>`). |
| `/help` | Shows the full list of actions and commands. |
| `/rooms` | Lists your active rooms with one-tap access to each. |
| `/join <code>` | Joins a room by its invite code. Omit the code and the bot will ask for it. |

---

## Creating a room

Tap **Create room** (or use the menu after `/start`). The bot asks for a name.
Type the name and send it. The bot will:

1. Create the room and make you its **admin**.
2. Reply with a shareable invite link and a short invite code.

Share the link or code with anyone you want to invite. There is a limit of
**3 active rooms per person** (whether you created them or joined).

---

## Joining a room

- **Via invite link** — open the link (`t.me/YourBot?start=join_<code>`). The
  bot opens automatically and joins you to the room.
- **Via invite code** — send `/join <code>`, or tap **Join** and type the code
  when prompted.

Once joined, the bot shows you the room view.

---

## Inside a room

The room view shows:

- **Shared topics** — added by the admin, visible to all members.
- **Your personal topics** — added by you, visible to you.
- A count of other members' personal topics (the texts stay private).
- The total member count.

Answered topics appear with a checkmark and the answer note.

### Buttons available to every member

| Button | What it does |
|---|---|
| **My topic** | Add a personal prayer topic (up to 3 per room). |
| **Update** | Post a progress note on one of your active topics. |
| **Answered** | Mark one of your active topics as answered — type how God responded. |
| **Leave room** | Leave the room. Your active personal topics are removed. |

### Buttons available to the room admin only

| Button | What it does |
|---|---|
| **Shared topic** | Add a shared prayer topic visible to all members (up to 5 per room). |
| **Close room** | Close the room for everyone. Members receive a notification. |

Admins do not see **Leave room** — to retire a room, use **Close room** instead.

---

## Caps and limits

| What | Limit |
|---|---|
| Rooms per person (active) | 3 |
| Shared topics per room (active) | 5 |
| Personal topics per member per room (active) | 3 |

The bot replies with a clear error if a cap is reached.

---

## Daily prayer rhythm

The bot sends you a daily reminder for every topic assigned to you that day.

### Setting your reminder time

From the main menu, tap **⏰ Reminder time**. The bot will ask you to send a
time in `HH:MM` format (24-hour clock, e.g. `08:00`). Send `off` to disable
reminders.

### Timezones

Your reminder time — and every day boundary that follows from it: "today's"
topics, the **Prayed today** confirmation, and your streak — is resolved in
**your own timezone**. There is no server-wide setting, and nothing needs to be
configured by the operator.

The zone comes from the device: the Mini App reads it
(`Intl.DateTimeFormat().resolvedOptions().timeZone`) and reports it to the bot
every time you open the app, so it also follows you when you travel or move.

**Open the Mini App once** — via the menu button next to the input field, or the
**Prayer App** button under `/start`. Until you do, the bot has no way to learn
your zone and falls back to UTC; Telegram itself never sends it. Members of the
same room may live in different zones, and each one's day starts and ends on
their own clock.

### Receiving reminder messages

At your set time, the bot sends you one message per assigned topic in each of
your rooms:

- A **shared topic** (today's room topic, rotated daily in order among all active
  shared topics).
- A **personal topic** (one other member's personal topic, also rotated so that
  every topic is covered over a full cycle).

Each assigned-topic message carries a **🙏 Prayed today** button. Tap it to
record that you prayed for that topic.

If a room has no shared topic and no other member's personal topic for you,
the bot still sends a plain daily prayer-time nudge. There is no confirmation
button because no topic can be assigned. You are not warned or removed for
missed prayers in that room until an eligible topic exists.

If the bot was restarted or a minute was missed, the next tick catches up
automatically — you will still receive your reminders.

### Gentle accountability

The bot sweeps active non-admin members every hour, and for each one it counts
completed calendar days **in that member's own timezone** without a recorded
**Prayed today** confirmation for that room:

- After **two** consecutive missed days, the member receives a private warning.
- After **five** missed days, the bot removes the member only if that warning
  was sent at least three days earlier. This ensures a warning always comes
  first, including after a restart or deployment outage.

Recording a prayer resets the missed-day streak. Room admins are not evaluated
or removed by this automatic process.

### Confirming to the topic owner

After receiving a reminder, you can reply to it with a **voice note, video, or
video note** to encourage the person who submitted the topic. The bot will
forward your media to the topic's owner with a caption showing your first name
and the topic text. Shared-topic confirmations go to the room admin.

The bot does not forward your reply to yourself (self-forward is suppressed).

---

## Languages

The bot replies in the language set by the server's `DEFAULT_LOCALE` variable.
Available languages:

| Value | Language |
|---|---|
| `uk` | Ukrainian (default) |
| `en` | English |
| `ru` | Russian |

Per-user language switching is on the roadmap.
