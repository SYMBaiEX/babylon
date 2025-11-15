# Implementation Plan: Making Babylon Learnable

**Goal**: Transform Babylon from content generator into skill-based, learnable prediction market game  
**Timeline**: 1 week (~40 hours)  
**Approach**: Incremental, test-driven, additive changes

---

## Phase 1: Critical Fixes (Day 1 - 8 hours)

### 1.1 Fix Inverted Gradient Bug (30 minutes)

**File**: `src/generator/GameGenerator.ts`

**Current (line 1355-1361)**:
```typescript
private shouldRevealAnswer(_day: number, phase: string): boolean {
  if (phase === 'Early') return Math.random() > 0.0;    // 100% reveal ← BUG
  if (phase === 'Middle') return Math.random() > 0.1;  // 90% reveal
  if (phase === 'Late') return Math.random() > 0.6;    // 40% reveal ← BACKWARDS
  if (phase === 'Climax') return Math.random() > 0.3;  // 70% reveal
  return true;
}
```

**Fixed**:
```typescript
private shouldRevealAnswer(_day: number, phase: string): boolean {
  if (phase === 'Early') return Math.random() > 0.85;   // 15% reveal
  if (phase === 'Middle') return Math.random() > 0.55;  // 45% reveal  
  if (phase === 'Late') return Math.random() > 0.25;    // 75% reveal
  if (phase === 'Climax') return Math.random() > 0.10;  // 90% reveal
  return true; // Resolution always reveals
}
```

**Test**:
```typescript
test('shouldRevealAnswer has correct gradient', () => {
  const generator = new GameGenerator();
  
  // Sample 1000 times each phase
  const earlyReveals = sampleReveals('Early', 1000);
  const lateReveals = sampleReveals('Late', 1000);
  
  expect(earlyReveals).toBeLessThan(0.25);     // <25% early
  expect(lateReveals).toBeGreaterThan(0.70);   // >70% late
  expect(lateReveals - earlyReveals).toBeGreaterThan(0.50); // Clear gradient
});
```

**Deliverables**:
- [ ] Fix logic in GameGenerator.ts
- [ ] Add unit test for gradient
- [ ] Verify test passes

---

### 1.2 Remove Outcome Leakage (2 hours)

**Files to Change**:
1. `src/engine/FeedGenerator.ts` - Remove outcome parameter
2. `src/generator/GameGenerator.ts` - Stop passing outcome
3. `src/engine/GameWorld.ts` - Stop passing outcome

**Changes**:

**FeedGenerator.ts**:
```typescript
// BEFORE:
async generateDayFeed(
  day: number,
  worldEvents: WorldEvent[],
  allActors: Actor[],
  outcome: boolean  // ❌ Remove this
): Promise<FeedPost[]>

// AFTER:
async generateDayFeed(
  day: number,
  worldEvents: WorldEvent[],
  allActors: Actor[]
  // ✅ No outcome parameter
): Promise<FeedPost[]>
```

**Update all internal methods** (10 methods):
- `generateReactionsBatch()` - Remove outcome param
- `generateCommentaryBatch()` - Remove outcome param
- `generateConspiracyPostsBatch()` - Remove outcome param
- `generateAmbientPostsBatch()` - Remove outcome param
- `generateJournalistPost()` - Remove outcome param
- `generateMediaPost()` - Remove outcome param
- `generateDirectReaction()` - Remove outcome param
- `generateCommentary()` - Remove outcome param
- `generateConspiracyPost()` - Remove outcome param
- `generateAmbientPost()` - Remove outcome param

**Update prompts to use event hints only**:
```typescript
// BEFORE:
const eventContext = worldEvent.pointsToward
  ? `This development suggests things are trending toward ${worldEvent.pointsToward}.`
  : `Based on this event, the situation is ${outcome ? 'progressing positively' : 'facing setbacks'}.`;

// AFTER:
const eventContext = worldEvent.pointsToward
  ? `This development suggests things are trending toward ${worldEvent.pointsToward}.`
  : `The implications of this event are unclear.`;  // ✅ No outcome knowledge
```

**Deliverables**:
- [ ] Update FeedGenerator interface
- [ ] Update all 10 generation methods
- [ ] Update GameGenerator calls
- [ ] Update GameWorld calls
- [ ] Run existing tests (should still pass)
- [ ] Verify no outcome references remain

---

### 1.3 Add NPC Persona Fields (30 minutes)

**File**: `src/shared/types.ts`

**Add to Actor interface**:
```typescript
export interface Actor {
  // ... existing fields
  
  // NPC Persona (for consistency and learnability)
  persona?: {
    // Information access
    reliability: number;           // 0-1, how often tells truth (0.3 = politician, 0.9 = journalist)
    insiderOrgs: string[];        // Org IDs they have insider knowledge about
    expertise: string[];          // Domain expertise (e.g., ['tech', 'finance'])
    
    // Behavioral traits
    willingToLie: boolean;        // Will strategically deceive for self-interest
    selfInterest: 'wealth' | 'reputation' | 'ideology' | 'chaos';  // Primary motivation
    
    // Bias
    favorsActors: string[];       // Actor IDs they favor (will defend)
    opposesActors: string[];      // Actor IDs they oppose (will criticize)
    favorsOrgs: string[];         // Org IDs they favor
    opposesOrgs: string[];        // Org IDs they oppose
  };
  
  // Track record (updated as game progresses)
  trackRecord?: {
    totalPosts: number;
    accuratePosts: number;        // Posts that matched eventual outcomes
    historicalAccuracy: number;   // accuratePosts / totalPosts
  };
}
```

**Deliverables**:
- [ ] Update Actor interface in types.ts
- [ ] Update SelectedActor type
- [ ] Verify TypeScript compiles

---

### 1.4 Create NPC Persona Generator (3 hours)

**File**: `src/lib/services/npc-persona-generator.ts` (new)

```typescript
/**
 * NPC Persona Generator
 * 
 * Assigns consistent behavioral personas to NPCs for learnability.
 * Ensures NPCs have reliable patterns that agents can learn.
 */

import type { Actor, Organization } from '@/shared/types';
import { logger } from '@/lib/logger';

export interface PersonaAssignment {
  actorId: string;
  reliability: number;
  insiderOrgs: string[];
  expertise: string[];
  willingToLie: boolean;
  selfInterest: 'wealth' | 'reputation' | 'ideology' | 'chaos';
  favorsActors: string[];
  opposesActors: string[];
  favorsOrgs: string[];
  opposesOrgs: string[];
}

export class NPCPersonaGenerator {
  /**
   * Assign personas to all actors
   * 
   * Strategy:
   * - Insiders (affiliated with orgs): High reliability (0.7-0.9), insider knowledge
   * - Experts (domain specialists): Medium-high reliability (0.6-0.8), no insider info
   * - Politicians/Public figures: Low reliability (0.2-0.4), willing to lie
   * - Journalists: Medium reliability (0.5-0.7), sometimes get bad sources
   * - Deceivers: Very low reliability (0.1-0.3), spread misinformation
   */
  assignPersonas(
    actors: Actor[],
    organizations: Organization[]
  ): Map<string, PersonaAssignment> {
    const personas = new Map<string, PersonaAssignment>();
    
    for (const actor of actors) {
      const persona = this.generatePersonaForActor(actor, actors, organizations);
      personas.set(actor.id, persona);
    }
    
    // Validate distribution
    this.validatePersonaDistribution(personas);
    
    return personas;
  }
  
  private generatePersonaForActor(
    actor: Actor,
    allActors: Actor[],
    organizations: Organization[]
  ): PersonaAssignment {
    // Determine base reliability from role/tier
    let baseReliability = 0.5;
    let willingToLie = false;
    let selfInterest: 'wealth' | 'reputation' | 'ideology' | 'chaos' = 'reputation';
    
    // Role-based reliability
    if (actor.personality?.includes('contrarian') || actor.personality?.includes('conspiracy')) {
      baseReliability = 0.15 + Math.random() * 0.15; // 0.15-0.30
      willingToLie = true;
      selfInterest = 'chaos';
    } else if (actor.domain?.includes('politics') || actor.description?.includes('politician')) {
      baseReliability = 0.25 + Math.random() * 0.15; // 0.25-0.40
      willingToLie = true;
      selfInterest = 'reputation';
    } else if (actor.domain?.includes('media') || actor.domain?.includes('journalism')) {
      baseReliability = 0.55 + Math.random() * 0.15; // 0.55-0.70
      willingToLie = false;
      selfInterest = 'reputation';
    } else if (actor.domain?.includes('finance') || actor.domain?.includes('tech')) {
      baseReliability = 0.60 + Math.random() * 0.20; // 0.60-0.80
      willingToLie = Math.random() > 0.7; // 30% willing to lie
      selfInterest = 'wealth';
    } else {
      baseReliability = 0.50 + Math.random() * 0.20; // 0.50-0.70
      willingToLie = Math.random() > 0.8; // 20% willing to lie
      selfInterest = Math.random() > 0.5 ? 'reputation' : 'wealth';
    }
    
    // Insiders get higher reliability about their orgs
    const insiderOrgs = actor.affiliations || [];
    if (insiderOrgs.length > 0) {
      baseReliability = Math.max(baseReliability, 0.70); // Insiders at least 0.7
    }
    
    // Expertise from domain
    const expertise = actor.domain || [];
    
    // Determine favors/opposes from affiliations
    const favorsOrgs = insiderOrgs;
    const opposesOrgs: string[] = []; // TODO: Could infer from competitor orgs
    
    return {
      actorId: actor.id,
      reliability: baseReliability,
      insiderOrgs,
      expertise,
      willingToLie,
      selfInterest,
      favorsActors: [], // Could infer from relationships
      opposesActors: [],
      favorsOrgs,
      opposesOrgs,
    };
  }
  
  /**
   * Validate persona distribution makes sense
   */
  private validatePersonaDistribution(personas: Map<string, PersonaAssignment>): void {
    const reliabilities = Array.from(personas.values()).map(p => p.reliability);
    
    const avgReliability = reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length;
    const insiders = Array.from(personas.values()).filter(p => p.insiderOrgs.length > 0);
    const liars = Array.from(personas.values()).filter(p => p.willingToLie);
    
    logger.info('Persona distribution', {
      total: personas.size,
      avgReliability: avgReliability.toFixed(2),
      insiders: insiders.length,
      liars: liars.length,
      highReliability: reliabilities.filter(r => r > 0.7).length,
      lowReliability: reliabilities.filter(r => r < 0.4).length,
    }, 'NPCPersonaGenerator');
    
    // Ensure good distribution
    if (avgReliability < 0.45 || avgReliability > 0.65) {
      logger.warn('Unusual reliability distribution - mostly unreliable or too reliable', {
        avgReliability
      }, 'NPCPersonaGenerator');
    }
  }
}
```

