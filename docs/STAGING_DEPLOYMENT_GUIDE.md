# Railway Staging & Production Multi-Environment Setup

This guide details how to configure a two-tier continuous deployment setup on Railway with GitHub:

1. **Dev / Staging Environment**: Automatically deployed from the `develop` branch to a live static HTTPS URL for your `@MyPrayerDevBot`.
2. **Production Environment**: Automatically deployed from the `main` branch to your live production URL for your Main Bot.

---

## Environment Architecture Overview

| Environment | GitHub Branch | Telegram Bot | Railway Public Domain | SQLite Database |
|---|---|---|---|---|
| **Dev / Staging** | `develop` | `@MyPrayerDevBot` | `https://prayer-bot-dev.up.railway.app` | `/data/prayer-bot-dev.db` |
| **Production** | `main` | `@YourMainBot` | `https://prayer-bot-production-58d7.up.railway.app` | `/data/prayer-bot.db` |

---

## 1. Railway Dev Environment Setup (5 Minutes)

### Step 1 — Create Dev Environment in Railway
1. Open your project on [Railway.app](https://railway.app).
2. Click on your project name at the top.
3. Click **+ New Environment** (or environment dropdown) and name it **Dev** (or **Staging**).
4. Click **New Service** → **GitHub Repo** → select `prayer-bot`.

### Step 2 — Set GitHub Branch to `develop`
1. In the newly created **Dev service**, go to **Settings → Source Repo / Branch**.
2. Change the deployment branch from `main` to **`develop`**.
3. Save. Railway will now trigger automatic deployments whenever commits are pushed to `develop`.

### Step 3 — Add Volume & Environment Variables (Dev Environment)
1. In **Settings → Volumes**, add a volume with mount path `/data`.
2. In the **Variables** tab, set:
   ```env
   TELEGRAM_BOT_TOKEN=your_dev_bot_token_from_botfather
   DB_PATH=/data/prayer-bot-dev.db
   WEBAPP_URL=https://prayer-bot-dev.up.railway.app
   ```
3. In **Settings → Networking**, generate a public domain (e.g. `prayer-bot-dev.up.railway.app`).

---

## 2. One-Time BotFather Setup

Once your Railway Dev environment generates its domain (e.g., `https://prayer-bot-dev.up.railway.app`):

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/mybots` → select your **Dev Bot** (`@MyPrayerDevBot`).
3. Tap **Bot Settings** → **Menu Button** → **Configure menu button**.
4. Paste `https://prayer-bot-dev.up.railway.app`.

*(You never have to update BotFather again for either bot!)*

---

## 3. Developer Workflow

1. Create a feature branch off `develop` (e.g. `git checkout -b feature/new-ui develop`).
2. Push your feature branch and open a PR into **`develop`**.
3. Merging into `develop` automatically deploys to Railway Dev (`https://prayer-bot-dev.up.railway.app`).
4. Test live on Telegram via `@MyPrayerDevBot`.
5. Once approved, open a PR from `develop` into **`main`**. Merging into `main` automatically deploys to Production.
