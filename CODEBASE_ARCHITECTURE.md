# Codebase Architecture

## 🎯 Overview

Babylon game engine has been cleanly organized with clear separation of concerns. All utilities, types, and constants are centralized in `/src/shared/`.

## 📁 Directory Structure

```
src/
├── cli/                    # Command-line tools
│   ├── generate-game.ts   # Generate full 30-day games (NEW)
│   ├── generate-world.ts  # Generate world events
│   ├── run-game.ts        # Run autonomous simulations
│   └── generate-actor-images.ts  # Generate character images
│
├── engine/                 # Core game simulation engine
│   ├── GameSimulator.ts   # ACTIVE: Autonomous game simulation (betting, agents, market)
│   ├── GameWorld.ts       # ACTIVE: World event generation
│   ├── FeedGenerator.ts   # ACTIVE: Social feed generation with batched LLM calls
│   ├── EmotionSystem.ts   # ACTIVE: Actor mood/luck state management
│   └── EventEmitter.ts    # Event bus for game events
│
├── generator/              # Character-driven content generation
│   ├── GameGenerator.ts   # ACTIVE: Full game generation with NPCs (Phase 2+)
│   └── llm/               # LLM client abstraction
│       └── openai-client.ts
│
├── prompts/                # Centralized LLM prompts (Phase 3)
│   ├── loader.ts          # Prompt loading system
│   ├── image/             # Image generation prompts
│   ├── feed/              # Social feed prompts
│   └── game/              # Game structure prompts
│
├── shared/                 # 🔥 Centralized utilities (Phase 1.2)
│   ├── types.ts           # All TypeScript types (294 lines)
│   ├── constants.ts       # Game constants and configuration
│   └── utils.ts           # Shared utility functions
│
└── viewer/                 # Game viewer UI (React)
    └── components/
```

## 🎮 Active Systems

### Phase 1-2: Core Game Engine (Complete)
All files are **ACTIVE** and serve specific purposes:

#### GameSimulator.ts
- **Purpose**: Autonomous game simulation with AI agents
- **Features**: Betting system, LMSR market maker, reputation (ERC-8004)
- **Used by**: `run-game.ts`, main public API
- **Status**: ✅ ACTIVE - Original autonomous engine

#### GameWorld.ts
- **Purpose**: World event generation and management
- **Used by**: `generate-world.ts`
- **Status**: ✅ ACTIVE - Event generation system

#### GameGenerator.ts
- **Purpose**: Character-driven 30-day game generation
- **Features**: NPC actors, group chats, scenarios, questions
- **Used by**: `generate-game.ts` (primary game generation)
- **Status**: ✅ ACTIVE - Phase 2+ content generation

#### FeedGenerator.ts
- **Purpose**: Generate social media feed with actor personalities
- **Features**: Batched LLM calls (90% reduction), mood/luck aware
- **Optimization**: ~200 LLM calls per game (down from 2,000+)
- **Status**: ✅ ACTIVE - Feed generation engine

### Phase 3: Prompt System (Complete)

All prompts centralized in `/src/prompts/` with:
- ✅ 14 prompts extracted to markdown files
- ✅ YAML frontmatter for metadata
- ✅ `loadPrompt()` function with caching
- ✅ Easy modification without code changes

### Phase 1.2: Code Cleanup (Complete ✅)

#### Centralized in `/src/shared/`:

**utils.ts** - All utility functions with JSDoc:
- `shuffleArray()` - Fisher-Yates algorithm (removed 3 duplicates)
- `formatActorVoiceContext()` - Actor voice formatting
- `generateId()`, `clamp()`, `calculateSentiment()`
- `formatDate()`, `formatTime()`
- `pickRandom()`, `pickRandomN()`

**constants.ts** - All game constants:
- `ACTOR_TIERS` - S/A/B/C tier system
- `POST_TYPES` - Feed post categories
- `DAY_RANGES` - Early/Mid/Late game phases
- `ORG_TYPES` - Organization categories
- `ACTOR_COUNTS`, `GAME_STRUCTURE`, `FEED_TARGETS`
- `getEscalationLevel()` - Chaos intensity by day

**types.ts** - All TypeScript types (294 lines):
- Core: `Actor`, `SelectedActor`, `ActorState`
- Feed: `FeedPost`, `FeedEvent`, `ChatMessage`
- Game: `Scenario`, `Question`, `WorldEvent`, `DayTimeline`
- Org: `Organization`, `GroupChat`, `ActorConnection`

## 🚀 Next Steps (Phase 1.3)

### Character Expansion (5 days)
- Add 15 standout NEW characters
- Enhance 20 existing characters
- Add 8-10 strong female characters
- Improve humor and running gags

## 📊 Cleanup Results

### Before Phase 1.2:
- ❌ Duplicate `shuffle()` implementations (3x)
- ❌ Inline `.sort(() => Math.random() - 0.5)` (bad algorithm)
- ❌ Scattered utilities

### After Phase 1.2:
- ✅ Single `shuffleArray()` with proper Fisher-Yates
- ✅ All utilities centralized in `/src/shared/`
- ✅ Comprehensive JSDoc comments
- ✅ Type-safe constants with `as const`
- ✅ Zero breaking changes - all tests pass

## 🎯 Design Principles

1. **No Duplicates**: Single source of truth for all utilities
2. **Type Safety**: Strict TypeScript with proper types
3. **Documentation**: JSDoc on all public functions
4. **Centralization**: `/src/shared/` for cross-cutting concerns
5. **Separation**: Clear boundaries between engine/generator/feed

## 📝 Notes

- All three game classes (GameSimulator, GameWorld, GameGenerator) are **ACTIVE**
- No legacy code identified - all files serve current purposes
- Clean separation between autonomous simulation vs character-driven generation
