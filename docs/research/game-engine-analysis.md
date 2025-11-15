# Babylon Game Engine: Comprehensive Research Report

**Date**: November 15, 2025  
**Author**: Game Engine Analysis  
**Status**: Critical Assessment for Reinforcement Learning Readiness

---

## Executive Summary

**Current State**: The Babylon game engine shows sophisticated architecture for content generation but has **critical gaps** in creating a learnable, skill-based prediction market game.

**Key Finding**: The engine generates rich narrative content but lacks the **coherent information gradient** needed for reinforcement learning. Agents cannot reliably improve because:

1. ❌ **No explicit question arc management** - Events point randomly, not progressively
2. ❌ **Missing bias consistency** - NPCs don't maintain deceptive personas
3. ❌ **No information verification layer** - No way to validate "truth" vs "lies"
4. ⚠️ **Unclear signal strength over time** - Events don't build toward resolution
5. ⚠️ **Group chat randomness** - Insider info not consistently valuable

**Recommendation**: Implement structured information architecture with:
- Question-centric event planning (uncertainty → clarity arc)
- NPC consistency tracking (insiders, deceivers, truth-tellers)
- Explicit clue strength progression
- Bias/deception validation
- Integration tests verifying learnability

---

## Part 1: Current Architecture Analysis

### 1.1 Question Lifecycle

**File**: `QuestionManager.ts`

**Current Implementation**:
```typescript
async generateDailyQuestions(params: QuestionCreationParams): Promise<Question[]> {
  // Generates 1-3 questions per day
  // Uses LLM with recent events context
  // Sets resolutionDate 1-7 days in future
  // Assigns random outcome (true/false)
}
```

**What Works**:
✅ Questions have predetermined outcomes
✅ Resolution dates set (1-7 days)
✅ Context from recent events included
✅ Max 20 questions enforced

**Critical Gaps**:
❌ **No arc planning** - Question outcome is set but no plan for HOW it unfolds
❌ **No clue distribution strategy** - No explicit "early vague → late clear" logic
❌ **Random outcome assignment** - `Math.random() > 0.5` has no narrative coherence
❌ **No verification event guaranteed** - Resolution event generated but not structurally required

**Evidence**:
```typescript
// QuestionManager.ts:875
outcome: Math.random() > 0.5, // Random YES or NO outcome
```

This means outcomes are disconnected from narrative setup. A question about "Will TechCorp launch product?" could be YES even if TechCorp just had a massive scandal.

### 1.2 Event Generation

**Files**: `GameGenerator.ts`, `GameWorld.ts`

**Current Implementation**:
```typescript
private async generateDayEventsBatch(
  day: number,
  eventRequests: Array<{...}>,
  questions: Question[],
  fullContext: string,
  // ...
): Promise<Array<{ eventNumber: number; event: string; pointsToward: 'YES' | 'NO' | null }>>
```

**What Works**:
✅ Events have `pointsToward` field for question hints
✅ LLM generates contextual event descriptions
✅ Events tied to questions via `relatedQuestion` field
✅ Full context passed to LLM

**Critical Gaps**:
❌ **No arc planning** - Events generated day-by-day without overall question arc
❌ **Random hint revelation** - `shouldRevealAnswer()` uses random chance, not strategic timing
❌ **No contradiction detection** - Events can contradict each other
❌ **No certainty progression** - No explicit early=vague → late=clear enforcement

**Evidence**:
```typescript
// GameGenerator.ts:1355-1361
private shouldRevealAnswer(_day: number, phase: string): boolean {
  if (phase === 'Early') return Math.random() > 0.0;    // Always reveals? Bug?
  if (phase === 'Middle') return Math.random() > 0.1;  // 90% chance - too high
  if (phase === 'Late') return Math.random() > 0.6;    // 40% chance - backwards?
  if (phase === 'Climax') return Math.random() > 0.3;  // 70% chance
  return true; // Resolution always reveals
}
```

**BUG DETECTED**: Early phase `Math.random() > 0.0` is always true (100% reveal rate in early game). This makes questions TOO easy.

### 1.3 Feed Generation & Bias

**File**: `FeedGenerator.ts`

**Current Implementation**:
```typescript
private async generateReactionsBatch(
  actors: Actor[],
  worldEvent: WorldEvent,
  outcome: boolean
): Promise<Array<{ post: string; sentiment: number; clueStrength: number; pointsToward: boolean | null }>>
```

**What Works**:
✅ Batched LLM calls for efficiency (90% cost reduction)
✅ Per-actor emotional context (mood, luck)
✅ Relationship context included
✅ Group chat context influences posts
✅ Multiple response types (news, reactions, commentary, conspiracy)

