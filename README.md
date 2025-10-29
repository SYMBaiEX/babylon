# 🎮 Babylon - Realtime Perpetual Futures Game

**A continuously-running satirical prediction market with perpetual futures trading on 32 company stocks.**

## Features

- ✅ **Runs 24/7 at realtime speed** - No manual generation needed
- ✅ **10-20 posts per minute** from 185 satirical AI actors
- ✅ **32 company stock tickers** with live prices ($FACEHOOK, $NVIDIOT, $XITTER, etc.)
- ✅ **Perpetual futures trading** - Long/short with 1-100x leverage
- ✅ **Dynamic questions** - Max 20 active, 24h-7d resolution times
- ✅ **Complete persistence** - Stop/start anytime without data loss
- ✅ **Daily OHLCV snapshots** - Recorded at midnight UTC for recovery

## Quick Start

```bash
# 1. Set API key (Groq recommended for speed)
export GROQ_API_KEY=your_groq_api_key_here

# 2. Start development (auto-handles database)
bun run dev

# 3. In another terminal, run migrations (first time only)
bun run db:migrate

# 4. Seed database (first time only)
bun run db:seed

# 5. Open browser and trade!
open http://localhost:3000/markets
```

That's it! The game runs continuously.

> **Note:** `bun run dev` automatically:
> - Creates `.env` file if missing
> - Checks Docker and starts PostgreSQL
> - Validates database connection
> - Fails fast if anything is wrong
> 
> See [DATABASE.md](DATABASE.md) for detailed setup.

## What You Get

### Realtime Content Generation

**Every 60 seconds:**
- 10-20 social media posts from actors
- 2-4 world events
- 32 stock price updates
- Position PnL updates
- Liquidation checks

**Every 8 hours:**
- Funding payments processed
- Longs pay shorts (or vice versa)

**Every 24 hours:**
- Daily OHLCV snapshots recorded
- Questions created/resolved
- Stats reset

### Stock Markets

**32 Company Tickers:**
- `$NVIDIOT` - $1,250.00 (highest)
- `$BLACKCROOK` - $850.00
- `$FACEHOOK` - $520.00
- `$OPENLIE` - $450.00
- `$MACROHARD` - $425.00
- `$GOLDMANSUCKS` - $420.00
- `$ANTHROPIMP` - $380.00
- `$MICROSELLEGY` - $375.00
- `$DEEPMINED` - $320.00
- `$SPOTIFLY` - $285.00
- `$TESLABOT` - $245.00
- `$CRAPPLE` - $225.00
- ... and 20 more!

### Trading Features

**Perpetual Futures:**
- Long or Short any company
- 1x to 100x leverage
- Real-time PnL tracking
- Automatic liquidations
- Funding payments every 8h
- Position management

**Example Trade:**
```
Long $1,000 of $FACEHOOK at 10x leverage
→ Controls $10,000 position
→ Entry: $520.00
→ Liquidation: $472.00 (-10%)
→ Pays 0.01% funding every 8h
```

### Content

**185 Satirical Actors:**
- Elon's Husk (Elon Musk)
- Scam Altman (Sam Altman)
- Mark Suckerborg (Mark Zuckerberg)
- Palmer Cucky (Palmer Luckey)
- ... and 181 more!

**Output:**
- 14,400-28,800 posts per day
- 72,000 price updates per day
- 4,000 events per day
- All content relevant to active questions

## Architecture

### Core Components

1. **RealtimeGameEngine** - Runs continuously, generates content
2. **PerpetualsEngine** - Handles long/short positions, funding, liquidations
3. **PriceEngine** - Generates realistic stock prices (Markov chain + events)
4. **QuestionManager** - Creates/resolves prediction questions
5. **FeedGenerator** - Generates social media posts

### Data Flow

```
Daemon (every 60s)
  ↓
Generate posts/events
  ↓
Update prices
  ↓
Update positions
  ↓
Save state
  ↓
games/realtime/history.json
  ↓
UI (Next.js)
```

## Project Structure

```
babylon/
├── src/
│   ├── engine/
│   │   ├── RealtimeGameEngine.ts    - Main engine
│   │   ├── PerpetualsEngine.ts      - Trading engine
│   │   ├── PriceEngine.ts           - Price generation
│   │   └── QuestionManager.ts       - Question lifecycle
│   ├── cli/
│   │   └── realtime-daemon.ts       - Daemon script
│   ├── app/
│   │   └── markets/page.tsx         - Trading UI
│   └── shared/
│       ├── types.ts                 - Core types
│       └── perps-types.ts           - Trading types
│
├── games/
│   └── realtime/
│       └── history.json             - Complete state
│
├── data/
│   └── actors.json                  - 185 actors, 32 companies
│
└── docs/
    ├── START_HERE.md               - Quick start guide
    ├── REALTIME_PERPS_SYSTEM.md   - Complete docs
    └── COMPLETE_SYSTEM_REVIEW.md  - Technical review
```

## Commands

### Database

```bash
# Start PostgreSQL container
bun run db:start

# Stop PostgreSQL container
bun run db:stop

# Restart PostgreSQL container
bun run db:restart

# Check database status
bun run db:status

# Run migrations
bun run db:migrate

# Seed database
bun run db:seed

# Reset database (drop + migrate + seed)
bun run db:reset
```

### Daemon

```bash
# Start realtime daemon
bun run daemon

# Start with verbose logging
bun run daemon:verbose

# Stop
Ctrl+C (saves state automatically)
```

