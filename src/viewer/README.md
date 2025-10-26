# Babylon Game Viewer

Interactive viewer for exploring generated games.

## Usage

```bash
# Generate games (creates genesis.json and games/latest.json)
bun run generate

# Start the viewer
bun run dev

# The viewer automatically loads genesis.json and games/latest.json
# Navigate through time with the timeline controls
```

## Features

### 7 Tabs

1. **📊 Summary** - Comprehensive game overview
   - 📖 Story So Far - Day-by-day narrative summaries
   - 🎯 Current Situation - What's happening today
   - 🔥 Key Events So Far - Events that point toward question outcomes
   - 👥 Actor Status - Current mood and luck for all main actors
   - ❓ Question Progress - Visual progress bars showing YES/NO evidence

2. **🌍 Context** - World situation and setup (Dark themed)
   - The Story So Far - Previous context
   - Current Situation - World summary
   - Key Players - Main actors with domains
   - Active Scenarios - All scenarios with themes
   - Prediction Markets - Questions organized by scenario
   - Why These Questions Matter - Relevance explanations

3. **😊 Mood** - Actor emotional states (Dark themed)
   - Interactive mood cards with current state
   - Mood bars (-1.0 to +1.0 range)
   - Emotion labels (Happy, Angry, Neutral, etc.)
   - Luck indicators (Low/Medium/High)
   - Relationships - Click actors to see connections
   - Updates dynamically as you navigate days

4. **📅 Timeline** - World events day-by-day
   - Event type, description, actors involved
   - Points toward YES/NO indicator
   - Visibility level

5. **📰 Feed** - Social media posts
   - News coverage
   - Actor reactions
   - Expert commentary
   - Conspiracy theories
   - Threaded replies
   - Sentiment and clue strength

6. **💬 Groups** - Private group chats
   - Insider information
   - Group membership
   - Clue strength tracking

7. **👥 Actors** - Cast information
   - Main actors (S/A tier)
   - Supporting actors
   - Descriptions, domains, personalities
   - Initial luck and mood

### Playback Controls

**Main Buttons**:
- **⏮️ Start**: Restart from Day 1
- **◀️ Prev**: Previous day (also: ← arrow key)
- **▶️ Play / ⏸️ Pause**: Auto-advance through timeline (also: Spacebar)
- **Next ▶️**: Next day (also: → arrow key)
- **End ⏭️**: Jump to Day 30

**Speed Control**:
- 0.25x (Slow) - 4 seconds per day
- 0.5x - 2 seconds per day
- 1x (Normal) - 1 second per day
- 2x - 0.5 seconds per day
- 5x (Fast) - 0.2 seconds per day
- 10x (Very Fast) - 0.1 seconds per day

**Progress Slider**:
- Drag to jump to any day instantly
- Pauses playback when manually adjusted

**Keyboard Shortcuts**:
- `Space` - Play/Pause
- `←` - Previous day
- `→` - Next day
- `Home` - Jump to Day 1
- `End` - Jump to Day 30

### Day Sidebar

- Click any day to jump to it
- Shows event count and post count
- Highlights current day

## Generate a Game

```bash
# Generate games (requires GROQ_API_KEY or OPENAI_API_KEY)
bun run generate

# This creates:
# - genesis.json (first month, October 2025)
# - games/latest.json (most recent game)
# - games/game-YYYY-MM-DD-HHMMSS.json (timestamped saves)

# Start the viewer
bun run dev
# Games are automatically loaded from genesis.json and games/latest.json
```

## What You'll See

### Example Timeline View
- Day 1: "Elon's Husk announces mysterious satellite project"
- Day 15: "Major breakthrough achieved in testing phase"
- Day 30: "Final test successful - all systems operational"

### Example Feed View
- News: "BREAKING: Sources say Elon's project is revolutionary"
- Reaction: "@ElonHusk: Big announcement tomorrow. Very big. 🚀"
- Conspiracy: "WAKE UP! This is mind control!"

### Example Groups View
- Elon's Inner Circle: "I've seen the internal docs..."
- Tech Insiders: "Between us, things are looking good..."

## Development

The viewer uses:
- React + TypeScript
- Vite for dev server
- Inline styles (no CSS build needed)

To modify:
- Edit `src/viewer/App.tsx` (main viewer)
- Vite hot-reloads automatically

### Component Organization

- **App.tsx** - Main consolidated viewer with all features (use this!)
- **components/** - Reusable components (GameRecap, GameHistoryPanel, etc.)
- **ViewerExample.tsx** - Example showing how to use GameRecap component separately
- **utils/** - Helper functions for data extraction

