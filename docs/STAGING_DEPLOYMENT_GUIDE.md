# Railway Staging & Production Multi-Environment Setup

This guide details how to configure a two-tier continuous deployment setup on Railway with GitHub:

1. **Staging Environment**: Automatically deployed from the `staging` branch to a live static HTTPS URL for your `@MyPrayerDevBot`.
2. **Production Environment**: Automatically deployed from the `main` branch to your live production URL for your Main Bot.

---

## Environment Architecture Overview

| Environment | GitHub Branch | Telegram Bot | Railway Public Domain | SQLite Database |
|---|---|---|---|---|
| **Staging** | `staging` | `@MyPrayerDevBot` | `https://prayer-bot-staging.up.railway.app` | `/data/prayer-bot-staging.db` |
| **Production** | `main` | `@YourMainBot` | `https://prayer-bot-production-58d7.up.railway.app` | `/data/prayer-bot.db` |

---

## 1. Railway Staging Environment Setup (5 Minutes)

### Step 1 — Create Staging Environment in Railway
1. Open your project on [Railway.app](https://railway.app).
2. Click on your project name at the top.
3. Click **+ New Environment** (or environment dropdown) and name it **Staging**.
4. Click **New Service** → **GitHub Repo** → select `prayer-bot`.

### Step 2 — Set GitHub Branch to `staging`
1. In the newly created **Staging service**, go to **Settings → Source Repo / Branch**.
2. Change the deployment branch from `main` to **`staging`**.
3. Save. Railway will now trigger automatic deployments whenever commits are pushed to `staging`.

### Step 3 — Add Volume & Environment Variables (Staging Environment)
1. In **Settings → Volumes**, add a volume with mount path `/data`.
2. In the **Variables** tab, set:
   ```env
   TELEGRAM_BOT_TOKEN=your_dev_bot_token_from_botfather
   DB_PATH=/data/prayer-bot-staging.db
   WEBAPP_URL=https://prayer-bot-staging.up.railway.app
   ```
3. In **Settings → Networking**, generate a public domain (e.g. `prayer-bot-staging.up.railway.app`).

---

## 2. One-Time BotFather Setup

Once your Railway Staging environment generates its domain (e.g., `https://prayer-bot-staging.up.railway.app`):

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/mybots` → select your **Dev Bot** (`@MyPrayerDevBot`).
3. Tap **Bot Settings** → **Menu Button** → **Configure menu button**.
4. Paste `https://prayer-bot-staging.up.railway.app`.

*(You never have to update BotFather again for either bot!)*

---

## 3. Developer Workflow

1. Create a feature branch off `staging` (e.g. `git checkout -b feature/new-ui staging`).
2. Push your feature branch and open a PR into **`staging`**.
3. Merging into `staging` automatically deploys to Railway Staging (`https://prayer-bot-staging.up.railway.app`).
4. Test live on Telegram via `@MyPrayerDevBot`.
5. Once approved, open a PR from `staging` into **`main`**. Merging into `main` automatically deploys to Production.
