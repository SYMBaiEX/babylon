# Plan: Causal Event-Driven Market Simulation Engine

## Executive Summary

**Objective**: Replace random market movements with a causal, event-driven simulation where hidden narrative facts drive events, and events drive price movements. This creates a learnable signal for RL models: `Hidden Fact → Event → Price Movement`.

**Current Problem**: Random walk prices contain no learnable signal. Models cannot distinguish between noise and meaningful patterns.

**Target State**: Clear causal chain creates a learnable relationship that models can discover and predict.

**Success Metric**: Training data contains consistent, predictable price reactions to specific event types (e.g., "Recall Rumor" always causes -5% for TeslAI).

---

## 1. Goal Clarification

### 1.1 What Needs to Be Built

Replace random market movements with a causal, event-driven simulation where:

1. **Hidden Narrative Facts**: Ground truth contains hidden facts like `{ "fact": "TeslAI has a secret battery flaw", "affectsTickers": ["TSLA"] }`
2. **Causal Events**: Events are generated with deterministic base timing + probabilistic jitter (±4-8 hours) based on hidden facts (e.g., Day 5 ±4 hours: "Leak" event, Day 10 ±4 hours: "Recall Rumor" event)
3. **Market Price Reactions**: A "Market Mover" LLM agent translates events into price movements using volatility buckets (Low/Medium/High) with RNG within bucket (e.g., "Recall Rumor" → TSLA: Medium bucket (-5% to -10%), then RNG selects exact value)
4. **Learnable Signal**: The model can learn to predict prices from events, not random noise

### 1.2 Why This Matters

- **Current Problem**: Random walk prices (lines 338-361 in `BenchmarkDataGenerator.ts`) contain no learnable signal. Models cannot distinguish between noise and meaningful patterns.
- **Target State**: Clear causal chain `Hidden Fact → Event → Price Movement` creates a learnable relationship that models can discover.
- **Success Metric**: Training data contains consistent, predictable price reactions to specific event types (e.g., "Recall Rumor" always causes -5% for TeslAI).

### 1.3 Success Criteria

**Functional Requirements:**
- ✅ Hidden facts are stored in `groundTruth.hiddenNarrativeFacts`
- ✅ Events are generated causally based on hidden facts (Day 5 leak, Day 10 rumor)
- ✅ Prices react to events via Market Mover (not random walk)
- ✅ Price movements are consistent: same event → similar price change

**Quality Requirements:**
- ✅ Clear causal chain: Hidden Fact → Event → Price Movement
- ✅ Learnable signal: Model can predict prices from events
- ✅ Reproducible: Same seed → same events → same prices
- ✅ Performance: Simulation completes in reasonable time (< 10 min for 30 days)

---

## 2. Current Architecture Analysis

### 2.1 BenchmarkDataGenerator.ts
**Location**: `packages/training/src/benchmark/BenchmarkDataGenerator.ts`

**Current Behavior:**
- **Lines 112-157**: `GroundTruth` interface has `hiddenFacts` array, but it's generic (tick-based facts), not narrative facts tied to tickers
- **Lines 328-361**: `generateGroundTruth()` generates price history using **random walk**:
  ```typescript
  const change = (this.rng.next() - 0.48) * 0.02; // Slight upward bias
  currentPrice = currentPrice * (1 + change);
  ```
- **Lines 466-735**: `generateTicks()` updates prices from `groundTruth.priceHistory` (which is random walk)
- **Lines 389-411**: `hiddenFacts` are generated as generic tick-based facts, not narrative facts

**Key Insight**: The infrastructure for hidden facts exists but isn't connected to event generation or price movement. We need narrative facts that affect specific tickers.

### 2.2 GameWorld.ts
**Location**: `packages/engine/src/GameWorld.ts`

**Current Behavior:**
- **Lines 392-491**: `generate()` creates 30-day timeline with events
- **Lines 498-546**: `generateEarlyWorldEvents()` generates events based on day number and probability, **not** hidden facts
- **Lines 553-590**: `generateMidWorldEvents()` uses `this.config.outcome` to bias events, but events are not causally linked to specific hidden facts
- **Lines 1222-1283**: `generateTickEvents()` is called by GameLoop but doesn't accept hidden facts
- **Lines 637-689**: `generateLateWorldEvents()` uses probability-based triggers