**Critical Gaps**:
❌ **No NPC consistency tracking** - NPCs don't have persistent "truth-telling" vs "deceptive" personas
❌ **Outcome parameter pollutes feed** - `outcome: boolean` passed to all generation = answer leaked to LLM
❌ **No lie detection** - No way to verify if NPC is lying vs telling truth
❌ **Bias is one-shot** - NPCs don't maintain consistent biases across posts
❌ **No insider advantage verification** - Group chat info might not actually help

**Evidence**:
```typescript
// FeedGenerator.ts:709-735
private async generateReactionsBatch(
  actors: Actor[],
  worldEvent: WorldEvent,
  outcome: boolean  // ❌ THIS LEAKS THE ANSWER TO LLM
): Promise<...> {
  // Uses event's explicit hint if available, otherwise use outcome for coherence
  const eventContext = worldEvent.pointsToward
    ? `This development suggests things are trending toward ${worldEvent.pointsToward}.`
    : `Based on this event, the situation is ${outcome ? 'progressing positively' : 'facing setbacks'}.`;
```

**CRITICAL ISSUE**: The LLM knows the outcome when generating posts. This means posts are biased toward the answer, making it easier than intended.

### 1.4 Group Chat System

**File**: `GameGenerator.ts` (generateDayGroupMessagesBatch)

**Current Implementation**:
```typescript
private async generateDayGroupMessagesBatch(
  // Generates 1-3 messages per group per day
  // Uses full context (scenarios, questions, events)
  // Includes relationship context
  // Emotional state influences tone
)
```

**What Works**:
✅ Group membership based on relationships
✅ Conversation history included
✅ Emotional state influences messages
✅ Insider vs outsider distinction

**Critical Gaps**:
❌ **No explicit insider knowledge model** - What do insiders actually KNOW that outsiders don't?
❌ **No information advantage validation** - Is group chat info actually more accurate?
❌ **No strategic deception** - NPCs don't lie to gain advantage
❌ **Outcome leaks to LLM** - Full context includes predetermined outcomes
❌ **No trust/reliability tracking** - Can't learn which NPCs are reliable

**Evidence**: Group chat generation has access to `questions` array which includes `outcome` field:
```typescript
// GameGenerator.ts:1464
questions?: Question[],  // Question[] includes outcome: boolean field
```

This means the LLM generating group messages KNOWS the answers, so it can't create genuine misinformation.

### 1.5 NPC Decision Making

**File**: `MarketDecisionEngine.ts`

**Current Implementation**:
```typescript
async generateBatchDecisions(): Promise<TradingDecision[]> {
  // Gets context for all NPCs
  // Batches NPCs together
  // LLM generates trading decisions
  // Validates against constraints
}
```

**What Works**:
✅ NPCs get comprehensive context (posts, group chats, positions)
✅ Relationship context included
✅ Balance constraints enforced
✅ Token-aware batching

**Critical Gaps**:
❌ **No learning signal** - NPCs don't know if their previous bets were good
❌ **No skill differentiation** - All NPCs see same info, no expertise modeling
❌ **No insider advantage in decisions** - Group chat info not explicitly weighted
❌ **No consistency validation** - NPC can bet YES then NO randomly

---

## Part 2: Information Flow Analysis

### 2.1 How Information Flows (Current)

```
Question Created (outcome predetermined)
    ↓
Events Generated (LLM knows outcome via context)
    ↓
Feed Posts Generated (LLM knows outcome via parameter)
    ↓
Group Chats Generated (LLM knows outcome via questions array)
    ↓
NPCs Make Decisions (LLM sees all posts/chats)
```

**Problem**: Every generation step has access to the answer. The LLM is trying to "hide" an answer it already knows, rather than organically building a narrative where the answer emerges.

### 2.2 What Players/Agents See

**Public Feed**:
- News posts (media bias)
- Actor reactions (emotional bias)
- Expert commentary (analytical bias)
- Conspiracy theories (misinformation)
- Ambient posts (noise)

**Private Group Chats**:
- Insider discussions
- Strategic information
- Gossip about outsiders

**Markets**:
- Prediction market prices (YES/NO odds)
- Perpetual futures prices

### 2.3 Information Quality Gradient (Intended vs Actual)

**Intended Gradient**:
```
Day 1-10:  Rumors, vague hints, uncertainty
Day 11-20: Some clarity, conflicting signals
Day 21-25: Strong signals emerge
Day 26-30: Definitive proof, verification
```

**Actual Gradient** (from code analysis):

```typescript
// GameGenerator.ts:1355-1361
if (phase === 'Early') return Math.random() > 0.0;    // 100% reveal (BUG)
if (phase === 'Middle') return Math.random() > 0.1;  // 90% reveal
if (phase === 'Late') return Math.random() > 0.6;    // 40% reveal (backwards!)
if (phase === 'Climax') return Math.random() > 0.3;  // 70% reveal
```

**Actual Result**: Early game reveals MORE than late game. This is backwards.

---

## Part 3: Bias & Deception Analysis

### 3.1 Current Bias Mechanisms

