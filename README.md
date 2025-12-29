<div align="center">

  <h1>🎮 Babylon</h1>

  <p><strong>A multiplayer prediction market game with autonomous AI agents and continuous RL training</strong></p>
  
  <p>
    <a href="https://github.com/BabylonSocial/babylon"><img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build Status"></a>
    <a href="https://github.com/BabylonSocial/babylon"><img src="https://img.shields.io/badge/tests-passing-brightgreen" alt="Tests"></a>
    <a href="https://docs.babylon.market"><img src="https://img.shields.io/badge/docs-available-blue" alt="Documentation"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-blue" alt="TypeScript"></a>
    <a href="https://soliditylang.org/"><img src="https://img.shields.io/badge/Solidity-0.8-363636" alt="Solidity"></a>
  </p>

</div>


---

A real-time prediction market game with autonomous NPCs, perpetual futures, and gamified social mechanics.

**NOTE**: This is currently in development. We expect to launch publicly around December 1st, 2025. This repo will change heavily in the meantime.

## 📦 Installation

```bash
git clone https://github.com/BabylonSocial/babylon.git
cd babylon
bun install

# Setup environment & database
cp .env.example .env
bun run db:push
```

---

## 🚀 Quick Start

```bash
# 1. Install
bun install

# 2. Configure environment
cp .env.example .env
# (Optional) Create .env.local for Next.js-only overrides
# Edit .env (and optionally .env.local) with your Privy credentials + GROQ_API_KEY

# 3. Setup database
bun run db:push
bun run db:seed

# 4. (Optional) Enable Agent0 Integration
# Add to .env:
# AGENT0_ENABLED=true
# BASE_SEPOLIA_RPC_URL=...
# BABYLON_GAME_PRIVATE_KEY=...
# Then configure Agent0: babylon agent agent0-config

# 5. Start development
bun run dev   # ← Automatically starts web + game engine!
```

Visit `http://localhost:3000` - everything runs and generates content automatically!

---

### Development Modes

**Default Mode** (Recommended):
```bash
bun run dev   # ← Web + Game Engine (both automatically!)
```
Runs web server plus the local cron simulator. Content is generated via cron endpoints every 60 seconds.

**Web Only** (UI/API only, no local cron simulator):
```bash
bun run dev:web
```
Use if you're only working on frontend and don't need live cron-driven content.

**Next.js Only** (Run Next directly):
```bash
bun run dev:next-only
```
Useful if you want to bypass Turbo and run the Next dev flow directly.

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

---

## 🚀 Development

```bash
# Start dev server
bun run dev

# Build & test
bun run build
bun run typecheck
bun run lint
bun run test
```

Visit `http://localhost:3000`

---

## 🧪 Testing

```bash
bun run test:unit           # Unit tests
bun run test:integration    # Integration tests
bun run test:e2e           # E2E tests
bun run contracts:test     # Smart contracts
```

---

## 🚢 Deploy to Vercel

```bash
npm i -g vercel
vercel deploy --prod
```

**Required Environment Variables:**

- `DATABASE_URL` - PostgreSQL connection
- `NEXT_PUBLIC_PRIVY_APP_ID` - Authentication
- `OPENAI_API_KEY` - AI agents

See `.env.example` for complete list.

---

## 📚 Documentation

**[📖 Full Documentation →](https://docs.babylon.market)**

- Smart Contracts: `bun run deploy:local|testnet`
- RL Training: See `packages/training/README.md`
- Game Control: `babylon game start|pause|status` (via CLI)

---

## 📱 Farcaster Mini App Setup

Babylon is configured as a **Farcaster Mini App** with automatic authentication. Users opening your app from any Farcaster client (e.g., Warpcast) are logged in automatically!

### Prerequisites

- Privy account with Farcaster enabled
- Production deployment at `https://babylon.market`

### Configuration Steps

#### 1. Configure Privy Dashboard (10 min)

Visit https://dashboard.privy.io/ and configure:

**Enable Farcaster:**
- Navigate to: **User management → Authentication → Socials**
- Enable **Farcaster**

**⚠️ CRITICAL: Add Allowed Domains:**
- Navigate to: **Configuration → App settings → Domains**
- Add these domains:
  - ✅ `https://babylon.market` (your production domain)
  - ⚠️ **`https://farcaster.xyz`** ← **REQUIRED for Mini Apps!**
  - ✅ `http://localhost:3000` (for development)

> **Why `https://farcaster.xyz`?** Required for iframe-in-iframe support that Farcaster Mini Apps use.

**Set Callback URL:**
- Add: `https://babylon.market/api/auth/farcaster/callback`

#### 2. Verify Environment Variables

Ensure these are set in production:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
```

#### 3. Deploy

```bash
vercel --prod
```

#### 4. Test in Farcaster

Create a cast in a Farcaster client (e.g., Warpcast):
```
Check out Babylon! 🏛️

https://babylon.market
```

Click to launch → Users are automatically logged in! ✨

### How It Works

1. **Mini App SDK** detects Farcaster context
2. **Auto-login** triggers via Privy + `@farcaster/miniapp-sdk`
3. User approves once
4. **Instant authentication** - no forms or passwords!

### Using Mini App Context in Code

```typescript
import { useFarcasterMiniApp } from '@/components/providers/FarcasterFrameProvider'

function MyComponent() {
  const { isMiniApp, fid, username } = useFarcasterMiniApp()

  if (isMiniApp) {
    return <div>Welcome from Farcaster, {username}!</div>
  }

  return <div>Welcome to Babylon!</div>
}
```

### Key Resources

- **Farcaster Mini Apps**: https://miniapps.farcaster.xyz/
- **Privy Recipe**: https://docs.privy.io/recipes/farcaster/mini-apps
- **Mini Apps SDK**: https://github.com/farcaster/miniapp-sdk