**Deliverables**:
- [ ] Create NPCPersonaGenerator class
- [ ] Add unit tests
- [ ] Integrate into GameGenerator
- [ ] Verify persona distribution

---

### 1.5 Update FeedGenerator to Respect Personas (2 hours)

**File**: `src/engine/FeedGenerator.ts`

**Add persona tracking**:
```typescript
export class FeedGenerator extends EventEmitter {
  private llm?: BabylonLLMClient;
  private actorStates: Map<string, ActorState> = new Map();
  private relationships: ActorRelationship[] | ActorConnection[] = [];
  private organizations: Organization[] = [];
  private actorGroupContexts: Map<string, string> = new Map();
  
  // ✅ NEW: Track NPC personas
  private npcPersonas: Map<string, PersonaAssignment> = new Map();
  
  /**
   * Set NPC personas for consistency
   */
  setNPCPersonas(personas: Map<string, PersonaAssignment>): void {
    this.npcPersonas = personas;
  }
}
```

**Update post generation to use personas**:
```typescript
private async generateReactionsBatch(
  actors: Actor[],
  worldEvent: WorldEvent
  // ❌ Removed: outcome: boolean
): Promise<Array<{ post: string; sentiment: number; clueStrength: number; pointsToward: boolean | null }>> {
  // ... existing code
  
  const actorsList = actorContexts.map((ctx, i) => {
    const persona = this.npcPersonas.get(ctx.actor.id);
    
    // Add persona context to prompt
    let personaContext = '';
    if (persona) {
      personaContext = `
   PERSONA & CONSTRAINTS:
   - Reliability: ${(persona.reliability * 100).toFixed(0)}% (you tell truth ${persona.reliability > 0.7 ? 'almost always' : persona.reliability > 0.5 ? 'usually' : 'sometimes'})`;
      
      if (persona.insiderOrgs.length > 0) {
        personaContext += `\n   - Insider at: ${persona.insiderOrgs.join(', ')} (you have inside information about these orgs)`;
      }
      
      if (persona.willingToLie) {
        personaContext += `\n   - Strategic: You will lie or mislead if it benefits your ${persona.selfInterest}`;
      }
      
      if (persona.favorsOrgs.length > 0) {
        personaContext += `\n   - Bias: You favor ${persona.favorsOrgs.join(', ')} (defend them in your posts)`;
      }
    }
    
    return `${i + 1}. You are ${ctx.actor.name}: ${ctx.actor.description}
   Affiliated: ${ctx.actor.affiliations?.join(', ') || 'independent'}
   ${ctx.emotionalContext}${formatActorVoiceContext(ctx.actor)}
   ${personaContext}
   ${this.actorGroupContexts.get(ctx.actor.id) || ''}

   React to event. ${persona?.willingToLie ? 'You may lie if it benefits you.' : 'Be honest in your assessment.'}
   Write as YOURSELF (first person). Max 280 chars. No hashtags/emojis.`;
  }).join('\n');
  
  // ... rest of method
}
```

**Deliverables**:
- [ ] Add npcPersonas field to FeedGenerator
- [ ] Update all generation methods to use personas
- [ ] Update prompts to include persona constraints
- [ ] Test with mock personas

---

### 1.6 Create Persona Integration Test (2 hours)

**File**: `src/engine/__tests__/FeedGenerator-persona.test.ts` (new)

```typescript
import { describe, test, expect } from 'bun:test';
import { FeedGenerator } from '../FeedGenerator';
import { BabylonLLMClient } from '@/generator/llm/openai-client';
import { NPCPersonaGenerator } from '@/lib/services/npc-persona-generator';

describe('FeedGenerator - Persona Integration', () => {
  test('high reliability NPCs generate accurate posts', async () => {
    const llm = new BabylonLLMClient();
    const feed = new FeedGenerator(llm);
    
    const actor = createTestActor('insider-alice', {
      affiliations: ['techcorp'],
      domain: ['tech'],
    });
    
    const personas = new Map([
      ['insider-alice', {
        actorId: 'insider-alice',
        reliability: 0.9,
        insiderOrgs: ['techcorp'],
        expertise: ['tech'],
        willingToLie: false,
        selfInterest: 'reputation' as const,
        favorsActors: [],
        opposesActors: [],
        favorsOrgs: ['techcorp'],
        opposesOrgs: [],
      }]
    ]);
    
    feed.setNPCPersonas(personas);
    
    const event: WorldEvent = {
      id: 'test-event',
      day: 10,
      type: 'development',
      description: 'TechCorp product delayed due to technical issues',
      actors: ['insider-alice'],
      visibility: 'public',
      pointsToward: 'NO', // Points to negative outcome
    };
    
    // Generate multiple posts
    const posts = [];
    for (let i = 0; i < 5; i++) {
      const post = await feed.generateDirectReaction(actor, event);
      posts.push(post);
    }
    
    // High reliability NPCs should be consistent
    const noVotes = posts.filter(p => p.pointsToward === 'NO' || p.pointsToward === false).length;
    
    // Should be mostly accurate (at least 4/5 = 80%)
    expect(noVotes).toBeGreaterThanOrEqual(4);
  });
  
  test('low reliability NPCs generate inconsistent posts', async () => {
    // Similar test but with reliability: 0.3
    // Should be inconsistent (2-3 out of 5 accurate)
  });
  
  test('insiders include insider knowledge in group chats', async () => {
    // Test that insider NPCs reveal more in group chats
  });
});
```

**Deliverables**:
- [ ] Write persona tests
- [ ] Run tests with real LLM (requires API key)
- [ ] Verify personas affect output

---

### 1.7 Update GameGenerator to Use Personas (1 hour)

**File**: `src/generator/GameGenerator.ts`

```typescript
async generateCompleteGame(startDate = '2025-11-01'): Promise<GeneratedGame> {
  // ... existing setup
  
  // ✅ NEW: Generate personas for all actors
  const personaGenerator = new NPCPersonaGenerator();
  const allActors = [...selectedActors.mains, ...selectedActors.supporting, ...selectedActors.extras];
  const personas = personaGenerator.assignPersonas(allActors, organizations);
  
  logger.info(`Assigned personas to ${personas.size} actors`, {
    avgReliability: calculateAvgReliability(personas),
    insiders: countInsiders(personas),
    liars: countLiars(personas),
  }, 'GameGenerator');
  
  // Set personas in FeedGenerator once
  this.feedGenerator.setNPCPersonas(personas);
  
  // ... rest of generation
}
```

**Deliverables**:
- [ ] Import NPCPersonaGenerator
- [ ] Generate personas in generateCompleteGame()
- [ ] Pass personas to FeedGenerator
- [ ] Verify generation still works

---

## Phase 2: Question Arc Planning (Day 2 - 8 hours)

### 2.1 Create Question Arc Planner (4 hours)

**File**: `src/lib/services/question-arc-planner.ts` (new)