**ArticleGenerator** (Lines 262-271):
```typescript
let biasDirection = 'neutral';
let biasScore = 0;

if (alignedActors.length > 0) {
  biasDirection = 'protective'; // Downplay negative news about aligned actors
  biasScore = 0.6;
} else if (opposingActors.length > 0) {
  biasDirection = 'critical'; // Play up negative news about opposing actors
  biasScore = -0.6;
}
```

**Assessment**:
✅ **Good**: Organizational bias based on affiliations
✅ **Good**: Protective vs critical framing
❌ **Missing**: No persistent bias tracking across articles
❌ **Missing**: No validation that bias actually affects content
❌ **Missing**: No way for agents to learn which orgs are biased

### 3.2 Deception & Truth-Telling

**Current State**: NO explicit deception system

**Evidence**: Searched all engine files - no:
- `reliability` field in actor types (exists in GameSimulator NPCs but not in production)
- `truthfulness` tracking
- `deception` strategies
- `insider` vs `outsider` knowledge distinction

**GameSimulator** (standalone, not production) HAS this:
```typescript
export interface NPC {
  id: string;
  name: string;
  role: 'insider' | 'expert' | 'journalist' | 'whistleblower' | 'politician' | 'deceiver';
  knowsTruth: boolean; // Does this NPC know the real outcome?
  reliability: number; // 0-1, how often they tell truth
  personality: string;
}
```

But this is NOT used in production `GameGenerator` or `FeedGenerator`.

**Critical Gap**: Production engine has no concept of who knows what or who lies.

### 3.3 Strategic Self-Interest

**Current Implementation**: Only in prompt text, not enforced

```typescript
// From FeedGenerator.ts prompts (lines 1602-1611)
PRIVATE CHAT RULES:
✅ Share insider info about YOUR orgs (be strategic about what you reveal)
✅ Discuss vulnerabilities, doubts, real plans
✅ Gossip about outsiders
❌ DON'T gossip about members IN this chat
❌ DON'T just repeat public statements
```

**Assessment**:
✅ **Good**: Prompt encourages strategic behavior
❌ **Not enforced**: No validation that NPCs actually follow this
❌ **No incentive structure**: NPCs have no reason to lie or hide info
❌ **No consistency**: NPC might share insider info one day, be vague the next

---

## Part 4: Learnability Analysis

### 4.1 Can Agents Get Better?

**Question**: If an agent plays 100 games, can it improve its prediction accuracy?

**Current State**: **Probably not reliably**

**Reasons**:

1. **Insufficient Signal Consistency**
   - NPCs don't have consistent personas (insider vs deceiver)
   - Bias is random per article, not persistent
   - Group chat value is unclear (is this actually better info?)

2. **Outcome Leakage**
   - LLM knows answers during generation
   - Posts subtly biased toward correct answer
   - Agent might learn to follow LLM's leakage rather than game mechanics

3. **Random Noise Dominates**
   - `shouldRevealAnswer()` uses random chances
   - Event `pointsToward` not strategically distributed
   - Conspiracy posts are noise but no way to filter them

4. **No Learning Gradient**
   - Early bets vs late bets have no clear risk/reward difference
   - No way to learn "trust this source, not that one"
   - No way to learn "group chat X is valuable, group chat Y is gossip"

### 4.2 What Would Make It Learnable?

**Required Components**:

1. **Information Source Reliability**
   ```
   Actor A: Insider, 90% truthful, always knows real info
   Actor B: Politician, 30% truthful, often lies for self-interest
   Actor C: Journalist, 70% truthful, sometimes gets bad sources
   ```
   
   → Agent can learn: "Weight Actor A's posts 3x, ignore Actor B unless cross-referenced"

2. **Strategic Arc Planning**
   ```
   Question: "Will TechCorp launch product?"
   Outcome: YES (predetermined)
   
   Day 1-10:  Mixed signals (40% YES, 60% NO from events) - uncertainty
   Day 11-20: Signals converge (60% YES, 40% NO) - smart agents can detect
   Day 21-25: Clear signals (80% YES, 20% NO) - becomes obvious
   Day 26-30: Verification (95% YES, 5% NO) - definitive proof
   ```
   
   → Agent can learn: "Early bets are risky but high value, late bets are safe but low value"

3. **Consistent NPC Behavior**
   ```
   Alice (insider at TechCorp):
   - Always knows TechCorp internal info
   - Posts protect TechCorp (bias)
   - Shares partial truth in group chats (strategic)
   - Trading reflects insider knowledge
   ```
   
   → Agent can learn: "Alice's TechCorp posts are biased but informative"

4. **Information Verification**
   ```
   Day 5:  Bob posts "TechCorp behind schedule" (pointsToward: NO)
   Day 8:  Alice posts "Testing going great!" (pointsToward: YES)
   Day 12: Leaked memo surfaces confirming Bob was right
   ```
   
   → Agent can learn: "Bob was accurate despite Alice's bias"