**Key Insight**: Events are generated probabilistically or based on outcome bias, but there's no causal chain from hidden facts → events. We need to add a method that generates events deterministically from hidden facts.

### 2.3 generate-training-data.ts
**Location**: `packages/engine/examples/generate-training-data.ts`

**Current Behavior:**
- **Lines 108-134**: Uses `GameLoop.tick()` which calls `MarketDecisionEngine` for NPC trading
- **Lines 125-134**: Runs 24 ticks (hours 0-23) but doesn't integrate with BenchmarkDataGenerator
- No connection between `BenchmarkDataGenerator` and `GameWorld`/`GameLoop`
- No "Market Mover" agent that reacts to events

**Key Insight**: The training data generation script doesn't use `BenchmarkDataGenerator` at all. We need to integrate them or create a unified approach.

### 2.4 GameLoop.ts
**Location**: `packages/engine/src/GameLoop.ts`

**Current Behavior:**
- **Lines 76-315**: `tick()` method orchestrates:
  1. Market decisions (NPC trading)
  2. World event generation (`world.generateTickEvents()`)
  3. Feed generation
  4. Relationship evolution
- **Lines 223-237**: Events are generated but prices are updated via trading volume, not events
- No "Market Mover" agent that translates events → price changes

**Key Insight**: Prices are updated via `updateMarketPricesFromTrades()` in `game-tick.ts` (lines 2389-2549), which calculates prices based on **trade volume**, not events. We need a separate "Market Mover" that directly translates events → price changes.

### 2.5 MarketDecisionEngine.ts
**Location**: `packages/engine/src/MarketDecisionEngine.ts`

**Current Behavior:**
- Generates NPC trading decisions based on context (posts, events, relationships)
- NPCs react to events, but prices don't directly react to events
- Prices are updated via trading volume impact

**Key Insight**: NPCs already see events, but we need a separate "Market Mover" that directly translates events → price changes, independent of NPC trading.

---

## 3. Architecture Design

### 3.1 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Ground Truth Generation (BenchmarkDataGenerator)        │
│    - Hidden Narrative Fact: "TeslAI has battery flaw"       │
│    - Stored in groundTruth.hiddenNarrativeFacts[0]          │
│    - Format: { fact: string, affectsTickers: string[] }   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Event Generation (GameWorld)                           │
│    - Receives hidden facts from GroundTruth                │
│    - Day 5: Generate "Leak" event (battery flaw discovered)│
│    - Day 10: Generate "Recall Rumor" event                 │
│    - Events stored in WorldEvent[]                         │
│    - Events are deterministic based on hidden facts         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Market Mover Agent (NEW)                               │
│    - Receives: Current prices + New events this tick       │
│    - LLM Call: "Given these events, how should prices move?"│
│    - Output: Price adjustments per ticker                   │
│    - Example: "Recall Rumor" → TSLA: -5%                   │
│    - Fallback: Deterministic rules if LLM fails            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Price Update (BenchmarkDataGenerator / generate-training)│
│    - Apply Market Mover's price adjustments                │
│    - Store in groundTruth.priceHistory                     │
│    - Update perpetual market prices                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Component Changes

#### 3.2.1 BenchmarkDataGenerator.ts

**Changes:**

1. **Extend GroundTruth interface** (lines 112-157):
   ```typescript
   export interface GroundTruth {
     // ... existing fields ...
     
     /** Hidden narrative facts that drive causal events */
     hiddenNarrativeFacts?: Array<{
       fact: string;              // e.g., "TeslAI has secret battery flaw"
       affectsTickers: string[];   // e.g., ["TSLA"]
       eventSchedule?: Array<{     // Optional: deterministic event schedule
         day: number;
         eventType: 'leak' | 'rumor' | 'scandal' | 'development';
         description?: string;
       }>;
     }>;
   }
   ```

2. **Modify `generateGroundTruth()`** (lines 328-461):
   - Generate **ONE** hidden narrative fact per simulation (start simple, add multiple facts later)
   - The fact should affect specific tickers from `initialState.perpetualMarkets`
   - Store in `groundTruth.hiddenNarrativeFacts`
   - **Remove random walk** from price history generation
   - Don't pre-generate price history - it will be generated during tick generation based on events