### Development

```bash
# Start Next.js app
bun run dev

# Run tests
bun test

# Lint code
bun run lint

# Generate actor images
bun run generate:images
```

### Legacy (Still Available)

```bash
# Generate 30-day batch (old system)
bun run generate:month

# Daily generation (intermediate system)
bun run generate:init
bun run generate
```

## Data Persistence

### What Gets Saved

**File:** `games/realtime/history.json`

**Contents:**
- Last 43,200 minute ticks (30 days)
- All questions (active + resolved)
- All company prices
- All open positions
- Daily OHLCV snapshots
- Funding rates and times
- Liquidation history

### Recovery

**Stop daemon at any time:**
- State automatically saved
- All positions preserved
- All prices preserved
- All questions preserved

**Restart daemon:**
- Loads complete state
- Continues from current time
- No data loss ✅

## Trading Mechanics

### Opening Positions

1. Select ticker (e.g., `$FACEHOOK`)
2. Choose side (LONG or SHORT)
3. Enter size (e.g., $1,000)
4. Set leverage (1-100x)
5. See liquidation price
6. Click to open position

### Managing Positions

- **PnL updates** every minute as prices move
- **Funding paid** every 8 hours
- **Auto-liquidation** if price hits threshold
- **Manual close** anytime to realize PnL

### Liquidation Example

```
Long $1,000 of $XITTER at 20x leverage
Entry: $42.00
Liquidation: $44.10 (+5% move)

Price moves:
$42.00 → $42.50 → $43.00 → $43.50 → $44.20
                                      ↑
                                 LIQUIDATED!
                            Loss: -$1,000
```

## Technical Details

### Price Generation

**Markov Chain:**
- Trend: bullish/bearish/neutral (70% persistence)
- Volatility: 0.1-0.5 (mean-reverting)
- Momentum: -1 to +1 (decays with shocks)

**Event Impacts:**
- Major events: ±5-10% price shock
- Moderate: ±2-5%
- Minor: ±0.5-2%

**Minute Updates:**
- Smooth interpolation between events
- Realistic price movements
- Deterministic (seeded PRNG)

### Question System

**Lifecycle:**
1. Create 1-3 questions daily
2. Set resolution date (24h-7d from creation)
3. Mark as `active`
4. Generate events related to question
5. When resolutionDate reached → resolve
6. Mark as `resolved`
7. Create new questions to replace

**Maintains 15-20 active questions continuously.**

### Funding Rate

**Formula:**
```
Payment = PositionSize × (AnnualRate / 1095) × Periods
Period = 8 hours
```

**Direction:**
- Positive rate: Longs pay shorts
- Negative rate: Shorts pay longs
- Zero rate: No payment

**Frequency:**
- Every 8 hours (00:00, 08:00, 16:00 UTC)

## Performance

**Throughput:**
- 14,400-28,800 posts/day
- 72,000 price updates/day
- 4,000 events/day

**Resources:**
- CPU: 5-10% during ticks
- Memory: ~500MB with 30-day history
- Disk: ~300MB for 30 days

**Speed:**
- Each tick: ~1-2 seconds
- Save state: ~100ms
- Tests: 42 tests in <50ms

## API Keys

### Groq (Recommended)

```bash
export GROQ_API_KEY=your_key
```

Get free key at: https://console.groq.com/

**Why Groq:**
- 10x faster than OpenAI
- Free tier generous
- Perfect for realtime generation

### OpenAI (Alternative)

```bash
export OPENAI_API_KEY=your_key
```

Get key at: https://platform.openai.com/

## Testing

```bash
# Run all tests
bun test

# Run specific test suites
bun test src/engine/__tests__/PriceEngine.test.ts
bun test src/engine/__tests__/QuestionManager.test.ts
bun test src/engine/__tests__/PerpetualsEngine.test.ts

# Results: 42 tests passing ✅
```

## Troubleshooting

### Daemon won't start

```bash
# Check API key is set
echo $GROQ_API_KEY

# Check no other instance running
ps aux | grep daemon

# Check ports available
lsof -i :3000
```

### State corrupted

```bash
# Backup old state
mv games/realtime/history.json games/realtime/history.backup.json

# Restart daemon (will create fresh state)
bun run daemon
```

### UI not updating

```bash
# Restart Next.js app
# Ctrl+C in dev terminal
bun run dev

# Clear browser cache
# Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Win)
```

## Contributing

### Add Actors

Edit `data/actors.json`:
```json
{
  "actors": [
    {
      "id": "new-actor",
      "name": "New Actor Name",
      "description": "Satirical description",
      "tier": "A_TIER",
      "canPostFeed": true,
      "affiliations": ["company-id"]
    }
  ]
}
```

### Add Companies

```json
{
  "organizations": [
    {
      "id": "new-company",
      "name": "New Company",
      "type": "company",
      "initialPrice": 100.00,
      "canBeInvolved": true
    }
  ]
}
```

Restart daemon to load new data.

## License

MIT

## Credits

Built with:
- Bun
- Next.js 16
- React 19
- TypeScript
- TailwindCSS
- Groq/OpenAI LLMs

---

**Ready to run!** Start with: `bun run daemon` 🚀

For detailed docs, see:
- `START_HERE.md` - Quick start guide
- `REALTIME_PERPS_SYSTEM.md` - Complete system documentation
- `COMPLETE_SYSTEM_REVIEW.md` - Technical review