### 4.3 Current Learnability Score: 3/10

**Why So Low?**

| Requirement | Current | Score | Notes |
|-------------|---------|-------|-------|
| Consistent NPC personas | ❌ No | 0/10 | Can't learn who to trust |
| Information gradient | ⚠️ Partial | 3/10 | Random, not planned |
| Bias tracking | ⚠️ One-shot | 2/10 | Exists but not consistent |
| Insider advantage | ❌ No validation | 2/10 | Unclear if group chats help |
| Truth verification | ❌ No | 0/10 | Can't validate info |
| Strategic deception | ❌ No | 1/10 | Just prompt text |
| Event coherence | ⚠️ Partial | 4/10 | LLM tries but no structure |
| Resolution proof | ✅ Yes | 8/10 | Resolution events generated |
| Outcome independence | ❌ No | 0/10 | LLM knows answers |

**Average**: 20/80 = **25%** (2.5/10)

---

## Part 5: Critical Code Issues

### 5.1 Outcome Leakage

**Location**: Multiple files

**Issue**: Predetermined outcomes passed to LLM during generation

**Examples**:

1. **FeedGenerator.generateDayFeed** (line 375):
```typescript
async generateDayFeed(
  day: number,
  worldEvents: WorldEvent[],
  allActors: Actor[],
  outcome: boolean  // ❌ Answer leaked to LLM
): Promise<FeedPost[]>
```

2. **FeedGenerator.generateReactionsBatch** (line 712):
```typescript
const eventContext = worldEvent.pointsToward
  ? `This development suggests things are trending toward ${worldEvent.pointsToward}.`
  : `Based on this event, the situation is ${outcome ? 'progressing positively' : 'facing setbacks'}.`;
```

3. **GameGenerator.generateDay** (line 1235):
```typescript
const eventFeedPosts = await this.feedGenerator.generateDayFeed(
  day,
  events.map(e => ({ ... })),
  allActors,
  questions[0]!.outcome  // ❌ Answer leaked
);
```

**Impact**: 
- LLM subtly biases content toward correct answer
- Reduces genuine uncertainty
- Agent might learn LLM's tells rather than game mechanics
- Defeats purpose of prediction market

**Fix Required**: Remove outcome parameter, use only event-level hints

### 5.2 Random Hint Distribution Bug

**Location**: `GameGenerator.ts:1355-1361`

**Issue**: Probability logic is inverted

```typescript
if (phase === 'Early') return Math.random() > 0.0;    // Always true = 100% reveal
if (phase === 'Middle') return Math.random() > 0.1;  // 90% reveal  
if (phase === 'Late') return Math.random() > 0.6;    // 40% reveal (backwards!)
```

**Expected**:
```typescript
if (phase === 'Early') return Math.random() > 0.8;    // 20% reveal
if (phase === 'Middle') return Math.random() > 0.5;  // 50% reveal
if (phase === 'Late') return Math.random() > 0.2;    // 80% reveal
```

**Impact**: Game reveals answers too early, late game has LESS clarity than early

### 5.3 No NPC Reliability System

**Location**: Production actors don't have reliability field

**GameSimulator has it** (line 206-209):
```typescript
export interface NPC {
  knowsTruth: boolean;
  reliability: number; // 0-1, how often they tell truth
}
```

**Production Actor type does NOT**:
```typescript
// shared/types.ts - Actor interface
export interface Actor {
  // ... no knowsTruth field
  // ... no reliability field
  // ... no insiderKnowledge field
}
```

**Impact**: 
- All NPCs treated equally
- Can't have persistent liars
- Can't have reliable insiders
- Can't learn who to trust

### 5.4 No Event Arc Planning

**Current**: Events generated day-by-day independently

**Missing**: Pre-planned event sequences

**Example of what's needed**:
```typescript
interface QuestionArc {
  questionId: number;
  outcome: boolean;
  phases: {
    early: {
      // Day 1-10: Plant seeds of doubt
      targetClarity: 0.3,  // 30% certainty
      eventsPointingCorrect: 0.4,  // 40% point to answer
      eventsPointingWrong: 0.6,    // 60% point away (misdirection)
    },
    middle: {
      // Day 11-20: Evidence accumulates
      targetClarity: 0.6,  // 60% certainty
      eventsPointingCorrect: 0.65,
      eventsPointingWrong: 0.35,
    },
    late: {
      // Day 21-30: Truth emerges
      targetClarity: 0.9,  // 90% certainty
      eventsPointingCorrect: 0.85,
      eventsPointingWrong: 0.15,
    }
  }
}
```

**Current**: No such structure exists

---

## Part 6: Missing Components for RL Readiness

### 6.1 NPC Persona System

**Status**: ❌ Missing