3. **Modify `generateTicks()`** (lines 466-735):
   - Accept optional `GameWorld` instance and `MarketMoverAgent` instance
   - For each tick:
     - Pass `groundTruth.hiddenNarrativeFacts` to event generation
     - Generate events causally from hidden facts
     - Call Market Mover to get price adjustments based on events
     - Apply price adjustments to perpetual markets
     - Store in `groundTruth.priceHistory`

**Key Design Decision**: We need to integrate `BenchmarkDataGenerator` with `GameWorld` and `MarketMoverAgent`. This requires either:
- Option A: Pass `GameWorld` and `MarketMoverAgent` to `BenchmarkDataGenerator.generate()`
- Option B: Create a unified simulation orchestrator that uses all three components

**Recommendation**: Option B - Create a unified orchestrator in `generate-training-data.ts` that coordinates all components.

#### 3.2.2 GameWorld.ts

**Changes:**

1. **Add method `generateEventsFromHiddenFacts()`**:
   ```typescript
   /**
    * Generate events causally linked to hidden narrative facts
    * @param hiddenFacts - Array of hidden facts with ticker associations
    * @param currentDay - Current day number (1-30)
    * @param currentHour - Current hour (0-23)
    * @returns Array of WorldEvent causally linked to hidden facts
    */
   private async generateEventsFromHiddenFacts(
     hiddenFacts: Array<{ fact: string; affectsTickers: string[] }>,
     currentDay: number,
     currentHour: number
   ): Promise<WorldEvent[]>
   ```
   
   **Logic:**
   - For each hidden fact, check if it should trigger an event on this day/hour
   - Use deterministic base schedule (e.g., Day 5 → "Leak", Day 10 → "Recall Rumor")
   - Add probabilistic jitter: ±4-8 hours around the base day/hour to prevent overfitting to exact ticks
   - Use LLM to generate rich event descriptions based on the hidden fact
   - Return events that are causally linked to hidden facts

2. **Modify `generateTickEvents()`** (lines 1222-1283):
   - Add optional `hiddenFacts` parameter
   - Call `generateEventsFromHiddenFacts()` if hidden facts provided
   - Merge with existing probability-based events (for variety)
   - Return combined events

3. **Modify `generateEarlyWorldEvents()`, `generateMidWorldEvents()`, `generateLateWorldEvents()`**:
   - Add optional `hiddenFacts` parameter
   - Generate events causally linked to hidden facts when provided
   - Keep existing probability-based events for non-causal variety

**Key Design Decision**: Events use **deterministic base + probabilistic jitter** (±4-8 hours) to prevent overfitting to exact tick numbers while maintaining causal sequence.

**Decision**: The "Fact" determines the *sequence* (Leak → Rumor → Scandal), but the exact *tick* jitters by ±4-8 hours around the base day/hour.

#### 3.2.3 Market Mover Agent (NEW)

**Location**: `packages/engine/src/services/market-mover-agent.ts` (new file)

**Purpose**: LLM-powered agent that translates events into price movements.

**Interface:**
```typescript
export type VolatilityBucket = 'low' | 'medium' | 'high';

export interface MarketMoverAgent {
  /**
   * Given current market state and new events, determine price adjustments
   * @param currentPrices - Map of ticker -> current price
   * @param events - Events that occurred this tick
   * @param context - Optional context (recent events, market sentiment)
   * @returns Map of ticker -> price adjustment percentage (e.g., -0.05 for -5%)
   */
  generatePriceAdjustments(
    currentPrices: Map<string, number>,
    events: WorldEvent[],
    context?: {
      recentEvents?: WorldEvent[];
      marketSentiment?: number;
      affectedTickers?: string[];
    }
  ): Promise<Map<string, number>>; // Returns percentage change (delta), not absolute price
}

export class MarketMoverAgent implements MarketMoverAgent {
  constructor(
    private llmClient: BabylonLLMClient,
    private rng: SeededRandom, // For bucket selection and jitter
    private options?: {
      model?: string; // Default: same as MarketDecisionEngine (qwen-32b)
      temperature?: number;
      useDeterministicFallback?: boolean; // Default: true (use fallback by default)
    }
  ) {}
  
  async generatePriceAdjustments(
    currentPrices: Map<string, number>,
    events: WorldEvent[],
    context?: MarketMoverContext
  ): Promise<Map<string, number>> {
    // Returns Map<ticker, percentageChange> where percentageChange is -0.05 for -5%
  }
}
```