```typescript
/**
 * Question Arc Planner
 * 
 * Plans narrative arcs for questions to create intentional uncertainty → clarity progression.
 * Ensures questions are learnable through structured information reveal.
 */

import type { Question } from '@/shared/types';
import { logger } from '@/lib/logger';

/**
 * Planned event distribution for a question
 */
export interface QuestionArcPlan {
  questionId: number;
  outcome: boolean;
  
  // Narrative arc structure
  uncertaintyPeakDay: number;      // Day 7-12: Maximum confusion
  clarityOnsetDay: number;         // Day 16-22: Answer starts becoming clear
  verificationDay: number;         // Day 27-29: Definitive proof
  
  // Event distribution targets
  phases: {
    early: {
      daysRange: [number, number];    // [1, 10]
      targetEventsTotal: number;       // ~6-8 events
      targetCorrectSignals: number;    // ~3 (40%)
      targetWrongSignals: number;      // ~4 (60%) ← Misdirection
      targetAmbiguous: number;         // ~1
      targetClueStrength: [number, number]; // [0.2, 0.5]
    };
    middle: {
      daysRange: [number, number];    // [11, 20]
      targetEventsTotal: number;       // ~10-12 events
      targetCorrectSignals: number;    // ~6 (55%)
      targetWrongSignals: number;      // ~5 (45%)
      targetAmbiguous: number;         // ~1
      targetClueStrength: [number, number]; // [0.4, 0.7]
    };
    late: {
      daysRange: [number, number];    // [21, 26]
      targetEventsTotal: number;       // ~8-10 events
      targetCorrectSignals: number;    // ~7 (80%)
      targetWrongSignals: number;      // ~2 (20%) ← Last doubts
      targetAmbiguous: number;         // ~1
      targetClueStrength: [number, number]; // [0.6, 0.9]
    };
    climax: {
      daysRange: [number, number];    // [27, 29]
      targetEventsTotal: number;       // ~3-4 events
      targetCorrectSignals: number;    // ~3 (90%)
      targetWrongSignals: number;      // 0
      targetAmbiguous: number;         // ~1
      targetClueStrength: [number, number]; // [0.8, 1.0]
    };
  };
  
  // NPC knowledge plan
  insiders: string[];    // NPCs who know truth from start
  deceivers: string[];   // NPCs who will spread misinformation
  
  // Misdirection events
  plannedRedHerrings: Array<{
    day: number;
    description: string;
    apparentDirection: 'YES' | 'NO';  // What it seems to suggest
  }>;
}

export class QuestionArcPlanner {
  /**
   * Create a strategic arc plan for a question
   */
  planQuestionArc(
    question: Question,
    actors: Actor[],
    organizations: Organization[]
  ): QuestionArcPlan {
    // Determine key days
    const uncertaintyPeakDay = 8 + Math.floor(Math.random() * 5); // Day 8-12
    const clarityOnsetDay = 17 + Math.floor(Math.random() * 5);   // Day 17-21
    const verificationDay = 27 + Math.floor(Math.random() * 2);   // Day 27-28
    
    // Assign insider roles
    const insiders = this.selectInsiders(question, actors);
    const deceivers = this.selectDeceivers(actors);
    
    // Plan red herrings (intentional misdirection)
    const redHerrings = this.planRedHerrings(question, uncertaintyPeakDay);
    
    // Calculate event distribution
    const plan: QuestionArcPlan = {
      questionId: question.id,
      outcome: question.outcome,
      uncertaintyPeakDay,
      clarityOnsetDay,
      verificationDay,
      phases: {
        early: {
          daysRange: [1, 10],
          targetEventsTotal: 7,
          targetCorrectSignals: 3,   // 43% correct
          targetWrongSignals: 4,     // 57% wrong ← Misdirection dominant
          targetAmbiguous: 0,
          targetClueStrength: [0.2, 0.5],
        },
        middle: {
          daysRange: [11, 20],
          targetEventsTotal: 11,
          targetCorrectSignals: 6,   // 55% correct
          targetWrongSignals: 4,     // 36% wrong
          targetAmbiguous: 1,        // 9% unclear
          targetClueStrength: [0.4, 0.7],
        },
        late: {
          daysRange: [21, 26],
          targetEventsTotal: 9,
          targetCorrectSignals: 7,   // 78% correct
          targetWrongSignals: 1,     // 11% wrong ← Last doubts
          targetAmbiguous: 1,        // 11% unclear
          targetClueStrength: [0.6, 0.9],
        },
        climax: {
          daysRange: [27, 29],
          targetEventsTotal: 3,
          targetCorrectSignals: 3,   // 100% correct
          targetWrongSignals: 0,     // No more misdirection
          targetAmbiguous: 0,
          targetClueStrength: [0.85, 1.0],
        },
      },
      insiders,
      deceivers,
      plannedRedHerrings: redHerrings,
    };
    
    logger.info('Generated question arc plan', {
      questionId: question.id,
      uncertaintyPeakDay,
      clarityOnsetDay,
      verificationDay,
      insiders: insiders.length,
      deceivers: deceivers.length,
      redHerrings: redHerrings.length,
    }, 'QuestionArcPlanner');
    
    return plan;
  }
  
  /**
   * Select insiders who know the truth
   */
  private selectInsiders(question: Question, actors: Actor[]): string[] {
    // Find actors affiliated with orgs related to this question
    const relatedOrgs = this.extractRelatedOrgs(question);
    
    const insiders = actors
      .filter(a => 
        a.affiliations?.some(org => relatedOrgs.includes(org)) &&
        a.tier === 'S_TIER' || a.tier === 'A_TIER'
      )
      .slice(0, 2 + Math.floor(Math.random() * 2)) // 2-3 insiders
      .map(a => a.id);
    
    return insiders;
  }
  
  /**
   * Select deceivers who will spread misinformation
   */
  private selectDeceivers(actors: Actor[]): string[] {
    return actors
      .filter(a => 
        a.personality?.includes('contrarian') ||
        a.personality?.includes('conspiracy') ||
        a.domain?.includes('politics')
      )
      .slice(0, 1 + Math.floor(Math.random() * 2)) // 1-2 deceivers
      .map(a => a.id);
  }
  
  /**
   * Plan red herring events (misdirection)
   */
  private planRedHerrings(question: Question, uncertaintyPeakDay: number): Array<{
    day: number;
    description: string;
    apparentDirection: 'YES' | 'NO';
  }> {
    // Create 2-3 red herrings around uncertainty peak
    const redHerrings = [];
    const oppositeOutcome = question.outcome ? 'NO' : 'YES';
    
    for (let i = 0; i < 2; i++) {
      redHerrings.push({
        day: uncertaintyPeakDay - 2 + i,
        description: `Red herring ${i + 1} for question ${question.id}`,
        apparentDirection: oppositeOutcome,
      });
    }
    
    return redHerrings;
  }
  
  /**
   * Validate that a day's events fit the arc plan
   */
  validateDayEvents(
    day: number,
    events: WorldEvent[],
    arcPlan: QuestionArcPlan
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Determine which phase this day is in
    const phase = this.getPhaseForDay(day, arcPlan);
    if (!phase) {
      return { valid: true, issues: [] }; // Day not in any phase
    }
    
    // Get events related to this question
    const relatedEvents = events.filter(e => e.relatedQuestion === arcPlan.questionId);
    
    // Count signals
    const correctSignals = relatedEvents.filter(e => 
      e.pointsToward === (arcPlan.outcome ? 'YES' : 'NO')
    ).length;
    const wrongSignals = relatedEvents.filter(e => 
      e.pointsToward === (arcPlan.outcome ? 'NO' : 'YES')
    ).length;
    
    // Validate proportions (allow ±20% variance)
    const totalSignals = correctSignals + wrongSignals;
    if (totalSignals > 0) {
      const correctRatio = correctSignals / totalSignals;
      const expectedCorrectRatio = phase.targetCorrectSignals / 
                                   (phase.targetCorrectSignals + phase.targetWrongSignals);
      
      if (Math.abs(correctRatio - expectedCorrectRatio) > 0.3) {
        issues.push(
          `Phase ${this.getPhaseForDay(day, arcPlan)} has wrong signal ratio: ` +
          `${(correctRatio * 100).toFixed(0)}% correct (expected ~${(expectedCorrectRatio * 100).toFixed(0)}%)`
        );
      }
    }
    
    // Validate clue strength
    relatedEvents.forEach(event => {
      // Event should have clueStrength in expected range for phase
      // This would require events to have clueStrength field (they don't currently)
      // TODO: Add event.clueStrength field
    });
    
    return {
      valid: issues.length === 0,
      issues,
    };
  }
  
  private getPhaseForDay(day: number, arcPlan: QuestionArcPlan): typeof arcPlan.phases[keyof typeof arcPlan.phases] | null {
    for (const [_phaseName, phase] of Object.entries(arcPlan.phases)) {
      const [start, end] = phase.daysRange;
      if (day >= start && day <= end) {
        return phase;
      }
    }
    return null;
  }
}
```

**Deliverables**:
- [ ] Create QuestionArcPlanner class
- [ ] Add unit tests
- [ ] Write integration test

---

### 1.8 Integrate Arc Planning into QuestionManager (1 hour)

**File**: `src/engine/QuestionManager.ts`

**Add arc planning to question creation**:
```typescript
import { QuestionArcPlanner } from '@/lib/services/question-arc-planner';

export class QuestionManager {
  private llm: BabylonLLMClient;
  private arcPlanner: QuestionArcPlanner;  // ✅ NEW
  
  constructor(llm: BabylonLLMClient) {
    this.llm = llm;
    this.arcPlanner = new QuestionArcPlanner();  // ✅ NEW
  }
  
  async generateDailyQuestions(params: QuestionCreationParams): Promise<Question[]> {
    // ... existing question generation
    
    // ✅ NEW: Generate arc plans for new questions
    const questionsWithArcs = questions.map(q => {
      const arcPlan = this.arcPlanner.planQuestionArc(q, params.actors, params.organizations);
      
      return {
        ...q,
        // Store arc plan in question metadata
        metadata: {
          arcPlan,
        },
      };
    });
    
    return questionsWithArcs;
  }
}
```

**Deliverables**:
- [ ] Add arcPlanner to QuestionManager
- [ ] Generate arcs for new questions
- [ ] Store arc plans in question metadata
- [ ] Update Question type to include metadata

---

## Phase 3: Event Generation with Arc Constraints (Day 3 - 8 hours)

### 3.1 Add Arc-Aware Event Generation (4 hours)

