# Using Prayer Bot

Prayer Bot helps a small group keep a daily prayer habit together — entirely in
Telegram DMs, no group chats required. Each person joins one or more private
**prayer rooms** and tracks shared and personal topics.

Need to set up the bot first? See [SETUP.md](SETUP.md).

---

## Getting started

Send `/start` to the bot at any time. You will see a welcome message that
explains how rooms and topics work, followed by a menu with four buttons:

- **My rooms** — view the rooms you belong to.
- **Create room** — create a new prayer room (you become its admin).
- **Join** — join a room using an invite link or code.
- **Help** — show the full command reference.

You can also use `/start`, `/help`, and `/rooms` as slash commands at any time.

---

## Slash commands

| Command | What it does |
|---|---|
| `/start` | Shows the welcome message and main menu. Also handles invite deep-links (`?start=join_<code>`). |
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

## Languages

The bot replies in the language set by the server's `DEFAULT_LOCALE` variable.
Available languages:

| Value | Language |
|---|---|
| `uk` | Ukrainian (default) |
| `en` | English |
| `ru` | Russian |

Per-user language switching is on the roadmap.
