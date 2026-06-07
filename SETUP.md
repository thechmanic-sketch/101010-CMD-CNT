# 🔟 101010 Command Center v3 — Setup

## Install
1. Install Node.js from nodejs.org (LTS version)
2. Open terminal in this folder → `npm install`

## Telegram Setup (2 min)
1. Open Telegram → search @BotFather → send `/newbot`
2. Follow prompts → copy your bot token
3. Send any message to your new bot
4. Visit: `https://api.telegram.org/botYOUR_TOKEN/getUpdates`
5. Copy the `"id"` number from `"chat"` in the response

## Configure
Rename `.env.example` to `.env` and fill in:
```
TELEGRAM_BOT_TOKEN=7123456789:AAHxxxxxxxxxx
TELEGRAM_CHAT_ID=123456789
PORT=3010
TIMEZONE=Africa/Johannesburg
```

## Run
```
npm start
```
Open http://localhost:3010

## Alert Schedule
- ⏰ **5:30am daily** — briefing: carry-overs, today's tasks, project progress, streaks
- ⏰ **1 hour before** any planned task with a due time
- ⏰ **6pm Sundays** — weekly review

## Test
Settings tab → Telegram Alerts → "Test morning message"

## Auto-start on boot
**Windows:** Create `start.bat` in your startup folder:
```
cd C:\path\to\101010-command-center
node server.js
```
**Mac:** Add to Login Items or use a LaunchAgent.

## Features
- 📅 **Today** — live timer, manual entries, 24h timeline, habits
- 📋 **Daily Plan** — tasks with reminders, time blocks, carry-overs
- 📆 **Weekly** — goals, milestones, last week recap
- 🚀 **Projects** — progress bars, 3–10 parts, time tracked
- 📊 **Insights** — stats, goals, EOD reflection, history browser
- ⚙️ **Settings** — habits, categories, goals, Telegram test

Data saved to `data.json` — don't delete it.