**File**: `src/generator/GameGenerator.ts`

**Update event generation to follow arc plans**:
```typescript
private async generateDayEventsBatch(
  day: number,
  eventRequests: Array<{...}>,
  questions: Question[],  // Now includes metadata.arcPlan
  fullContext: string,
  luckMood: Map<string, { luck: string; mood: number }>,
  connections: ActorConnection[]
): Promise<Array<{ eventNumber: number; event: string; pointsToward: 'YES' | 'NO' | null }>> {
  
  // ✅ NEW: Get arc constraints for this day
  const arcConstraints = this.getArcConstraintsForDay(day, questions);
  
  // Build prompt with arc constraints
  const arcGuidance = this.buildArcGuidancePrompt(day, arcConstraints);
  
  const eventRequestsList = eventRequests.map((req, i) => {
    const question = questions.find(q => q.id === req.questionId);
    const arcPlan = question?.metadata?.arcPlan;
    
    // Get phase for this day
    const phase = this.getPhaseForDay(day, arcPlan);
    
    // Add arc guidance to event request
    let arcInstruction = '';
    if (arcPlan && phase) {
      const shouldPointCorrect = Math.random() < (phase.targetCorrectSignals / phase.targetEventsTotal);
      const targetDirection = shouldPointCorrect 
        ? (arcPlan.outcome ? 'YES' : 'NO')
        : (arcPlan.outcome ? 'NO' : 'YES');  // Misdirection
      
      const [minStrength, maxStrength] = phase.targetClueStrength;
      const clueStrength = minStrength + Math.random() * (maxStrength - minStrength);
      
      arcInstruction = `
   ARC GUIDANCE:
   - This event should point toward: ${targetDirection}
   - Clue strength: ${(clueStrength * 100).toFixed(0)}% (${clueStrength < 0.4 ? 'vague' : clueStrength < 0.7 ? 'moderate' : 'strong'})
   - Phase: ${this.getPhaseName(day)} - ${phase === arcPlan.phases.early ? 'plant uncertainty' : phase === arcPlan.phases.middle ? 'build tension' : phase === arcPlan.phases.late ? 'truth emerging' : 'definitive proof'}`;
    }
    
    // ... rest of event request formatting with arcInstruction
  });
  
  // ... rest of method
}
```

**Deliverables**:
- [ ] Add arc constraint extraction
- [ ] Update prompts with arc guidance
- [ ] Validate events follow arc
- [ ] Test with real generation

---

### 3.2 Add Event Validation (2 hours)

**File**: `src/lib/services/event-arc-validator.ts` (new)

```typescript
/**
 * Event Arc Validator
 * 
 * Validates that generated events follow the planned question arcs.
 * Ensures information gradient is maintained.
 */

export class EventArcValidator {
  /**
   * Validate a day's events against all question arcs
   */
  validateDayEvents(
    day: number,
    events: WorldEvent[],
    arcPlans: Map<number, QuestionArcPlan>
  ): ValidationResult {
    const issues: string[] = [];
    
    for (const [questionId, arcPlan] of arcPlans) {
      const questionEvents = events.filter(e => e.relatedQuestion === questionId);
      
      if (questionEvents.length === 0) continue; // No events for this question today
      
      // Validate signal distribution
      const correctSignals = questionEvents.filter(e => 
        e.pointsToward === (arcPlan.outcome ? 'YES' : 'NO')
      ).length;
      
      const wrongSignals = questionEvents.filter(e => 
        e.pointsToward === (arcPlan.outcome ? 'NO' : 'YES')
      ).length;
      
      const phase = this.getPhaseForDay(day, arcPlan);
      if (phase) {
        const expectedCorrectRatio = phase.targetCorrectSignals / phase.targetEventsTotal;
        const actualCorrectRatio = correctSignals / (correctSignals + wrongSignals);
        
        // Allow ±30% variance (some randomness is good)
        if (Math.abs(actualCorrectRatio - expectedCorrectRatio) > 0.3) {
          issues.push(
            `Question ${questionId} Day ${day}: Signal ratio off. ` +
            `Expected ${(expectedCorrectRatio * 100).toFixed(0)}% correct, ` +
            `got ${(actualCorrectRatio * 100).toFixed(0)}%`
          );
        }
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings: [],
    };
  }
  
  /**
   * Calculate information certainty for a question on a given day
   */
  calculateCertainty(
    questionId: number,
    day: number,
    allEvents: WorldEvent[]
  ): number {
    const relevantEvents = allEvents.filter(e => 
      e.relatedQuestion === questionId && e.day <= day
    );
    
    if (relevantEvents.length === 0) return 0.5; // No info = 50% certainty
    
    // Weight recent events more
    const weightedSignals = relevantEvents.map(e => {
      const recency = day - e.day;
      const recencyWeight = 1.0 / (1 + recency * 0.1); // Decay over time
      
      let signal = 0;
      if (e.pointsToward === 'YES') signal = 1;
      if (e.pointsToward === 'NO') signal = -1;
      
      return signal * recencyWeight;
    });
    
    const avgSignal = weightedSignals.reduce((a, b) => a + b, 0) / weightedSignals.length;
    
    // Convert from [-1, 1] to [0, 1]
    const certainty = (avgSignal + 1) / 2;
    
    return certainty;
  }
}
```

**Deliverables**:
- [ ] Create EventArcValidator
- [ ] Add certainty calculation
- [ ] Write validation tests
- [ ] Integrate into GameGenerator

---

### 3.3 Write Arc Planning Tests (2 hours)

**File**: `src/lib/services/__tests__/question-arc-planner.test.ts` (new)

```typescript
import { describe, test, expect } from 'bun:test';
import { QuestionArcPlanner } from '../question-arc-planner';
import { EventArcValidator } from '../event-arc-validator';

describe('QuestionArcPlanner', () => {
  test('creates valid arc plans', () => {
    const planner = new QuestionArcPlanner();
    const question = createTestQuestion({ id: 1, outcome: true });
    
    const arcPlan = planner.planQuestionArc(question, actors, orgs);
    
    expect(arcPlan.uncertaintyPeakDay).toBeGreaterThanOrEqual(8);
    expect(arcPlan.uncertaintyPeakDay).toBeLessThanOrEqual(12);
    
    expect(arcPlan.clarityOnsetDay).toBeGreaterThan(arcPlan.uncertaintyPeakDay);
    expect(arcPlan.verificationDay).toBeGreaterThan(arcPlan.clarityOnsetDay);
    
    // Validate event distribution increases over time
    expect(arcPlan.phases.early.targetCorrectSignals).toBeLessThan(
      arcPlan.phases.late.targetCorrectSignals
    );
  });
  
  test('information gradient progresses from unclear to clear', () => {
    const planner = new QuestionArcPlanner();
    const question = createTestQuestion({ id: 1, outcome: true });
    const arcPlan = planner.planQuestionArc(question, actors, orgs);
    
    // Calculate expected certainty at each phase
    const earlyCertainty = arcPlan.phases.early.targetCorrectSignals / 
                          arcPlan.phases.early.targetEventsTotal;
    const lateCertainty = arcPlan.phases.late.targetCorrectSignals / 
                         arcPlan.phases.late.targetEventsTotal;
    
    expect(earlyCertainty).toBeLessThan(0.5);      // Early: <50% (uncertain)
    expect(lateCertainty).toBeGreaterThan(0.75);   // Late: >75% (clear)
  });
});

describe('EventArcValidator', () => {
  test('validates event distribution matches arc plan', () => {
    const validator = new EventArcValidator();
    const arcPlan = createTestArcPlan();
    
    // Create events that match plan
    const goodEvents = [
      { day: 5, pointsToward: 'NO' },   // Misdirection (outcome is YES)
      { day: 5, pointsToward: 'NO' },
      { day: 5, pointsToward: 'YES' },  // Correct
    ];
    
    const result = validator.validateDayEvents(5, goodEvents, new Map([[1, arcPlan]]));
    expect(result.valid).toBe(true);
  });
  
  test('detects events that break arc plan', () => {
    const validator = new EventArcValidator();
    const arcPlan = createTestArcPlan();
    
    // Early phase but all events point to correct answer (too easy)
    const badEvents = [
      { day: 5, relatedQuestion: 1, pointsToward: 'YES' },
      { day: 5, relatedQuestion: 1, pointsToward: 'YES' },
      { day: 5, relatedQuestion: 1, pointsToward: 'YES' },
    ];
    
    const result = validator.validateDayEvents(5, badEvents, new Map([[1, arcPlan]]));
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
```

**Deliverables**:
- [ ] Write arc planner tests
- [ ] Write arc validator tests
- [ ] Verify tests pass

---

## Phase 4: Information Validation (Day 4 - 8 hours)

### 4.1 Create NPC Knowledge System (4 hours)

**File**: `src/lib/services/npc-knowledge-system.ts` (new)