**What's Needed**:
```typescript
interface NPCPersona {
  npcId: string;
  role: 'insider' | 'expert' | 'deceiver' | 'analyst' | 'public-figure';
  
  // Information access
  insiderOrgs: string[];  // Has inside info about these orgs
  expertise: string[];    // Expert in these domains
  
  // Behavioral traits
  truthfulness: number;   // 0-1, how often tells truth
  bias: {
    favors: string[];     // Actor/org IDs they favor
    opposes: string[];    // Actor/org IDs they oppose
  };
  
  // Strategic behavior
  selfInterest: 'wealth' | 'reputation' | 'ideology' | 'chaos';
  willingToLie: boolean;
  
  // Track record
  historicalAccuracy?: number;  // Learn over time
}
```

**Why Needed**: 
- Agents need consistent personas to learn patterns
- "Alice always protects TechCorp" → learnable signal
- "Bob lies 70% of time" → learnable noise filter

### 6.2 Question Arc Planner

**Status**: ❌ Missing

**What's Needed**:
```typescript
interface QuestionArcPlan {
  questionId: number;
  outcome: boolean;
  
  // Strategic event distribution
  eventPlan: {
    totalEvents: number;
    correctSignals: number;    // Events pointing to correct answer
    wrongSignals: number;      // Events pointing to wrong answer (misdirection)
    ambiguousSignals: number;  // Events that are unclear
    
    // Timing of clarity
    uncertaintyPeak: number;   // Day when uncertainty is highest
    clarityOnset: number;      // Day when answer starts becoming clear
    verificationDay: number;   // Day of definitive proof
  };
  
  // Information source plan
  insiderReveals: Array<{
    day: number;
    npcId: string;
    infoType: 'hint' | 'partial' | 'full';
  }>;
  
  // Misdirection plan
  redHerrings: Array<{
    day: number;
    eventDescription: string;
    pointsToward: 'YES' | 'NO';  // Opposite of truth
  }>;
}
```

**Why Needed**:
- Create intentional uncertainty arc
- Plan misdirection strategically
- Ensure resolution is satisfying
- Make early/mid/late bets have different risk profiles

### 6.3 Information Validation Layer

**Status**: ❌ Missing

**What's Needed**:
```typescript
interface InformationValidation {
  // Track what each NPC actually knows
  npcKnowledge: Map<string, {
    trueKnowledge: string[];    // What they actually know is true
    falseBeliefs: string[];     // What they believe that's false
    uncertainty: string[];      // What they're unsure about
  }>;
  
  // Validate posts against knowledge
  validatePost(npcId: string, post: FeedPost): {
    isConsistent: boolean;
    isAccurate: boolean;
    isStrategic: boolean;  // Lying for advantage
  };
  
  // Track NPC accuracy over time
  calculateAccuracy(npcId: string, resolvedQuestions: Question[]): number;
}
```

**Why Needed**:
- Ensure NPCs don't accidentally reveal info they shouldn't know
- Create genuine insider advantage
- Allow agents to learn NPC reliability

### 6.4 Clue Strength Validation

**Status**: ⚠️ Exists but not validated

**Current**: Posts have `clueStrength` field (0-1) but:
- No validation that high clue strength actually correlates with accuracy
- No enforcement of clue strength progression
- No verification that late-game clues are stronger

**What's Needed**:
```typescript
interface ClueStrengthValidator {
  // Validate that clue strength matches phase
  validateClueStrength(
    day: number,
    clueStrength: number,
    phase: 'early' | 'middle' | 'late'
  ): boolean;
  
  // Expected ranges by phase
  expectedRanges: {
    early: { min: 0.1, max: 0.4 },
    middle: { min: 0.3, max: 0.7 },
    late: { min: 0.6, max: 1.0 },
  };
  
  // Validate that high-strength clues are actually accurate
  validateAccuracy(
    clue: { strength: number; pointsToward: boolean },
    actualOutcome: boolean
  ): boolean;  // strength > 0.7 should be 80%+ accurate
}
```

---

## Part 7: Recommendations

### Priority 1: Fix Critical Bugs (Immediate)

1. **Fix `shouldRevealAnswer()` logic** - Early game revealing too much
2. **Remove outcome parameter from feed generation** - Stop leaking answers to LLM
3. **Add NPC reliability field** - Track who's truthful vs deceptive

### Priority 2: Add Learnability Infrastructure (High)

1. **Implement QuestionArcPlanner** - Pre-plan uncertainty → clarity progression
2. **Add NPCPersona system** - Consistent insiders/deceivers/experts
3. **Implement Information Validation** - Ensure NPCs only know what they should
4. **Add Truth Tracking** - Track which posts were accurate vs misleading

### Priority 3: Enhance Testing (High)

1. **Integration tests with real LLM calls** - Verify actual generation quality
2. **Learnability tests** - Verify early info → late info gradient exists
3. **Consistency tests** - Verify NPCs maintain personas across game
4. **Bias validation** - Verify bias actually affects content detectably

