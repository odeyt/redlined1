# Redlined1 YouTube Bot — Setup Guide

Fully automated YouTube channel. One setup session, then hands-off forever.

---

## Prerequisites (install once)

1. **Node.js 18+** — https://nodejs.org
2. **FFmpeg** — https://ffmpeg.org/download.html → add to PATH
3. **Git** (already installed if you're running Redlined1)

---

## Step 1 — Install dependencies

```bash
cd youtube-bot
npm install
npx playwright install chromium
```

---

## Step 2 — Get your API keys

| Service | Where to get it | Cost |
|---|---|---|
| **Anthropic (Claude)** | https://console.anthropic.com | ~$0.02/video |
| **ElevenLabs** | https://elevenlabs.io | Free (10k chars/mo) |
| **Pexels** | https://www.pexels.com/api | Free |
| **Google/YouTube** | https://console.cloud.google.com | Free |

### Google Cloud setup (for YouTube upload):
1. Go to https://console.cloud.google.com
2. Create a new project → name it "Redlined1 Bot"
3. Enable **YouTube Data API v3**
4. Go to **Credentials** → Create → **OAuth 2.0 Client ID** → Desktop App
5. Copy the Client ID and Client Secret

---

## Step 3 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all values.

---

## Step 4 — YouTube one-time auth (2 minutes)

```bash
npm run auth
```

Follow the instructions — open the link, sign in, paste the code back.
Copy the `YOUTUBE_REFRESH_TOKEN=...` line into your `.env`.

**You only do this once. After that, uploads are fully automatic.**

---

## Step 5 — Test run

```bash
node index.js --once
```

This produces one full video and uploads it. Watch the logs.
The video appears in your YouTube Studio within a few minutes.

---

## Step 6 — Start the scheduler (hands-off mode)

```bash
node index.js
```

Default schedule: **every day at 9am**.
Change it in `.env` with `CRON_SCHEDULE` (standard cron syntax).

To keep it running permanently on Windows, use **PM2**:

```bash
npm install -g pm2
pm2 start index.js --name youtube-bot
pm2 save
pm2 startup
```

---

## What happens on each run

1. Claude writes a unique script for the next topic
2. ElevenLabs generates the voiceover
3. Pexels supplies free B-roll footage
4. Playwright records live Redlined1 screen demos
5. FFmpeg assembles everything with burned-in captions
6. Uploads to YouTube with SEO title, description, and tags
7. Rotates to the next topic automatically

**8 topics × rotating = content for weeks before repeating.**
Add more topics to `config/topics.js` at any time.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ffmpeg not found` | Install FFmpeg and add to PATH |
| `ElevenLabs quota exceeded` | Upgrade to Starter plan ($5/mo) or reduce video frequency |
| YouTube upload fails | Re-run `npm run auth` to refresh token |
| Screen recording blank | Check `REDLINE_EMAIL` / `REDLINE_PASSWORD` in `.env` |
| `No Pexels results` | Edit `pexelsQueries` in `config/topics.js` |
