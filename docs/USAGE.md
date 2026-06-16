# Using Prayer Bot

This page lists all commands your Prayer Bot understands. More commands will be
added as features are built — check back as the project grows.

Need to set up the bot first? See [SETUP.md](SETUP.md).

---

## Commands

| Command | What it does |
|---|---|
| `/start` | Introduces the bot and shows a welcome message. |
| `/help` | Lists all available commands. |
| `/ping` | Checks that the bot is online. The bot replies `pong`. |

---

## Admin commands

Some commands are restricted to group admins. To enable admin access, set the
`ADMIN_USER_IDS` environment variable in Railway to a comma-separated list of
Telegram user IDs (see [SETUP.md](SETUP.md) Step 4).

If a user who is not in that list sends an admin command, the bot stays silent
rather than replying with an error. This avoids disruption in group chats.

---

## Language

The bot's reply language is set by the `DEFAULT_LOCALE` variable:

| Value | Language |
|---|---|
| `uk` | Ukrainian (default) |
| `en` | English |
| `ru` | Russian |

Per-chat language switching (so each chat can use a different language) is on
the roadmap.
