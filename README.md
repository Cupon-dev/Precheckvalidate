# Telegram Validation Bot - Railway Deployment

## 🚀 Quick Deploy to Railway

### 1. Prepare Your Files
Create these files in your GitHub repository:

```
telegram-bot/
├── bot.js           (main bot code)
├── package.json     (dependencies)
├── Dockerfile       (for deployment)
├── .env.example     (environment template)
└── README.md        (this file)
```

### 2. GitHub Setup
1. Create new repository on GitHub
2. Upload all files except `.env`
3. Never commit your actual `.env` file with tokens!

### 3. Railway Deployment
1. Go to [Railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your bot repository
5. Railway will auto-detect and deploy

### 4. Set Environment Variables
In Railway dashboard:
1. Go to your project
2. Click "Variables" tab
3. Add these variables:
   - `BOT_TOKEN` = your telegram bot token
   - `CHANNEL_ID` = your channel ID (like -1001234567890)

### 5. Bot Permissions
Make sure your bot has these permissions in the channel:
- ✅ Delete messages
- ✅ Restrict members
- ✅ Ban users

## 🔧 How It Works

**User joins channel** →
1. **Basic validation** (username 3-32 chars, clean profile, 30+ days old)
2. **Gets muted** temporarily
3. **Receives private captcha message** (math problem)
4. **Clicks correct answer** → Gets approved
5. **Wrong answer/timeout** → Gets removed

**No messages in channel** - all validation happens privately!

## 📊 Monitoring

Railway provides:
- Automatic restarts if bot crashes
- Logs to monitor activity
- 24/7 uptime
- Free tier available

Check logs in Railway dashboard to see bot activity:
```
✅ User username123 passed captcha verification
❌ User baduser failed basic validation
⏰ User slowuser timed out
```

## 🛠 Local Testing

```bash
npm install
# Create .env file with your tokens
node bot.js
```

## 🔄 Updates

To update bot:
1. Push changes to GitHub
2. Railway auto-redeploys
3. Zero downtime updates

Your bot will run 24/7 on Railway's infrastructure!