**Implementation Strategy:**

1. **Volatility Bucket System**:
   - Don't hardcode specific percentages (e.g., "-5%")
   - Define volatility buckets: `Low (-2% to -4%)`, `Medium (-5% to -10%)`, `High (-15%+)`
   - LLM or fallback rules select the *bucket* based on event type/severity
   - Use seeded RNG to pick exact decimal within that bucket (prevents memorization)

2. **LLM-Based Price Adjustment** (optional, fallback preferred):
   - Use `BabylonLLMClient.generateJSON()` to call LLM (same model as MarketDecisionEngine: qwen-32b)
   - Prompt: "Given these events, select volatility bucket (low/medium/high) for affected tickers"
   - Input: Events, affected tickers
   - Output: JSON with volatility bucket per ticker: `{ "TSLA": "medium" }`
   - Then use RNG to select exact percentage within bucket

3. **Deterministic Fallback Rules** (default):
   - Use rule-based bucket selection (faster, cheaper, more consistent):
     - "Leak" event → `medium` bucket (-5% to -10%) for affected ticker
     - "Recall Rumor" → `medium` bucket (-5% to -10%) for affected ticker
     - "Scandal" → `high` bucket (-15%+) for affected ticker
     - "Positive Development" → `low` bucket (+3% to +7%)
     - "Deal" → `medium` bucket (+5% to +10%)
   - Use seeded RNG to select exact percentage within bucket
   - **Default behavior**: Use fallback rules (LLM only for complex scenarios)

4. **Return Format**:
   - Return **percentage change (delta)**, not absolute prices
   - Example: `Map("TSLA", -0.05)` means TSLA drops 5%
   - Caller multiplies: `newPrice = currentPrice * (1 + percentageChange)`
   - **Why**: "TSLA drops 5%" is universally applicable regardless of starting price. Absolute prices require LLM to know exact current price, which introduces math errors.

5. **Error Handling**:
   - Default to deterministic fallback (fast, cheap, consistent)
   - If LLM is enabled and fails/timeouts, fall back to deterministic rules
   - Log fallback usage for monitoring

**Key Design Decision**: Market Mover returns **percentage change (delta)**, not absolute prices.

**Decision**: Percentage change is universally applicable and prevents LLM math errors. Caller handles multiplication.

#### 3.2.4 generate-training-data.ts

**Changes:**

1. **Add Feature Flag**:
   - Add `useCausalSimulation` flag to config (default: `false` for backward compatibility)
   - Only enable causal simulation when flag is `true`

2. **Integrate BenchmarkDataGenerator**:
   - Create `BenchmarkDataGenerator` instance
   - Generate ground truth with hidden narrative facts (when `useCausalSimulation` is true)
   - Extract hidden facts from `groundTruth.hiddenNarrativeFacts`

3. **Create Market Mover Agent**:
   - Initialize `MarketMoverAgent` with `BabylonLLMClient` (same model as MarketDecisionEngine: qwen-32b)
   - Pass seeded RNG to MarketMoverAgent for reproducibility
   - Use deterministic fallback by default (fast, cheap, consistent)

4. **Modify tick loop** (lines 125-134):
   - After `world.generateTickEvents()` returns events
   - Pass hidden facts to `world.generateTickEvents()` for causal event generation
   - Call Market Mover Agent with current prices + new events
   - Market Mover returns percentage changes (deltas)
   - Apply price adjustments: `newPrice = currentPrice * (1 + percentageChange)`
   - Store price updates in `groundTruth.priceHistory`

5. **Replace random price logic**:
   - When `useCausalSimulation` is true, remove random walk logic
   - Prices only change via Market Mover reactions to events
   - When `useCausalSimulation` is false, use existing random walk (backward compatibility)

**Integration Approach**: Modify `generate-training-data.ts` directly (no separate orchestrator class).