```typescript
/**
 * NPC Knowledge System
 * 
 * Tracks what each NPC knows on each day.
 * Validates that NPCs don't reveal information they shouldn't have.
 */

import type { Actor, WorldEvent, ChatMessage } from '@/shared/types';
import { logger } from '@/lib/logger';

export interface NPCKnowledgeState {
  npcId: string;
  day: number;
  
  // What this NPC knows
  publicKnowledge: string[];        // Anyone can know this
  insiderKnowledge: string[];       // Only insiders know this
  groupChatKnowledge: string[];     // From private group chats
  
  // What this NPC believes (may be false)
  beliefs: Array<{
    fact: string;
    confidence: number;  // 0-1
    isTrue: boolean;     // Validation
  }>;
}

export class NPCKnowledgeSystem {
  private knowledge: Map<string, NPCKnowledgeState> = new Map();
  
  /**
   * Update NPC knowledge after a day's events
   */
  updateKnowledgeForDay(
    day: number,
    events: WorldEvent[],
    groupChats: Record<string, ChatMessage[]>,
    feedPosts: FeedPost[],
    actors: Actor[]
  ): void {
    for (const actor of actors) {
      const state = this.getOrCreateState(actor.id, day);
      
      // 1. Public knowledge (everyone knows public events)
      const publicEvents = events.filter(e => e.visibility === 'public');
      state.publicKnowledge.push(...publicEvents.map(e => e.description));
      
      // 2. Insider knowledge (only if affiliated with involved orgs)
      const persona = actor.persona;
      if (persona?.insiderOrgs && persona.insiderOrgs.length > 0) {
        const insiderEvents = events.filter(e => 
          e.visibility === 'private' &&
          e.actors.some(actorId => {
            const involvedActor = actors.find(a => a.id === actorId);
            return involvedActor?.affiliations?.some(org => 
              persona.insiderOrgs.includes(org)
            );
          })
        );
        state.insiderKnowledge.push(...insiderEvents.map(e => e.description));
      }
      
      // 3. Group chat knowledge (from groups actor is in)
      for (const [groupId, messages] of Object.entries(groupChats)) {
        // Check if actor is in this group
        const isInGroup = messages.some(m => m.from === actor.id);
        if (isInGroup || this.actorIsGroupMember(actor.id, groupId)) {
          state.groupChatKnowledge.push(...messages.map(m => m.message));
        }
      }
      
      this.knowledge.set(`${actor.id}-${day}`, state);
    }
  }
  
  /**
   * Validate that a post doesn't reveal unknown information
   */
  validatePostKnowledge(
    npcId: string,
    day: number,
    post: string,
    claimedKnowledge: string[]
  ): { valid: boolean; violations: string[] } {
    const state = this.knowledge.get(`${npcId}-${day}`);
    if (!state) {
      return { valid: true, violations: [] }; // Can't validate without state
    }
    
    const violations: string[] = [];
    const allKnownInfo = [
      ...state.publicKnowledge,
      ...state.insiderKnowledge,
      ...state.groupChatKnowledge,
    ];
    
    // Check if post claims info NPC shouldn't have
    for (const claim of claimedKnowledge) {
      const canKnow = allKnownInfo.some(known => 
        this.informationMatches(claim, known)
      );
      
      if (!canKnow) {
        violations.push(`NPC ${npcId} claims to know: "${claim}" but has no source for this info`);
      }
    }
    
    return {
      valid: violations.length === 0,
      violations,
    };
  }
  
  /**
   * Get all knowledge available to NPC on a given day
   */
  getNPCKnowledge(npcId: string, day: number): string[] {
    const state = this.knowledge.get(`${npcId}-${day}`);
    if (!state) return [];
    
    return [
      ...state.publicKnowledge,
      ...state.insiderKnowledge,
      ...state.groupChatKnowledge,
    ];
  }
  
  private getOrCreateState(npcId: string, day: number): NPCKnowledgeState {
    const key = `${npcId}-${day}`;
    const existing = this.knowledge.get(key);
    if (existing) return existing;
    
    const newState: NPCKnowledgeState = {
      npcId,
      day,
      publicKnowledge: [],
      insiderKnowledge: [],
      groupChatKnowledge: [],
      beliefs: [],
    };
    
    this.knowledge.set(key, newState);
    return newState;
  }
  
  private informationMatches(claim: string, knownInfo: string): boolean {
    // Simple string matching for now
    // Could be enhanced with semantic similarity
    return knownInfo.toLowerCase().includes(claim.toLowerCase()) ||
           claim.toLowerCase().includes(knownInfo.toLowerCase());
  }
  
  private actorIsGroupMember(actorId: string, groupId: string): boolean {
    // TODO: Track group membership
    return false;
  }
}
```

**Deliverables**:
- [ ] Create NPCKnowledgeSystem class
- [ ] Add knowledge tracking to GameGenerator
- [ ] Write unit tests
- [ ] Write validation test

---

### 4.2 Integrate Knowledge Validation (2 hours)

**File**: `src/generator/GameGenerator.ts`

```typescript
import { NPCKnowledgeSystem } from '@/lib/services/npc-knowledge-system';

export class GameGenerator {
  private knowledgeSystem: NPCKnowledgeSystem;  // ✅ NEW
  
  constructor(apiKey?: string, previousHistory?: GameHistory[]) {
    this.llm = new BabylonLLMClient(apiKey);
    this.feedGenerator = new FeedGenerator(this.llm);
    this.gameHistory = previousHistory || [];
    this.knowledgeSystem = new NPCKnowledgeSystem();  // ✅ NEW
  }
  
  private async generateDay(...): Promise<DayTimeline> {
    // ... generate events and feed posts
    
    // ✅ NEW: Update knowledge system
    this.knowledgeSystem.updateKnowledgeForDay(
      day,
      events,
      groupMessages,
      feedPosts,
      allActors
    );
    
    // ✅ NEW: Optionally validate posts (development mode)
    if (process.env.VALIDATE_NPC_KNOWLEDGE === 'true') {
      this.validateDayPosts(day, feedPosts, allActors);
    }
    
    // ... rest of method
  }
  
  private validateDayPosts(day: number, posts: FeedPost[], actors: Actor[]): void {
    for (const post of posts) {
      const actor = actors.find(a => a.id === post.author);
      if (!actor) continue;
      
      // Extract claims from post (simplified - could use LLM for better extraction)
      const claims = this.extractClaims(post.content);
      
      const validation = this.knowledgeSystem.validatePostKnowledge(
        actor.id,
        day,
        post.content,
        claims
      );
      
      if (!validation.valid) {
        logger.warn(`Knowledge validation failed for ${actor.name}`, {
          day,
          post: post.content.substring(0, 100),
          violations: validation.violations,
        }, 'GameGenerator');
      }
    }
  }
}
```

**Deliverables**:
- [ ] Add knowledge system to GameGenerator
- [ ] Update knowledge after each day
- [ ] Add optional validation mode
- [ ] Test validation works

---

## Phase 5: Integration Testing (Day 5 - 8 hours)

### 5.1 Write Learnability Integration Tests (4 hours)

**File**: `src/engine/__tests__/integration/game-learnability.test.ts` (new)

