# 🙏 Prayer Bot

A free, open-source Telegram bot for churches and small groups: organize prayer
topics, send reminders, and keep everyone encouraged with gentle gamification.
Deploy your own in about 10 minutes — no coding required.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Status:** framework template. The core bot runs today (`/start`, `/help`,
> `/ping`); prayer topics, reminders, and gamification are on the roadmap.

---

## Who it's for

Prayer Bot is built for **churches, ministries, and small groups** that want a
private Telegram bot they fully control — no third-party server storing your
members' prayer requests. You host it on your own account; your data stays yours.

---

## Features

**Available today**

- `/start`, `/help`, `/ping` commands in Ukrainian, English, and Russian
- Health check endpoint so Railway can monitor that the bot is running
- Durable storage: prayer data is saved to SQLite on a Railway Volume and
  survives restarts and redeployments

**On the roadmap**

- Prayer topic submissions and a shared prayer list
- Scheduled reminders (daily, weekly, or custom timing)
- Streaks and leaderboards to keep the group encouraged

---

## Deploy your own (~10 minutes)

All you need is a free [Railway](https://railway.com) account and a Telegram bot
token from [@BotFather](https://t.me/BotFather). No coding, no local setup.

Full step-by-step instructions: **[docs/SETUP.md](docs/SETUP.md)**

---

## Using the bot

Once deployed, send `/help` to your bot in Telegram to see all available
commands.

Full command reference: **[docs/USAGE.md](docs/USAGE.md)**

---

## Run locally (for developers)

<details>
<summary>Expand local development instructions</summary>

**Requirement: Node ≥ 24** (the bot runs directly via Node's built-in TypeScript
support — no build step needed).

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/prayer-bot.git
cd prayer-bot

# 2. Install dependencies
npm install

# 3. Copy the example environment file and fill in your bot token
cp .env.example .env
# Open .env and set TELEGRAM_BOT_TOKEN=<your token from BotFather>

# 4. Start the bot
npm start

# 5. Run the test suite (type-checks + unit tests)
npm test
```

</details>

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for
guidelines on how to set up your environment, run tests, and open a pull request.

---

## License

MIT — see [LICENSE](LICENSE).
