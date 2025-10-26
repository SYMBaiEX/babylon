# @babylon/game-engine

Pure game logic package for Babylon prediction market games.

**NO server dependencies** - can be used standalone for simulations, testing, or embedded in other applications.

---

## ✅ NEW: Game Generator Ready!

Generate complete 30-day games with NPCs:

```bash
# With Groq (RECOMMENDED - 10-20x faster, free tier)
echo "GROQ_API_KEY=gsk_YOUR_KEY" > .env
bun run generate --save=game.json
# → 1-2 minutes, rich character-driven content

# With OpenAI (fallback)
export OPENAI_API_KEY="sk-..."
bun run generate --save=game.json
# → 5-10 minutes, same quality

# Mock mode (testing only, no LLM)
bun run generate --mock
# → 30 seconds, template-based
```

**Output**: ~200 events, ~1800 feed posts, ~150 group messages over 30 days
**All content LLM-generated** - each actor has unique voice and motivated reactions

### Generate Actor & Organization Images

```bash
# Generate images for all actors and organizations using fal.ai
echo "FAL_KEY=your_fal_api_key" >> .env
bun run generate:images
```

This will:
- Check `data/actors.json` for all actors and organizations
- Generate images using fal.ai's flux schnell in **political cartoon style**
- Save actor images to `images/actors/{actor-id}.jpg`
- Save organization images to `images/organizations/{org-id}.jpg`
- Skip items that already have images
- Display images in the feed and profile views

### View Generated Games

```bash
bun run dev
```

Opens interactive viewer at http://localhost:5173
- Load any generated game JSON
- Browse timeline day-by-day
- View feed posts and group messages
- Explore actor information with profile pictures

📖 See [GENERATOR_README.md](GENERATOR_README.md) for full documentation

---

## Installation

```bash
cd babylon-game-engine
bun install
```

---

## Usage

### 1. As a Library

```typescript
import { GameSimulator } from '@babylon/game-engine';

// Run complete autonomous game
const simulator = new GameSimulator({
  outcome: true, // Predetermined outcome (YES)
  numAgents: 5,
  duration: 30, // 30 days
});

const result = await simulator.runCompleteGame();

console.log(`Question: ${result.question}`);
console.log(`Outcome: ${result.outcome ? 'YES' : 'NO'}`);
console.log(`Winners: ${result.winners.length}/${result.agents.length}`);
console.log(`Events: ${result.events.length}`);
console.log(`Duration: ${result.endTime - result.startTime}ms`);
```

### 2. CLI Mode

```bash
# Run single game with full output
bun run cli --verbose

# Run with specific outcome
bun run cli --outcome=YES --verbose

# Batch simulations
bun run cli --count=100 --fast

# Save game to file
bun run cli --save=games/my-game.json --verbose

# JSON output for parsing
bun run cli --outcome=NO --json
```

### 3. Viewer Mode

```bash
# Start viewer
bun run viewer

# Opens http://localhost:5667
# Load a saved game JSON file
# Use play/pause/step controls to navigate timeline
```

---

## Features

### Autonomous Game Engine
- ✅ Runs complete 30-day games without human input
- ✅ Predetermined outcomes (game knows result in advance)
- ✅ AI agents make decisions based on clues
- ✅ LMSR market maker with realistic pricing
- ✅ Information asymmetry (insiders vs outsiders)
- ✅ Social features (posts, DMs, follows)
- ✅ Reputation system (ERC-8004 compatible)

### Event System
- ✅ Complete event log for every action
- ✅ Event types: game:started, day:changed, clue:distributed, agent:bet, market:updated, etc.
- ✅ Save/load games as JSON
- ✅ Replay games from event log

### CLI Testing
- ✅ Run simulations from terminal
- ✅ Batch mode for testing (100+ games)
- ✅ Performance benchmarks
- ✅ JSON output for analysis

### Timeline Viewer
- ✅ Visual timeline (30 days)
- ✅ Play/pause controls
- ✅ Speed control (0.5x - 10x)
- ✅ Event details for each day
- ✅ Market state visualization

---

## Architecture

### Pure Game Logic (NO Server Dependencies)

```
babylon-game-engine/
├── src/
│   ├── engine/
│   │   ├── GameSimulator.ts      ← Core autonomous engine
│   │   ├── EventEmitter.ts       ← Event system
│   │   ├── OutcomeEngine.ts      ← Predetermined outcomes
│   │   └── __tests__/            ← 21 engine tests
│   ├── cli/
│   │   ├── run-game.ts           ← CLI runner
│   │   └── __tests__/            ← 14 CLI tests  
│   ├── viewer/
│   │   ├── App.tsx               ← Timeline viewer UI
│   │   └── components/
│   └── index.ts                   ← Public API
└── package.json
```

### Usage in Server

```typescript
// babylon-server/src/index.ts
import { GameSimulator } from '@babylon/game-engine';

// Create game instance
const game = new GameSimulator({ outcome: true });

// Listen to events
game.on('agent:bet', (event) => {
  // Broadcast to connected clients
  io.emit('market_update', event.data);
});

// Run game
const result = await game.runCompleteGame();
```

---

## Testing

```bash
# Run all tests
bun test

# Results:
#   Engine: 21/21 ✅
#   CLI:    14/14 ✅
#   Total:  35/35 ✅
```

---

## Performance

- **Single game:** <1 second
- **Batch (100 games):** <10 seconds  
- **Complete event log:** ~150 events per game
- **Memory efficient:** <50MB per game

---

## Event Types

```typescript
type GameEventType =
  | 'game:started'      // Game initialization
  | 'day:changed'       // Day progression
  | 'clue:distributed'  // Clue given to agent
  | 'agent:bet'         // Agent places bet
  | 'agent:post'        // Agent posts to feed
  | 'agent:dm'          // Direct message
  | 'market:updated'    // Market state change
  | 'outcome:revealed'  // True outcome revealed
  | 'game:ended'        // Game complete
```

---

## Examples

### Example 1: Run 10 Games and Analyze

```typescript
import { GameSimulator } from '@babylon/game-engine';

const results = [];

for (let i = 0; i < 10; i++) {
  const sim = new GameSimulator({ 
    outcome: i % 2 === 0,
    numAgents: 5 
  });
  
  const result = await sim.runCompleteGame();
  results.push(result);
}

// Analysis
const avgEvents = results.reduce((sum, r) => sum + r.events.length, 0) / 10;
const avgWinners = results.reduce((sum, r) => sum + r.winners.length, 0) / 10;

console.log(`Average events per game: ${avgEvents}`);
console.log(`Average winners per game: ${avgWinners}`);
```

### Example 2: Listen to All Events

```typescript
const simulator = new GameSimulator({ outcome: true });

simulator.on('event', (event) => {
  console.log(`[Day ${event.day}] ${event.type}:`, event.data);
});

await simulator.runCompleteGame();
```

### Example 3: Save and Load Game

```bash
# Save game
bun run cli --save=interesting-game.json --verbose

# Load in viewer
bun run viewer
# Then load interesting-game.json in UI
```

---

## License

Apache-2.0