```typescript
/**
 * Integration Tests: Game Learnability
 * 
 * These tests use REAL LLM calls to verify that:
 * 1. Information gradient exists (early unclear → late clear)
 * 2. NPCs are consistent (can learn who to trust)
 * 3. Game is learnable (simple strategies beat random)
 * 4. Insider advantage is real (group chats provide value)
 * 
 * IMPORTANT: These are slow tests (~30-60s each) and use API credits.
 * Only run when verifying game quality, not in CI/CD.
 */

import { describe, test, expect } from 'bun:test';
import { GameGenerator } from '@/generator/GameGenerator';
import type { GeneratedGame, WorldEvent } from '@/shared/types';

// Helper to calculate information certainty from events
function calculateCertainty(
  events: WorldEvent[],
  questionId: number,
  actualOutcome: boolean
): number {
  const relevantEvents = events.filter(e => 
    e.relatedQuestion === questionId &&
    e.pointsToward !== null
  );
  
  if (relevantEvents.length === 0) return 0.5; // No info = 50/50
  
  const correctSignals = relevantEvents.filter(e => 
    (e.pointsToward === 'YES') === actualOutcome
  ).length;
  
  return correctSignals / relevantEvents.length;
}

describe('Game Learnability Integration Tests', () => {
  test.skip('information gradient: early unclear, late clear', async () => {
    // Generate a full game with real LLM
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    // For each question, verify information gradient
    for (const question of game.setup.questions) {
      const allEvents = game.timeline.flatMap(day => day.events);
      
      // Calculate certainty for each phase
      const earlyEvents = allEvents.filter(e => e.day <= 10);
      const middleEvents = allEvents.filter(e => e.day >= 11 && e.day <= 20);
      const lateEvents = allEvents.filter(e => e.day >= 21);
      
      const earlyCertainty = calculateCertainty(earlyEvents, question.id, question.outcome);
      const middleCertainty = calculateCertainty([...earlyEvents, ...middleEvents], question.id, question.outcome);
      const lateCertainty = calculateCertainty([...earlyEvents, ...middleEvents, ...lateEvents], question.id, question.outcome);
      
      // Verify gradient exists
      expect(lateCertainty).toBeGreaterThan(earlyCertainty + 0.2); // At least 20% improvement
      expect(middleCertainty).toBeGreaterThan(earlyCertainty); // Monotonic increase
      expect(lateCertainty).toBeGreaterThan(middleCertainty);
      
      // Verify ranges
      expect(earlyCertainty).toBeLessThan(0.6);      // Early: ambiguous (<60%)
      expect(lateCertainty).toBeGreaterThan(0.75);   // Late: clear (>75%)
      
      console.log(`Question ${question.id}: ${earlyCertainty.toFixed(2)} → ${middleCertainty.toFixed(2)} → ${lateCertainty.toFixed(2)}`);
    }
  }, {
    timeout: 120000, // 2 minutes
  });
  
  test.skip('NPCs with high reliability are consistently accurate', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    // Find NPCs marked as high reliability (>0.7)
    const highReliabilityNPCs = game.setup.mainActors
      .concat(game.setup.supportingActors)
      .filter(a => a.persona && a.persona.reliability > 0.7);
    
    expect(highReliabilityNPCs.length).toBeGreaterThan(0); // Should have some
    
    // For each high reliability NPC, check their post accuracy
    for (const npc of highReliabilityNPCs) {
      const posts = game.timeline
        .flatMap(day => day.feedPosts)
        .filter(post => post.author === npc.id && post.pointsToward !== null);
      
      // Get resolved questions to check accuracy
      const accuratePosts = posts.filter(post => {
        const question = game.setup.questions.find(q => q.id === post.relatedQuestion);
        if (!question) return false;
        
        // Is this post's hint accurate?
        return (post.pointsToward === 'YES') === question.outcome ||
               (post.pointsToward === 'NO') === !question.outcome;
      });
      
      const accuracy = accuratePosts.length / posts.length;
      
      // High reliability NPCs should be >70% accurate
      expect(accuracy).toBeGreaterThan(0.65);
      
      console.log(`${npc.name} (reliability ${npc.persona?.reliability}): ${(accuracy * 100).toFixed(0)}% accurate`);
    }
  }, {
    timeout: 120000,
  });
  
  test.skip('group chat information provides measurable advantage', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    // Simulate two agents:
    // Agent A: Only reads public feed
    // Agent B: Reads public feed + group chats
    
    for (const question of game.setup.questions) {
      // Agent A: Public only
      const publicPosts = game.timeline
        .flatMap(day => day.feedPosts)
        .filter(post => post.relatedQuestion === question.id && post.pointsToward !== null);
      
      const publicCertainty = calculateCertaintyFromPosts(publicPosts, question.outcome);
      
      // Agent B: Public + group chats
      const groupChatHints = game.timeline
        .flatMap(day => Object.values(day.groupChats).flat())
        .filter(msg => {
          // Check if message hints at question outcome
          // Simplified: check for keywords
          return msg.message.toLowerCase().includes(question.text.toLowerCase().split(' ')[2] || '');
        });
      
      // Award bonus certainty for group chat info (simplified scoring)
      const groupChatBonus = groupChatHints.length * 0.05; // 5% per relevant hint
      const totalCertainty = Math.min(1.0, publicCertainty + groupChatBonus);
      
      // Group chat should provide 10-20% advantage
      expect(totalCertainty).toBeGreaterThan(publicCertainty + 0.08);
      
      console.log(`Question ${question.id}: Public ${(publicCertainty * 100).toFixed(0)}%, With Groups ${(totalCertainty * 100).toFixed(0)}%`);
    }
  }, {
    timeout: 120000,
  });
  
  test.skip('simple betting strategy beats random guessing', async () => {
    // Run 3 mini-games (15 questions total)
    const games: GeneratedGame[] = [];
    const generator = new GameGenerator();
    
    for (let i = 0; i < 3; i++) {
      games.push(await generator.generateCompleteGame());
    }
    
    // Simulate simple strategy: Trust high clueStrength posts (>0.7)
    let totalPredictions = 0;
    let correctPredictions = 0;
    
    for (const game of games) {
      for (const question of game.setup.questions) {
        totalPredictions++;
        
        // Get high-strength clues
        const strongClues = game.timeline
          .flatMap(day => day.feedPosts)
          .filter(post => 
            post.relatedQuestion === question.id &&
            post.clueStrength > 0.7 &&
            post.pointsToward !== null
          );
        
        if (strongClues.length === 0) continue; // Skip if no strong clues
        
        // Vote based on majority
        const yesVotes = strongClues.filter(p => p.pointsToward === 'YES' || p.pointsToward === true).length;
        const noVotes = strongClues.filter(p => p.pointsToward === 'NO' || p.pointsToward === false).length;
        
        const prediction = yesVotes > noVotes;
        
        if (prediction === question.outcome) {
          correctPredictions++;
        }
      }
    }
    
    const accuracy = correctPredictions / totalPredictions;
    
    console.log(`Simple strategy: ${correctPredictions}/${totalPredictions} = ${(accuracy * 100).toFixed(0)}%`);
    
    // Should beat random guessing (50%) by at least 15%
    expect(accuracy).toBeGreaterThan(0.65);
    
    // But shouldn't be too easy
    expect(accuracy).toBeLessThan(0.85);
  }, {
    timeout: 360000, // 6 minutes (3 full games)
  });
});

function calculateCertaintyFromPosts(posts: FeedPost[], actualOutcome: boolean): number {
  if (posts.length === 0) return 0.5;
  
  const correctPosts = posts.filter(p => 
    (p.pointsToward === 'YES' || p.pointsToward === true) === actualOutcome ||
    (p.pointsToward === 'NO' || p.pointsToward === false) === !actualOutcome
  );
  
  return correctPosts.length / posts.length;
}
```

**Important**: These tests are marked `.skip` by default because they:
- Use real API calls (cost money)
- Take 30-120 seconds each
- Should be run manually for quality validation

**To run**: `bun test --grep "Game Learnability"`

**Deliverables**:
- [ ] Write learnability tests
- [ ] Write NPC consistency tests
- [ ] Write insider advantage tests
- [ ] Write strategy success tests
- [ ] Document how to run integration tests

---

### 5.2 Write Quality Validation Tests (2 hours)

**File**: `src/engine/__tests__/integration/game-quality.test.ts` (new)

```typescript
/**
 * Integration Tests: Game Quality
 * 
 * Validates generated content quality:
 * 1. No undefined/missing fields
 * 2. All required data present
 * 3. Timestamps are valid
 * 4. IDs are unique
 * 5. References are valid
 */

import { describe, test, expect } from 'bun:test';
import { GameGenerator } from '@/generator/GameGenerator';

describe('Game Quality Integration Tests', () => {
  test.skip('generated game has no undefined fields', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    // Check all actors have required fields
    const allActors = [
      ...game.setup.mainActors,
      ...game.setup.supportingActors,
      ...game.setup.extras,
    ];
    
    for (const actor of allActors) {
      expect(actor.id).toBeDefined();
      expect(actor.name).toBeDefined();
      expect(actor.description).toBeDefined();
      expect(actor.tier).toBeDefined();
      expect(actor.role).toBeDefined();
    }
    
    // Check all events have required fields
    for (const day of game.timeline) {
      for (const event of day.events) {
        expect(event.id).toBeDefined();
        expect(event.day).toBeDefined();
        expect(event.type).toBeDefined();
        expect(event.description).toBeDefined();
        expect(event.description.length).toBeGreaterThan(0);
        expect(event.description.length).toBeLessThan(200); // Max length
        expect(event.actors).toBeDefined();
        expect(Array.isArray(event.actors)).toBe(true);
        expect(event.visibility).toBeDefined();
      }
      
      // Check all feed posts have required fields
      for (const post of day.feedPosts) {
        expect(post.id).toBeDefined();
        expect(post.content).toBeDefined();
        expect(post.content.length).toBeGreaterThan(0);
        expect(post.author).toBeDefined();
        expect(post.authorName).toBeDefined();
        expect(post.timestamp).toBeDefined();
        expect(post.day).toBeDefined();
        
        // Validate timestamp format
        expect(() => new Date(post.timestamp)).not.toThrow();
        
        // Sentiment should be in valid range
        if (post.sentiment !== undefined) {
          expect(post.sentiment).toBeGreaterThanOrEqual(-1);
          expect(post.sentiment).toBeLessThanOrEqual(1);
        }
        
        // ClueStrength should be in valid range
        if (post.clueStrength !== undefined) {
          expect(post.clueStrength).toBeGreaterThanOrEqual(0);
          expect(post.clueStrength).toBeLessThanOrEqual(1);
        }
      }
    }
  }, {
    timeout: 120000,
  });
  
  test.skip('all actor IDs are unique', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    const allActors = [
      ...game.setup.mainActors,
      ...game.setup.supportingActors,
      ...game.setup.extras,
    ];
    
    const ids = allActors.map(a => a.id);
    const uniqueIds = new Set(ids);
    
    expect(uniqueIds.size).toBe(ids.length);
  }, {
    timeout: 120000,
  });
  
  test.skip('all event IDs are unique', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    const allEvents = game.timeline.flatMap(day => day.events);
    const ids = allEvents.map(e => e.id);
    const uniqueIds = new Set(ids);
    
    expect(uniqueIds.size).toBe(ids.length);
  }, {
    timeout: 120000,
  });
  
  test.skip('all actor references are valid', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    const allActors = [
      ...game.setup.mainActors,
      ...game.setup.supportingActors,
      ...game.setup.extras,
    ];
    const validActorIds = new Set(allActors.map(a => a.id));
    
    // Check events reference valid actors
    for (const day of game.timeline) {
      for (const event of day.events) {
        for (const actorId of event.actors) {
          expect(validActorIds.has(actorId)).toBe(true);
        }
      }
      
      // Check posts reference valid authors
      for (const post of day.feedPosts) {
        // Allow system authors (game-narrator, market-oracle, etc.)
        if (post.author.startsWith('game-') || post.author.startsWith('market-')) {
          continue;
        }
        
        // Must be valid actor or organization
        expect(
          validActorIds.has(post.author) ||
          game.setup.organizations.some(o => o.id === post.author)
        ).toBe(true);
      }
    }
  }, {
    timeout: 120000,
  });
  
  test.skip('questions have resolution verification events', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    // Each question should have at least one high-strength event that proves outcome
    for (const question of game.setup.questions) {
      const allEvents = game.timeline.flatMap(day => day.events);
      
      // Find verification events (high certainty, points to correct outcome)
      const verificationEvents = allEvents.filter(e => 
        e.relatedQuestion === question.id &&
        e.pointsToward === (question.outcome ? 'YES' : 'NO') &&
        e.day >= 25 // Late game
      );
      
      expect(verificationEvents.length).toBeGreaterThan(0);
      
      // At least one should be a revelation or announcement
      const definitiveEvents = verificationEvents.filter(e => 
        e.type === 'revelation' || e.type === 'announcement'
      );
      
      expect(definitiveEvents.length).toBeGreaterThan(0);
    }
  }, {
    timeout: 120000,
  });
});
```

