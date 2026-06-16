# Setting Up Prayer Bot on Railway

This guide walks you through deploying your own Prayer Bot in about 10 minutes.
You do not need to write any code — just follow each step and copy-paste where
indicated.

When your bot is running, see [USAGE.md](USAGE.md) for a list of all commands.

---

## Step 1 — Create your Telegram bot

1. Open Telegram and start a chat with [@BotFather](https://t.me/BotFather).
2. Send the command `/newbot`.
3. Follow the prompts: choose a display name and a username (the username must
   end in `bot`, e.g. `MyChurchPrayerBot`).
4. BotFather will reply with a **bot token** that looks like
   `123456789:ABCdef...`. Copy it and keep it somewhere safe — you will need it
   in Step 4.

---

## Step 2 — Deploy on Railway

You need a free [Railway](https://railway.com) account. Sign up if you do not
have one.

**Option A — One-click deploy (easiest)**

Click the **Deploy on Railway** button in the [README](../README.md). Railway
will ask you to connect your GitHub account and fork the repository, then it
starts a deployment automatically.

> **Note for maintainers:** after the repository is public, create a Railway
> Template and replace the button URL in README.md with your template link.
> Templates prompt the user for `TELEGRAM_BOT_TOKEN` during deploy, which saves
> Step 4 below.

**Option B — Manual deploy**

1. In Railway, click **New Project**.
2. Select **Deploy from GitHub repo**.
3. Choose your fork of this repository (or the original if you have permission).
4. Railway will detect the `railway.json` and start a deployment.

---

## Step 3 — Add a Volume (required for data storage)

Prayer data is stored in a SQLite database file. Without a Volume, that file is
wiped every time the bot restarts or redeploys.

1. In your Railway project, click on the **prayer-bot service**.
2. Go to **Settings → Volumes**.
3. Click **Add a Volume**.
4. Set the **Mount Path** to `/data`.
5. Save. Railway will restart the service with the volume attached.

---

## Step 4 — Set environment variables

1. In your Railway service, click the **Variables** tab.
2. Add the following variables:

| Variable | Value | Required? |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | The token you copied from BotFather in Step 1 | Yes |
| `DB_PATH` | `/data/prayer-bot.db` | Yes |
| `DEFAULT_LOCALE` | `uk`, `en`, or `ru` (defaults to `uk`) | No |
| `TZ` | Your timezone, e.g. `Europe/Kyiv` (defaults to `UTC`) | No |
| `ADMIN_USER_IDS` | Comma-separated Telegram user IDs who can run admin commands | No |

3. After saving, Railway will restart the service with the new variables.

To find your Telegram user ID, message [@userinfobot](https://t.me/userinfobot).

---

## Step 5 — Verify the bot is working

**Check the health endpoint**

1. In your Railway service, go to **Settings → Networking** and generate a
   public domain if you have not already.
2. Open `https://your-service-name.railway.app/health` in your browser.
3. You should see: `{"status":"ok"}`

**Test in Telegram**

1. Open a chat with your bot in Telegram.
2. Send `/ping`.
3. The bot should reply with `pong`.

If everything looks good, your bot is live. See [USAGE.md](USAGE.md) for all
available commands.

---

## Troubleshooting

| Problem | What to check |
|---|---|
| Bot does not respond to messages | Double-check `TELEGRAM_BOT_TOKEN` — make sure you copied the full token from BotFather with no extra spaces. |
| Data disappears after every redeploy | The Volume is missing or `DB_PATH` is not set to `/data/prayer-bot.db`. Repeat Step 3 and Step 4. |
| Reminders fire at the wrong time (future feature) | Set the `TZ` variable to your local IANA timezone, e.g. `Europe/Kyiv` or `America/New_York`. |
| Health endpoint returns an error | Check the **Deployments** tab in Railway for build or startup errors. The most common cause is a missing required variable. |