**Decision**: Keep it simple - instantiate `BenchmarkDataGenerator` inside `generate-training-data.ts` and use it to drive the state. No need for a separate orchestrator class for PR #6.

---

## 4. Dependencies & Constraints

### 4.1 Dependencies

**Existing Components:**
- ✅ **BabylonLLMClient**: Already exists (`packages/engine/src/llm/openai-client.ts`), used by `MarketDecisionEngine`
- ✅ **GameWorld**: Already generates events (`packages/engine/src/GameWorld.ts`), needs extension for hidden facts
- ✅ **WorldEvent interface**: Already defined (`packages/shared/src/game-types.ts`), compatible with our use case
- ✅ **GroundTruth interface**: Already has `hiddenFacts`, needs extension for narrative facts
- ✅ **BenchmarkDataGenerator**: Already generates benchmark data, needs integration with event generation

**New Components:**
- ⚠️ **MarketMoverAgent**: New service class to create
- ⚠️ **CausalSimulationOrchestrator**: Optional unified orchestrator (recommended)

### 4.2 Constraints

**LLM Costs:**
- Market Mover will make 1 LLM call per tick
- For 24 ticks/day × 30 days = 720 calls per simulation
- Need to optimize prompt size and consider caching identical event sets
- **Mitigation**: Use deterministic fallback for common event patterns, cache responses

**Determinism:**
- For benchmark data, we need reproducible results
- Use seeded RNG for fallback rules if LLM fails
- Use deterministic event schedules (Day 5 leak, Day 10 rumor)
- **Mitigation**: Always use seeded RNG, deterministic event schedules

**Backward Compatibility:**
- `BenchmarkDataGenerator` is used elsewhere (e.g., `ArchetypeMatchupBenchmark.ts`)
- Ensure changes don't break existing code
- **Mitigation**: Make new fields optional, add feature flag `useCausalSimulation` (default: `false`)

**Event Timing:**
- Events must be generated deterministically based on hidden facts (e.g., Day 5 leak, Day 10 rumor)
- But we also want some variety for training data diversity
- **Mitigation**: Use deterministic base schedule with optional probabilistic variation

**Performance:**
- Simulation should complete in reasonable time (< 10 min for 30 days)
- 720 LLM calls could be slow and expensive
- **Mitigation**: Use deterministic fallback by default (fast, cheap, consistent), LLM only for complex scenarios

### 4.3 Edge Cases

1. **No events this tick**: Market Mover should return no price changes (or minimal drift ±0.1%)
2. **Multiple events affecting same ticker**: Market Mover should aggregate effects (e.g., -5% + -3% = -8%)
3. **LLM timeout/failure**: Fall back to deterministic rules based on event type
4. **Hidden fact doesn't match any ticker**: Skip event generation for that fact
5. **Event affects multiple tickers**: Market Mover should adjust all affected tickers
6. **Event type not in fallback rules**: Use neutral adjustment (0% or minimal drift)
7. **Price goes negative**: Enforce minimum price floor (e.g., 10% of initial price)
8. **Price goes too high**: Enforce maximum price ceiling (e.g., 400% of initial price)

---

## 5. Implementation Steps

### Phase 1: Extend GroundTruth & BenchmarkDataGenerator
**Estimated Time**: 2-3 hours

1. Add `hiddenNarrativeFacts` to `GroundTruth` interface
2. Modify `generateGroundTruth()` to generate **ONE** narrative fact per simulation (start simple)
3. Remove random walk from price history generation (when `useCausalSimulation` is true)
4. Add optional `eventSchedule` to hidden facts for deterministic base timing with jitter
5. **Test**: Verify `groundTruth` contains narrative facts with correct structure

**Files to Modify:**
- `packages/training/src/benchmark/BenchmarkDataGenerator.ts`

**Test Cases:**
- Generate ground truth with 1 hidden fact affecting TSLA
- Verify fact structure: `{ fact: string, affectsTickers: string[] }`
- Verify no price history is pre-generated

### Phase 2: Create Market Mover Agent
**Estimated Time**: 4-5 hours

1. Create `packages/engine/src/services/market-mover-agent.ts`
2. Implement `MarketMoverAgent` class with LLM integration
3. Add deterministic fallback rules for common event types
4. Add error handling and logging
5. **Test**: Unit test with mock events, verify price adjustments