**Deliverables**:
- [ ] Write field validation tests
- [ ] Write ID uniqueness tests
- [ ] Write reference validity tests
- [ ] Write resolution verification tests
- [ ] Document integration test suite

---

### 5.3 Write NPC Consistency Tests (2 hours)

**File**: `src/engine/__tests__/integration/npc-consistency.test.ts` (new)

```typescript
/**
 * Integration Tests: NPC Consistency
 * 
 * Validates that NPCs maintain consistent personas across the game.
 */

import { describe, test, expect } from 'bun:test';
import { GameGenerator } from '@/generator/GameGenerator';

describe('NPC Consistency Integration Tests', () => {
  test.skip('insiders are more accurate than deceivers', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    const allActors = [
      ...game.setup.mainActors,
      ...game.setup.supportingActors,
    ];
    
    // Separate by reliability
    const insiders = allActors.filter(a => a.persona && a.persona.reliability > 0.7);
    const deceivers = allActors.filter(a => a.persona && a.persona.reliability < 0.4);
    
    // Calculate accuracy for each group
    const insiderAccuracy = calculateGroupAccuracy(game, insiders);
    const deceiverAccuracy = calculateGroupAccuracy(game, deceivers);
    
    expect(insiderAccuracy).toBeGreaterThan(deceiverAccuracy + 0.25); // 25%+ gap
    
    console.log(`Insiders: ${(insiderAccuracy * 100).toFixed(0)}%`);
    console.log(`Deceivers: ${(deceiverAccuracy * 100).toFixed(0)}%`);
  }, {
    timeout: 120000,
  });
  
  test.skip('NPCs biased toward affiliated orgs', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    // Find NPCs with org affiliations
    const affiliatedNPCs = game.setup.mainActors
      .concat(game.setup.supportingActors)
      .filter(a => a.affiliations && a.affiliations.length > 0);
    
    for (const npc of affiliatedNPCs) {
      const affiliation = npc.affiliations![0];
      
      // Get posts about affiliated org
      const postsAboutOrg = game.timeline
        .flatMap(day => day.feedPosts)
        .filter(post => 
          post.author === npc.id &&
          post.content.includes(affiliation)
        );
      
      if (postsAboutOrg.length === 0) continue;
      
      // Calculate average sentiment
      const avgSentiment = postsAboutOrg.reduce((sum, p) => sum + (p.sentiment || 0), 0) / postsAboutOrg.length;
      
      // Should be detectably positive (>0.2) for affiliated org
      expect(avgSentiment).toBeGreaterThan(0.15);
    }
  }, {
    timeout: 120000,
  });
});

function calculateGroupAccuracy(game: GeneratedGame, npcs: Actor[]): number {
  let total = 0;
  let correct = 0;
  
  for (const npc of npcs) {
    const posts = game.timeline
      .flatMap(day => day.feedPosts)
      .filter(p => p.author === npc.id && p.pointsToward !== null);
    
    for (const post of posts) {
      const question = game.setup.questions.find(q => q.id === post.relatedQuestion);
      if (!question) continue;
      
      total++;
      if ((post.pointsToward === 'YES' || post.pointsToward === true) === question.outcome ||
          (post.pointsToward === 'NO' || post.pointsToward === false) === !question.outcome) {
        correct++;
      }
    }
  }
  
  return total > 0 ? correct / total : 0.5;
}
```

**Deliverables**:
- [ ] Write consistency tests
- [ ] Write bias tests
- [ ] Run with real generation
- [ ] Verify results meet expectations

---

### 5.4 Write Arc Validation Integration Test (2 hours)

**File**: `src/engine/__tests__/integration/arc-validation.test.ts` (new)

```typescript
/**
 * Integration Tests: Arc Validation
 * 
 * Validates that question arcs follow planned progression.
 */

import { describe, test, expect } from 'bun:test';
import { GameGenerator } from '@/generator/GameGenerator';
import { EventArcValidator } from '@/lib/services/event-arc-validator';

describe('Arc Validation Integration Tests', () => {
  test.skip('events follow planned arc distribution', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    const validator = new EventArcValidator();
    
    for (const question of game.setup.questions) {
      const arcPlan = question.metadata?.arcPlan;
      if (!arcPlan) {
        console.warn(`Question ${question.id} has no arc plan`);
        continue;
      }
      
      // Validate each phase
      const phases = ['early', 'middle', 'late', 'climax'] as const;
      
      for (const phaseName of phases) {
        const phase = arcPlan.phases[phaseName];
        const [startDay, endDay] = phase.daysRange;
        
        // Get events in this phase
        const phaseEvents = game.timeline
          .filter(day => day.day >= startDay && day.day <= endDay)
          .flatMap(day => day.events)
          .filter(e => e.relatedQuestion === question.id && e.pointsToward !== null);
        
        if (phaseEvents.length === 0) continue;
        
        // Calculate actual distribution
        const correctSignals = phaseEvents.filter(e => 
          e.pointsToward === (arcPlan.outcome ? 'YES' : 'NO')
        ).length;
        
        const actualRatio = correctSignals / phaseEvents.length;
        const expectedRatio = phase.targetCorrectSignals / phase.targetEventsTotal;
        
        // Allow ±25% variance
        expect(Math.abs(actualRatio - expectedRatio)).toBeLessThan(0.25);
        
        console.log(
          `Q${question.id} ${phaseName}: ${(actualRatio * 100).toFixed(0)}% correct ` +
          `(expected ${(expectedRatio * 100).toFixed(0)}%)`
        );
      }
    }
  }, {
    timeout: 120000,
  });
  
  test.skip('uncertainty peaks in middle, clarity at end', async () => {
    const generator = new GameGenerator();
    const game = await generator.generateCompleteGame();
    
    for (const question of game.setup.questions) {
      const allEvents = game.timeline.flatMap(day => day.events);
      
      // Calculate certainty over time (5-day windows)
      const certainties: Array<{ dayRange: string; certainty: number }> = [];
      
      for (let startDay = 1; startDay <= 26; startDay += 5) {
        const endDay = startDay + 4;
        const windowEvents = allEvents.filter(e => 
          e.relatedQuestion === question.id &&
          e.day >= startDay &&
          e.day <= endDay &&
          e.pointsToward !== null
        );
        
        if (windowEvents.length === 0) continue;
        
        const certainty = calculateCertainty(windowEvents, question.id, question.outcome);
        certainties.push({
          dayRange: `${startDay}-${endDay}`,
          certainty,
        });
      }
      
      if (certainties.length < 3) continue; // Need enough data
      
      // Find min certainty (should be in early-middle)
      const minCertainty = Math.min(...certainties.map(c => c.certainty));
      const minIndex = certainties.findIndex(c => c.certainty === minCertainty);
      
      // Min should be in first half
      expect(minIndex).toBeLessThan(certainties.length / 2);
      
      // Last certainty should be highest
      const lastCertainty = certainties[certainties.length - 1]!.certainty;
      expect(lastCertainty).toBeGreaterThan(minCertainty + 0.2);
      
      console.log(`Q${question.id} certainty progression:`);
      certainties.forEach(c => {
        console.log(`  Days ${c.dayRange}: ${(c.certainty * 100).toFixed(0)}%`);
      });
    }
  }, {
    timeout: 120000,
  });
});
```

**Deliverables**:
- [ ] Write arc validation tests
- [ ] Write uncertainty peak tests
- [ ] Run with real generation
- [ ] Verify arcs work as intended

---

## Phase 6: Final Testing & Validation (Day 6 - 4 hours)

### 6.1 Run All Tests (1 hour)

```bash
# Unit tests (fast, no API calls)
bun test src/engine/__tests__/

# Integration tests (slow, uses API)
bun test src/engine/__tests__/integration/ --timeout=300000
```

**Expected Results**:
- Unit tests: 70+ tests, 100% pass
- Integration tests: 15+ tests, 90%+ pass (some variance expected)

**Deliverables**:
- [ ] Run all unit tests
- [ ] Run all integration tests
- [ ] Fix any failures
- [ ] Document test results

---

### 6.2 Learnability Validation (2 hours)

**Create validation script**:

**File**: `scripts/validate-learnability.ts` (new)

