# Local Testing Runbook

This guide explains how to set up a dedicated **Dev Bot** for local testing with Telegram Mini App before deploying your changes to production.

---

## 1. One-Time Setup: Create Dev Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot` and follow the prompts to create your test bot (e.g. `@MyPrayerDevBot`).
3. Copy the API Token provided by BotFather.
4. Open your local `.env` file and set:
   ```env
   TELEGRAM_BOT_TOKEN=your_dev_bot_token_here
   ```

---

## 2. Step-by-Step Runbook for Local Testing

Whenever you want to test new features or UI changes before merging to production:

### Step 1 — Start the Local Bot & Health Server
In your terminal, run:
```bash
npm start
```
*(The server listens on `http://localhost:3000`)*

### Step 2 — Start the Cloudflare Tunnel
In a second terminal window, run:
```bash
npx cloudflared tunnel --url http://localhost:3000
```

Cloudflare will generate a public HTTPS link in the logs, for example:
`https://random-subdomain.trycloudflare.com`

### Step 3 — Update `.env` with your Tunnel URL
In your local `.env`, update `WEBAPP_URL`:
```env
WEBAPP_URL=https://random-subdomain.trycloudflare.com
```
*(Save the file and restart `npm start` in Terminal 1 so inline keyboard `/start` buttons use the active tunnel URL)*

### Step 4 — Update BotFather Menu Button (Dev Bot)
In Telegram, message [@BotFather](https://t.me/BotFather):
1. Send `/mybots` and choose your **Dev Bot** (`@MyPrayerDevBot`).
2. Go to **Bot Settings** → **Menu Button** → **Configure menu button**.
3. Paste the tunnel URL: `https://random-subdomain.trycloudflare.com`

---

## 3. Perform your Smoke Tests

- Open your **Dev Bot** in Telegram.
- Tap the **Menu Button** (or send `/start` and tap `[Prayer App]`).
- Test your changes (e.g., real-time language switching in Settings, room creation, prayer marking).

---

## 4. Production Deployment Checklist

Once your local smoke test passes and your PR is merged:

1. **Railway Environment Variables:** Ensure `WEBAPP_URL` on Railway is set to your live production domain:
   ```env
   WEBAPP_URL=https://prayer-bot-production-58d7.up.railway.app
   ```
2. **Main Bot Settings:** Ensure [@BotFather](https://t.me/BotFather) for your **Main Production Bot** points to your live production domain.