**Files to Create:**
- `packages/engine/src/services/market-mover-agent.ts`

**Test Cases:**
- Test with "Leak" event → verify Medium bucket selected, RNG picks value in -5% to -10% range
- Test with "Recall Rumor" event → verify Medium bucket selected, RNG picks value in -5% to -10% range
- Test with "Scandal" event → verify High bucket selected, RNG picks value in -15%+ range
- Test with LLM failure → verify fallback rules work
- Test with multiple events → verify bucket aggregation works
- Test with no events → verify no price change (or minimal drift)
- Test return format → verify percentage change (delta), not absolute price

### Phase 3: Extend GameWorld for Causal Events
**Estimated Time**: 3-4 hours

1. Add `generateEventsFromHiddenFacts()` method
2. Modify `generateTickEvents()` to accept hidden facts
3. Update early/mid/late event generators to use hidden facts
4. Add deterministic event scheduling logic
5. **Test**: Verify events are generated causally (Day 5 leak, Day 10 rumor)

**Files to Modify:**
- `packages/engine/src/GameWorld.ts`

**Test Cases:**
- Test with hidden fact "TeslAI battery flaw" → verify Day 5 ±4 hours leak event (with jitter)
- Test with hidden fact "TeslAI battery flaw" → verify Day 10 ±4 hours recall rumor (with jitter)
- Test with no hidden facts → verify existing probabilistic events still work
- Test event sequence → verify Leak → Rumor → Scandal sequence maintained despite jitter

### Phase 4: Integrate in generate-training-data.ts
**Estimated Time**: 3-4 hours

1. Add `useCausalSimulation` feature flag (default: `false` for backward compatibility)
2. Integrate `BenchmarkDataGenerator` directly in `generate-training-data.ts`
3. Create `MarketMoverAgent` instance with same LLM model as MarketDecisionEngine (qwen-32b)
4. Modify tick loop to:
   - Pass hidden facts to `world.generateTickEvents()` for causal event generation
   - Call Market Mover after events generated
   - Apply percentage adjustments: `newPrice = currentPrice * (1 + percentageChange)`
5. Store price updates in `groundTruth.priceHistory`
6. **Test**: End-to-end test, verify price movements correlate with events

**Files to Modify:**
- `packages/engine/examples/generate-training-data.ts` (modify directly, no orchestrator class)

**Test Cases:**
- Generate training data with hidden fact → verify events on correct days
- Verify price drops on Day 5 (leak event)
- Verify price drops on Day 10 (recall rumor event)
- Verify price movements are consistent across runs with same seed
- Verify no random walk behavior

### Phase 5: Validation & Refinement
**Estimated Time**: 2-3 hours

1. Generate sample training data (10-20 simulations)
2. Verify: Event on Day 5 → Price drop on Day 5
3. Verify: Event on Day 10 → Price drop on Day 10
4. Check for learnable signal (event → price correlation > 0.5)
5. Refine Market Mover prompts based on results
6. Add logging and monitoring

**Validation Tests:**
- **Causal Chain Test**: Generate data with "TeslAI battery flaw" → verify Day 5 leak event → verify TSLA price drop
- **Signal Strength Test**: Calculate correlation between event types and price movements (should be > 0.5)
- **Reproducibility Test**: Run twice with same seed → verify identical events and prices
- **Learnability Test**: Train simple model on event → price pairs → verify it can predict price changes

---

## 6. Unknowns & Risks

### 6.1 Unknowns

1. **LLM Consistency**: Will the same events always produce similar price adjustments?
   - **Investigation**: Test with same events multiple times, measure variance
   - **Mitigation**: Use `temperature=0` for deterministic outputs, or use deterministic fallback

2. **Event → Price Mapping**: What volatility bucket for each event type?
   - **Decision**: Use volatility buckets (Low/Medium/High) with RNG within bucket
   - **Mitigation**: Start with conservative bucket assignments, refine based on validation

3. **Multiple Hidden Facts**: How to handle 2-3 hidden facts affecting different tickers?
   - **Investigation**: Test with multiple facts, verify no interference
   - **Mitigation**: Each fact generates independent events, Market Mover aggregates effects