### Priority 4: Improve Information Architecture (Medium)

1. **Structured insider knowledge** - Explicit "who knows what"
2. **Misdirection planning** - Intentional red herrings
3. **Group chat information advantage** - Explicitly more accurate
4. **Resolution verification** - Guaranteed definitive proof event

---

## Part 8: Proposed Solution Architecture

### 8.1 Enhanced Question Generation

```typescript
interface EnhancedQuestion extends Question {
  // Existing fields...
  
  // New fields for arc management
  arcPlan: {
    uncertaintyPeak: number;      // Day 5-12 when most confusing
    clarityOnset: number;         // Day 15-22 when becomes clear
    verificationDay: number;      // Day 25-29 definitive proof
    
    // Planned event distribution
    totalEventsPlanned: number;
    correctSignalsPlanned: number;
    wrongSignalsPlanned: number;  // Misdirection
  };
  
  // NPC knowledge plan
  insiders: string[];     // NPC IDs who know the truth
  deceivers: string[];    // NPC IDs who will lie
  experts: string[];      // NPC IDs who will analyze well
}
```

### 8.2 Enhanced NPC Types

```typescript
interface EnhancedActor extends Actor {
  // Existing fields...
  
  // New fields for consistency
  persona: {
    reliability: number;           // 0-1, how often tells truth
    insiderOrgs: string[];        // Has insider knowledge of these orgs
    expertise: string[];          // Expert domains
    willingToLie: boolean;        // Will deceive for self-interest
    bias: {
      favors: string[];
      opposes: string[];
    };
  };
  
  // Track record (learned over games)
  historicalAccuracy?: number;
}
```

### 8.3 Enhanced Event Generation

```typescript
interface EventGenerationStrategy {
  // Pre-planned event sequences
  planQuestionArc(question: EnhancedQuestion): EventArc;
  
  // Generate event with constraints
  generateEventForArc(
    day: number,
    arc: EventArc,
    phase: 'early' | 'middle' | 'late'
  ): Promise<{
    description: string;
    pointsToward: 'YES' | 'NO' | null;
    clueStrength: number;  // Enforced by phase
    involvedNPCs: string[];
    visibility: 'public' | 'leaked' | 'insider';
  }>;
  
  // Validate event doesn't break arc
  validateEventFitsArc(event: WorldEvent, arc: EventArc): boolean;
}
```

### 8.4 Feed Generation Without Outcome Leakage

```typescript
// BEFORE (leaks answer):
async generateDayFeed(
  day: number,
  worldEvents: WorldEvent[],
  allActors: Actor[],
  outcome: boolean  // ❌ LEAKS ANSWER
): Promise<FeedPost[]>

// AFTER (no leakage):
async generateDayFeed(
  day: number,
  worldEvents: WorldEvent[],
  allActors: Actor[]
  // ✅ No outcome parameter - LLM doesn't know answer
  // Uses only event.pointsToward for hints
): Promise<FeedPost[]>
```

### 8.5 NPC Knowledge Management

```typescript
class NPCKnowledgeSystem {
  private knowledge: Map<string, Set<string>>;  // npcId → known facts
  
  // What does this NPC know on this day?
  getNPCKnowledge(npcId: string, day: number): string[] {
    const npc = this.getEnhancedNPC(npcId);
    const knowledge: string[] = [];
    
    // Insiders know org info
    if (npc.persona.insiderOrgs.length > 0) {
      knowledge.push(...this.getOrgInsiderInfo(npc.persona.insiderOrgs, day));
    }
    
    // Everyone knows public events
    knowledge.push(...this.getPublicEvents(day));
    
    // Group chat members know group discussions
    knowledge.push(...this.getGroupChatInfo(npcId, day));
    
    return knowledge;
  }
  
  // Validate NPC post doesn't reveal unknown info
  validatePostKnowledge(npcId: string, post: string, day: number): boolean {
    const npcKnowledge = this.getNPCKnowledge(npcId, day);
    // Check if post claims info NPC shouldn't have
    return this.postReferencesOnlyKnownInfo(post, npcKnowledge);
  }
  
  // Should this NPC lie in this situation?
  shouldLie(npcId: string, context: PostContext): boolean {
    const npc = this.getEnhancedNPC(npcId);
    
    if (!npc.persona.willingToLie) return false;
    
    // Lie if it benefits them
    return this.lyingBenefitsNPC(npc, context);
  }
}
```

---

## Part 9: Testing Strategy

### 9.1 Current Test Coverage

**Unit Tests**: ✅ Excellent
- MarketDecisionEngine: 14 tests
- QuestionManager: 6 tests
- GameSimulator: 21 tests
- PerpetualsEngine: 12 tests
- Total: 57 tests, 100% pass rate

**Integration Tests**: ❌ Missing
- No tests that verify actual LLM generation quality
- No tests that verify information gradient
- No tests that verify NPC consistency
- No tests that verify learnability

