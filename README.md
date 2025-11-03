# 🎮 Babylon - Prediction Market Game

A real-time prediction market game with autonomous NPCs, perpetual futures, and gamified social mechanics.

## 🚀 Quick Start

```bash
# 1. Install
bun install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your Privy credentials + GROQ_API_KEY

# 3. Setup database
npx prisma generate
npx prisma migrate dev --name initial_setup
npx prisma db seed

# 4. Start development
bun run dev   # ← Automatically starts web + game engine!
```

Visit `http://localhost:3000` - everything runs and generates content automatically!

### Development Modes

**Default Mode** (Recommended):
```bash
bun run dev   # ← Web + Game Engine (both automatically!)
```
Runs both web server AND game daemon. Content generates every 60 seconds.

**Web Only** (No Content Generation):
```bash
bun run dev:web-only   # Just Next.js, no daemon
```
Use if you're only working on frontend and don't need live content.

**Serverless Mode** (Test Vercel Cron Locally):
```bash
bun run dev:cron-mode   # Web + Cron simulator (not daemon)
```
Tests the serverless cron endpoint instead of daemon. Good for verifying Vercel behavior.

### Real-Time Updates

The application uses **Server-Sent Events (SSE)** for real-time updates (Vercel-compatible):
- Feed updates (new posts)
- Market price changes
- Breaking news
- Chat messages

**For Production (Vercel):** Optionally set up Redis for cross-instance broadcasting:
```bash
# Add to Vercel environment variables
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```