```typescript
/**
 * Learnability Validation Script
 * 
 * Generates multiple games and validates that:
 * 1. Information gradient exists
 * 2. Simple strategies beat random
 * 3. NPCs are consistent
 * 4. Game has sufficient signal
 * 
 * Usage: bun run scripts/validate-learnability.ts
 */

import { GameGenerator } from '@/generator/GameGenerator';
import { logger } from '@/lib/logger';

async function main() {
  logger.info('Starting learnability validation...', undefined, 'Validator');
  logger.info('Generating 5 test games...', undefined, 'Validator');
  
  const generator = new GameGenerator();
  const games = [];
  
  for (let i = 0; i < 5; i++) {
    logger.info(`Generating game ${i + 1}/5...`, undefined, 'Validator');
    const game = await generator.generateCompleteGame();
    games.push(game);
  }
  
  logger.info('Games generated. Running validation...', undefined, 'Validator');
  
  // Validation 1: Information gradient
  logger.info('─'.repeat(50), undefined, 'Validator');
  logger.info('VALIDATION 1: Information Gradient', undefined, 'Validator');
  logger.info('─'.repeat(50), undefined, 'Validator');
  
  for (const game of games) {
    for (const question of game.setup.questions) {
      const earlyEvents = game.timeline.filter(d => d.day <= 10).flatMap(d => d.events);
      const lateEvents = game.timeline.filter(d => d.day >= 21).flatMap(d => d.events);
      
      const earlyCertainty = calculateCertainty(earlyEvents, question.id, question.outcome);
      const lateCertainty = calculateCertainty(lateEvents, question.id, question.outcome);
      
      const gradient = lateCertainty - earlyCertainty;
      const pass = gradient > 0.2;
      
      logger.info(
        `Q${question.id}: ${(earlyCertainty * 100).toFixed(0)}% → ${(lateCertainty * 100).toFixed(0)}% (Δ${(gradient * 100).toFixed(0)}%) ${pass ? '✅' : '❌'}`,
        undefined,
        'Validator'
      );
    }
  }
  
  // Validation 2: Simple strategy success
  logger.info('─'.repeat(50), undefined, 'Validator');
  logger.info('VALIDATION 2: Simple Strategy Success', undefined, 'Validator');
  logger.info('─'.repeat(50), undefined, 'Validator');
  
  let totalPredictions = 0;
  let correctPredictions = 0;
  
  for (const game of games) {
    for (const question of game.setup.questions) {
      totalPredictions++;
      
      // Strategy: Trust high-strength clues (>0.7)
      const strongClues = game.timeline
        .flatMap(day => day.feedPosts)
        .filter(p => 
          p.relatedQuestion === question.id &&
          p.clueStrength > 0.7 &&
          p.pointsToward !== null
        );
      
      const yesVotes = strongClues.filter(p => p.pointsToward === 'YES' || p.pointsToward === true).length;
      const noVotes = strongClues.filter(p => p.pointsToward === 'NO' || p.pointsToward === false).length;
      
      const prediction = yesVotes > noVotes;
      if (prediction === question.outcome) {
        correctPredictions++;
      }
    }
  }
  
  const accuracy = correctPredictions / totalPredictions;
  const pass = accuracy > 0.65 && accuracy < 0.85;
  
  logger.info(
    `Simple Strategy: ${correctPredictions}/${totalPredictions} = ${(accuracy * 100).toFixed(0)}% ${pass ? '✅' : '❌'}`,
    undefined,
    'Validator'
  );
  logger.info(
    `Target: 65-85% (better than random 50%, not trivial 95%)`,
    undefined,
    'Validator'
  );
  
  // Validation 3: NPC reliability correlation
  logger.info('─'.repeat(50), undefined, 'Validator');
  logger.info('VALIDATION 3: NPC Reliability Correlation', undefined, 'Validator');
  logger.info('─'.repeat(50), undefined, 'Validator');
  
  // Group NPCs by reliability
  const reliabilityBuckets = {
    high: [] as Actor[],    // >0.7
    medium: [] as Actor[],  // 0.4-0.7
    low: [] as Actor[],     // <0.4
  };
  
  for (const game of games) {
    const allActors = [...game.setup.mainActors, ...game.setup.supportingActors];
    
    for (const actor of allActors) {
      if (!actor.persona) continue;
      
      if (actor.persona.reliability > 0.7) reliabilityBuckets.high.push(actor);
      else if (actor.persona.reliability > 0.4) reliabilityBuckets.medium.push(actor);
      else reliabilityBuckets.low.push(actor);
    }
  }
  
  const highAccuracy = calculateGroupAccuracy(games[0]!, reliabilityBuckets.high);
  const mediumAccuracy = calculateGroupAccuracy(games[0]!, reliabilityBuckets.medium);
  const lowAccuracy = calculateGroupAccuracy(games[0]!, reliabilityBuckets.low);
  
  logger.info(`High reliability NPCs: ${(highAccuracy * 100).toFixed(0)}% accurate`, undefined, 'Validator');
  logger.info(`Medium reliability NPCs: ${(mediumAccuracy * 100).toFixed(0)}% accurate`, undefined, 'Validator');
  logger.info(`Low reliability NPCs: ${(lowAccuracy * 100).toFixed(0)}% accurate`, undefined, 'Validator');
  
  const pass = highAccuracy > mediumAccuracy && mediumAccuracy > lowAccuracy;
  logger.info(pass ? '✅ PASS: Reliability correlates with accuracy' : '❌ FAIL: No correlation', undefined, 'Validator');
  
  logger.info('─'.repeat(50), undefined, 'Validator');
  logger.info('VALIDATION COMPLETE', undefined, 'Validator');
}

main();
```

**Deliverables**:
- [ ] Create validation script
- [ ] Run on 5 games
- [ ] Document results
- [ ] Adjust parameters if needed

---

### 6.3 Tune Parameters (1 hour)

Based on validation results, tune:

1. **Arc phase distributions** - Adjust signal ratios
2. **NPC reliability ranges** - Ensure good distribution
3. **Clue strength ranges** - Calibrate difficulty
4. **Misdirection frequency** - Balance challenge vs frustration

**Deliverables**:
- [ ] Analyze validation results
- [ ] Identify parameter adjustments
- [ ] Update configurations
- [ ] Re-run validation

---

## Phase 7: Code Quality & Documentation (Ongoing)

### 7.1 TypeScript & Linting

**All changes must**:
- ✅ Pass TypeScript type checking
- ✅ Pass ESLint with max-warnings=0
- ✅ Build successfully

```bash
bun run typecheck
bun run lint
bun run build
```

### 7.2 Documentation

**All new classes/methods must have**:
- TSDoc comments
- Parameter descriptions
- Return value descriptions
- Usage examples
- Cross-references

---

## Implementation Checklist

### Day 1: Critical Fixes
- [ ] Fix shouldRevealAnswer() gradient bug
- [ ] Remove outcome parameter from FeedGenerator
- [ ] Add persona fields to Actor type
- [ ] Create NPCPersonaGenerator
- [ ] Update FeedGenerator to use personas
- [ ] Write persona tests
- [ ] Verify all tests pass

### Day 2: Arc Planning
- [ ] Create QuestionArcPlanner class
- [ ] Add arc planning to QuestionManager
- [ ] Update event generation to follow arcs
- [ ] Write arc planner tests
- [ ] Verify arcs generate correctly

### Day 3: Event Validation
- [ ] Create EventArcValidator
- [ ] Add validation to event generation
- [ ] Write validation tests
- [ ] Verify events follow arcs

### Day 4: Knowledge System
- [ ] Create NPCKnowledgeSystem
- [ ] Integrate into GameGenerator
- [ ] Add optional validation mode
- [ ] Write knowledge tests

### Day 5: Integration Testing
- [ ] Write learnability tests
- [ ] Write consistency tests
- [ ] Write quality validation tests
- [ ] Run all integration tests
- [ ] Document results

### Day 6: Validation & Tuning
- [ ] Create learnability validation script
- [ ] Run on 5+ games
- [ ] Analyze results
- [ ] Tune parameters
- [ ] Re-run validation
- [ ] Verify quality targets met

---

## Success Metrics

### Must Achieve:

| Metric | Target | Test Method |
|--------|--------|-------------|
| Information gradient | Late > Early + 20% | Integration test |
| NPC consistency | High reliability >70% accurate | Consistency test |
| Learnability | Simple strategy 65-85% | Strategy test |
| No outcome leakage | LLM never sees answer | Code review |
| Arc compliance | ±25% of plan | Arc validator |

### Quality Gates:

**Before merging any changes**:
1. ✅ All unit tests pass
2. ✅ TypeScript compiles
3. ✅ Linter passes (max-warnings=0)
4. ✅ Build succeeds
5. ✅ Integration tests pass (90%+)
6. ✅ Learnability validation passes

---

## Risk Mitigation

### Risks:

1. **Breaking existing functionality** (Medium)
   - Mitigation: All changes are additive, existing tests must still pass
   
2. **LLM doesn't follow arc constraints** (Medium)
   - Mitigation: Validation layer, retry logic, post-generation filtering
   
3. **Integration tests too slow** (Low)
   - Mitigation: Mark as .skip by default, run manually

4. **Over-engineering** (Low)
   - Mitigation: Keep each component simple, focus on core learnability

---

## Next Steps

1. Review this plan
2. Approve approach
3. Begin Phase 1 (Day 1)
4. Test incrementally
5. Iterate based on results

**Estimated Total Effort**: 40 hours (1 week)  
**Confidence**: High (all changes are well-scoped and testable)  
**Risk**: Low (additive changes, good test coverage)