### 9.2 Required Integration Tests

```typescript
describe('Game Learnability Integration Tests', () => {
  test('questions have clear early→late information gradient', async () => {
    // Generate full game
    const game = await generator.generateCompleteGame();
    
    // For each question, calculate signal strength over time
    for (const question of game.setup.questions) {
      const signals = analyzeSignalProgression(game.timeline, question.id);
      
      // Early days should be uncertain (40-60% range)
      const earlySignals = signals.filter(s => s.day <= 10);
      const earlyCertainty = calculateCertainty(earlySignals);
      expect(earlyCertainty).toBeLessThan(0.6);
      
      // Late days should be clear (80%+ correct)
      const lateSignals = signals.filter(s => s.day >= 25);
      const lateCertainty = calculateCertainty(lateSignals);
      expect(lateCertainty).toBeGreaterThan(0.8);
    }
  });
  
  test('NPCs maintain consistent personas across game', async () => {
    const game = await generator.generateCompleteGame();
    
    // Identify NPCs who should be insiders
    const insiders = identifyInsiders(game.setup.actors);
    
    // Verify insider posts are consistently more accurate
    for (const insider of insiders) {
      const posts = getPostsByNPC(game.timeline, insider.id);
      const accuracy = calculatePostAccuracy(posts, game.resolution);
      
      expect(accuracy).toBeGreaterThan(0.7); // Insiders should be >70% accurate
    }
  });
  
  test('group chat information provides actual advantage', async () => {
    const game = await generator.generateCompleteGame();
    
    // Compare accuracy of group chat hints vs public posts
    const groupChatSignals = extractGroupChatSignals(game.timeline);
    const publicSignals = extractPublicSignals(game.timeline);
    
    const groupAccuracy = calculateAccuracy(groupChatSignals, game.resolution);
    const publicAccuracy = calculateAccuracy(publicSignals, game.resolution);
    
    // Group chats should be 15-25% more accurate
    expect(groupAccuracy - publicAccuracy).toBeGreaterThan(0.15);
  });
  
  test('bias is detectable and consistent', async () => {
    const game = await generator.generateCompleteGame();
    
    // Find biased NPCs (affiliated with orgs)
    const biasedNPCs = identifyBiasedNPCs(game.setup.actors);
    
    for (const npc of biasedNPCs) {
      // Get posts about their affiliated org
      const postsAboutOrg = getPostsAboutOrg(game.timeline, npc.id, npc.affiliations[0]);
      
      // Calculate sentiment bias
      const avgSentiment = calculateAvgSentiment(postsAboutOrg);
      
      // Should be detectably positive (>0.3) for affiliated orgs
      expect(avgSentiment).toBeGreaterThan(0.3);
    }
  });
  
  test('game has sufficient signal for learning', async () => {
    // Run 10 games
    const games = await Promise.all(
      Array.from({ length: 10 }, () => generator.generateCompleteGame())
    );
    
    // Simulate simple agent strategy: Trust high-strength clues
    let correctPredictions = 0;
    
    for (const game of games) {
      for (const question of game.setup.questions) {
        // Get high-strength clues (>0.7)
        const strongClues = getStrongClues(game.timeline, question.id, 0.7);
        
        // Vote based on majority
        const yesVotes = strongClues.filter(c => c.pointsToward === 'YES').length;
        const noVotes = strongClues.filter(c => c.pointsToward === 'NO').length;
        
        const prediction = yesVotes > noVotes;
        if (prediction === question.outcome) correctPredictions++;
      }
    }
    
    const accuracy = correctPredictions / (games.length * 3);
    
    // Simple strategy should achieve 65-75% accuracy (better than random 50%)
    expect(accuracy).toBeGreaterThan(0.65);
    expect(accuracy).toBeLessThan(0.85); // Not too easy
  });
});
```

---

## Part 10: Implementation Roadmap

### Phase 1: Fix Critical Bugs (2 hours)
1. Fix `shouldRevealAnswer()` probability logic
2. Remove outcome parameter from feed generation
3. Add validation tests for both fixes

### Phase 2: Add NPC Persona System (4 hours)
1. Add `persona` field to Actor type
2. Create `NPCPersonaGenerator` to assign roles
3. Update feed generation to respect personas
4. Add tests verifying persona consistency

### Phase 3: Add Question Arc Planning (6 hours)
1. Create `QuestionArcPlanner` class
2. Generate arc plans when questions created
3. Update event generation to follow arc plans
4. Add validation that events fit planned arcs

### Phase 4: Add Information Validation (4 hours)
1. Create `NPCKnowledgeSystem` class
2. Track what each NPC knows each day
3. Validate posts against knowledge
4. Add tests for knowledge consistency

### Phase 5: Integration Testing (4 hours)
1. Write learnability tests
2. Write consistency tests
3. Write bias validation tests
4. Write signal-to-noise ratio tests