4. **Event Timing**: Should events always occur on specific days (Day 5, Day 10) or probabilistically?
   - **Decision**: Deterministic base + probabilistic jitter (±4-8 hours)
   - **Rationale**: Prevents overfitting to exact tick numbers while maintaining causal sequence
   - **Mitigation**: Fact determines sequence (Leak → Rumor → Scandal), exact tick jitters ±4-8 hours

5. **Integration Complexity**: How to integrate `BenchmarkDataGenerator` with `GameWorld`?
   - **Investigation**: Review both codebases, identify integration points
   - **Mitigation**: Create unified orchestrator that coordinates all components

### 6.2 Risks

1. **LLM Latency**: 720 LLM calls per simulation could be slow
   - **Risk Level**: Medium
   - **Mitigation**: Use deterministic fallback by default, LLM only for complex scenarios, cache responses

2. **Cost**: LLM calls cost money
   - **Risk Level**: Low (can use free tier or low-cost models)
   - **Mitigation**: Use deterministic fallback by default, optimize prompt size

3. **Overfitting**: If Market Mover is too deterministic, model might memorize patterns
   - **Risk Level**: Medium
   - **Mitigation**: Use volatility buckets with RNG within bucket (prevents memorizing exact percentages), use probabilistic jitter for event timing (±4-8 hours)

4. **Backward Compatibility**: Changes to `BenchmarkDataGenerator` might break existing benchmarks
   - **Risk Level**: Low
   - **Mitigation**: Make new fields optional, add feature flag for causal mode

5. **Complexity**: Adding causal simulation increases system complexity
   - **Risk Level**: Medium
   - **Mitigation**: Keep components modular, add comprehensive tests, document architecture

### 6.3 Mitigation Strategies

- **Fallback Rules**: Always have deterministic fallback if LLM fails
- **Caching**: Cache Market Mover responses for identical event sets (if deterministic)
- **Seeded RNG**: Use seeded random for fallback rules to ensure reproducibility
- **Feature Flags**: Add flag to enable/disable Market Mover (fall back to random walk)
- **Monitoring**: Log LLM usage, fallback usage, price adjustments for analysis
- **Testing**: Comprehensive unit tests, integration tests, validation tests

---

## 7. Decisions & Answers

1. **Event Timing**: Deterministic base + probabilistic jitter (±4-8 hours)
   - **Answer**: The "Fact" determines the *sequence* (Leak → Rumor → Scandal), but the exact *tick* jitters by ±4-8 hours around the base day/hour
   - **Rationale**: Prevents overfitting to exact tick numbers while maintaining causal sequence

2. **Price Magnitude**: Use volatility buckets with RNG within bucket
   - **Answer**: Don't hardcode "-5%". Define buckets: `Low (-2% to -4%)`, `Medium (-5% to -10%)`, `High (-15%+)`. Market Mover selects bucket, then RNG picks exact decimal within bucket.
   - **Rationale**: Prevents model from memorizing specific numbers

3. **Multiple Facts**: Start with ONE dominant narrative per simulation
   - **Answer**: Phase 1 uses one major hidden fact (e.g., "TeslAI battery"). Phase 2 (later) adds background noise facts.
   - **Rationale**: Multi-cause causality is extremely hard for a v0 model to disentangle

4. **Market Mover Model**: Use same model as MarketDecisionEngine (qwen-32b)
   - **Answer**: Use `qwen-32b` for consistency and cost. We don't need a smarter model to move prices.
   - **Rationale**: Consistency with narrative generation, cost efficiency

5. **Backward Compatibility**: Feature flag `useCausalSimulation` (default: false)
   - **Answer**: Add `useCausalSimulation` flag in config, default to `false` so we don't break existing benchmarks until stable.
   - **Rationale**: Maintains backward compatibility while allowing gradual rollout

6. **Integration Approach**: Modify `generate-training-data.ts` directly
   - **Answer**: Instantiate `BenchmarkDataGenerator` inside `generate-training-data.ts` and use it to drive the state. Keep it simple.
   - **Rationale**: No need for separate orchestrator class for PR #6. Keep it simple.