### Phase 6: Validation & Tuning (2 hours)
1. Run all tests
2. Tune parameters based on results
3. Verify game quality metrics
4. Document final architecture

**Total Estimated Time**: 22 hours

---

## Part 11: Success Metrics

### Game Quality Metrics

| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Information gradient exists | ✅ Yes | Early clarity < 60%, Late clarity > 80% |
| NPC consistency | ✅ Yes | Insider accuracy > 70%, Deceiver < 40% |
| Learnability | ✅ Yes | Simple strategy: 65-75% accuracy over 10 games |
| Bias detectability | ✅ Yes | Affiliated NPC sentiment +0.3 toward org |
| Group chat advantage | ✅ Yes | 15-25% accuracy boost vs public only |
| Signal-to-noise ratio | ✅ Yes | High-strength clues 75%+ accurate |
| Resolution verification | ✅ Yes | Every question has definitive proof event |
| No outcome leakage | ✅ Yes | LLM never sees predetermined outcome |

### Test Coverage Metrics

| Test Type | Current | Target |
|-----------|---------|--------|
| Unit tests | 57 | 80+ |
| Integration tests (with LLM) | 0 | 15+ |
| Learnability tests | 0 | 5+ |
| Consistency tests | 0 | 5+ |
| Quality validation tests | 0 | 10+ |

---

## Part 12: Critical Findings Summary

### What's Working Well ✅

1. **Batched LLM calls** - 90% cost reduction, excellent optimization
2. **Rich context** - Mood, luck, relationships all included
3. **Event variety** - Good diversity in event types
4. **Resolution events** - Questions do get verification events
5. **Comprehensive documentation** - All code well-documented

### What's Broken ❌

1. **Outcome leakage** - LLM knows answers during generation
2. **Random hint distribution** - No structured arc, backwards logic bug
3. **No NPC consistency** - Can't learn who to trust
4. **No information validation** - NPCs can reveal info they shouldn't know
5. **No integration testing** - Haven't verified actual generation quality

### What's Missing ⚠️

1. **Question arc planning** - Pre-plan uncertainty → clarity progression
2. **NPC persona system** - Reliable vs unreliable sources
3. **Information advantage validation** - Verify group chats actually help
4. **Learnability tests** - Verify agents can improve
5. **Bias consistency** - NPCs maintain biases across multiple posts

---

## Part 13: Immediate Action Items

### Must Fix Before Game is Playable

1. **Remove outcome parameter from FeedGenerator.generateDayFeed()**
   - Currently: `generateDayFeed(day, events, actors, outcome)`
   - Should be: `generateDayFeed(day, events, actors)`
   - Use only `event.pointsToward` for hints

2. **Fix shouldRevealAnswer() logic**
   ```typescript
   // Current (WRONG):
   if (phase === 'Early') return Math.random() > 0.0;  // 100% reveal
   
   // Fixed (CORRECT):
   if (phase === 'Early') return Math.random() > 0.8;  // 20% reveal
   ```

3. **Add NPC reliability field to Actor type**
   ```typescript
   export interface Actor {
     // ... existing fields
     reliability?: number;  // 0-1, how often tells truth
     knowsOrgInsider?: string[];  // Org IDs they have insider info about
   }
   ```

4. **Add question arc planning**
   ```typescript
   class QuestionArcPlanner {
     planArc(question: Question): QuestionArc {
       // Determine uncertainty peak (day 5-12)
       // Determine clarity onset (day 15-22)
       // Determine verification day (day 25-29)
       // Plan event distribution (40/60 early → 85/15 late)
     }
   }
   ```

5. **Write integration tests**
   ```typescript
   describe('Game Quality Integration Tests', () => {
     test('information gradient exists', async () => { ... });
     test('NPCs are consistent', async () => { ... });
     test('game is learnable', async () => { ... });
   });
   ```

---

## Conclusion

The Babylon game engine has **excellent infrastructure** for content generation but **lacks the structured information architecture** needed for reinforcement learning.

**The Core Problem**: The engine generates a rich narrative, but that narrative is:
- Not strategically planned (random day-to-day)
- Leaking answers to the LLM (outcome parameter)
- Missing consistent NPC personas (can't learn patterns)
- Not validated for learnability (no tests verify agents can improve)

**The Solution**: Add a **thin strategic layer** on top of existing generation:
- QuestionArcPlanner (pre-plan uncertainty → clarity)
- NPCPersona system (consistent insiders/deceivers)
- Information validation (NPCs only know what they should)
- Integration tests (verify actual quality)

**Complexity Budget**: This is ~2,000 lines of new code (10% of current engine) but provides the **structure** needed for RL agents to learn effectively.

**Priority**: This is **critical** for the game's success. Without these changes, agents will learn LLM artifacts rather than game mechanics.

---

**Next Steps**: Review this report, approve the approach, then proceed with implementation.