7. **Price Adjustment Format**: Percentage change (delta), not absolute prices
   - **Answer**: Market Mover returns percentage change (e.g., `-0.05` for -5%), caller multiplies: `newPrice = currentPrice * (1 + percentageChange)`
   - **Rationale**: "TSLA drops 5%" is universally applicable. Absolute prices require LLM to know exact current price, which introduces math errors (hallucinations).

---

## 8. Example Flow

### Example: TeslAI Battery Flaw Scenario

```
Hidden Fact (GroundTruth):
{
  fact: "TeslAI has a secret battery flaw that causes overheating",
  affectsTickers: ["TSLA"],
  eventSchedule: [
    { day: 5, eventType: "leak", description: "Internal documents leaked" },
    { day: 10, eventType: "rumor", description: "Recall rumor spreads" }
  ]
}

Day 5 Event (GameWorld):
{
  id: "event-123",
  day: 5,
  type: "leak",
  description: "Internal documents leaked: TeslAI battery flaw discovered",
  visibility: "public",
  actors: ["insider-1"],
  sentimentSignal: -0.6,
  signalClarity: 0.7
}

Day 5 Price Adjustment (Market Mover):
Input: 
  - Event: "leak" affecting TSLA
  - Current price: $450
  - Context: Day 5, early in simulation

Process:
  1. Select volatility bucket: "leak" → Medium bucket (-5% to -10%)
  2. RNG selects exact percentage: -0.067 (within Medium bucket)
  3. Return percentage change: -0.067

Output: TSLA → percentage change: -0.067 (-6.7%)
Caller calculates: newPrice = $450 * (1 - 0.067) = $419.85
Reason: "Leak event reveals negative information, moderate market impact (Medium bucket)"

Day 10 Event (GameWorld):
{
  id: "event-456",
  day: 10,
  type: "rumor",
  description: "Industry sources report potential TeslAI recall due to battery issues",
  visibility: "public",
  actors: ["journalist-1"],
  sentimentSignal: -0.8,
  signalClarity: 0.6
}

Day 10 Price Adjustment (Market Mover):
Input:
  - Event: "recall rumor" affecting TSLA
  - Current price: $419.85 (from Day 5)
  - Context: Day 10, recall rumors more severe

Process:
  1. Select volatility bucket: "recall rumor" → Medium bucket (-5% to -10%)
  2. RNG selects exact percentage: -0.082 (within Medium bucket)
  3. Return percentage change: -0.082

Output: TSLA → percentage change: -0.082 (-8.2%)
Caller calculates: newPrice = $419.85 * (1 - 0.082) = $385.42
Reason: "Recall rumor increases negative sentiment, additional price pressure (Medium bucket)"

Result: Clear causal chain creates learnable pattern:
- Day 5 ±4 hours leak → TSLA drops Medium bucket (-5% to -10%), exact value varies (e.g., -6.7%)
- Day 10 ±4 hours recall rumor → TSLA drops Medium bucket (-5% to -10%), exact value varies (e.g., -8.2%)
- Model can learn: "leak event" → predict Medium bucket drop, "recall rumor" → predict Medium bucket drop
- Jitter prevents overfitting to exact tick numbers, buckets prevent memorizing exact percentages
```

---

## 9. Next Steps

1. **Review this plan** with stakeholders
2. **Answer clarification questions** above
3. **Begin Phase 1** implementation (extend GroundTruth)
4. **Iterate** based on feedback and test results

---

## 10. Appendix: Related Files & References

**Key Files:**
- `packages/training/src/benchmark/BenchmarkDataGenerator.ts` - Benchmark data generation
- `packages/engine/src/GameWorld.ts` - Event generation
- `packages/engine/src/GameLoop.ts` - Game tick orchestration
- `packages/engine/examples/generate-training-data.ts` - Training data generation script
- `packages/engine/src/MarketDecisionEngine.ts` - NPC trading decisions
- `packages/shared/src/game-types.ts` - WorldEvent interface
- `packages/engine/src/llm/openai-client.ts` - BabylonLLMClient

**Related Documentation:**
- `AGENTS.md` - Repository guidelines
- `.cursorrules` - Code style and testing requirements

**External References:**
- Real-world event → price correlation research (to be investigated)
- LLM prompt engineering best practices (to be researched)
