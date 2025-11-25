# Question Generation Consolidation Analysis

## Current State

### Where Questions Are Generated

1. **`src/lib/serverless-game-tick.ts`** (Lines 1554-2023)
   - Contains `generateNewQuestions()` function
   - Builds prompt manually with inline string concatenation
   - Handles all context gathering, prompt building, LLM calling, and persistence
   - **~470 lines of code** dedicated to question generation

2. **`src/engine/QuestionManager.ts`** (Lines 172-328)
   - Contains `generateDailyQuestions()` method
   - Uses `questionGeneration` prompt template from prompts system
   - Handles context gathering and prompt rendering
   - **~156 lines of code** dedicated to question generation
   - Returns Question objects WITHOUT persisting to database

### Key Differences

| Aspect | serverless-game-tick.ts | QuestionManager.ts |
|--------|------------------------|---------------------|
| **Prompt** | Inline string (lines 1722-1786) | Uses `questionGeneration` prompt template |
| **Example Questions** | Loads from `data/question-examples.md` | Loads from `data/question-examples.md` |
| **Context Gathering** | Fetches from database directly | Receives as parameters |
| **Persistence** | Creates Question + Market in database | Returns Question objects only |
| **NPC Betting** | Triggers MarketDecisionEngine | Not handled |
| **Oracle** | Not called here (handled in main tick) | Not handled |
| **Blockchain** | Calls `ensureMarketOnChain()` | Not handled |

## Recommendation: **YES, Consolidate to QuestionManager**

### Why Consolidate?

1. **DRY Principle**: Two implementations of the same logic
2. **Prompt System**: QuestionManager uses the proper prompt template system
3. **Separation of Concerns**: 
   - QuestionManager should handle question generation logic
   - Game tick should handle orchestration and persistence
4. **Maintainability**: One place to update question generation logic
5. **Testing**: Easier to test QuestionManager in isolation

### Proposed Consolidation Plan

**Update `QuestionManager.generateDailyQuestions()`** to:
- Keep current LLM generation logic (uses prompt template ✅)
- Keep example question loading ✅
- Return Question objects (no persistence) ✅

**Update `serverless-game-tick.ts`** to:
1. Remove `generateNewQuestions()` function entirely
2. Create new wrapper function that:
   - Fetches context data from database
   - Maps to QuestionManager parameter types
   - Calls `questionManager.generateDailyQuestions()`
   - Persists returned Question objects
   - Creates markets
   - Triggers NPC betting
   - Publishes to blockchain

### Benefits

- **-400 lines of duplicate code** removed from game tick
- **Single source of truth** for question generation logic
- **Prompt template system** used consistently
- **Better separation**: QuestionManager = logic, game-tick = orchestration
- **Easier debugging**: One place to add logging/telemetry
- **Better testing**: Can test QuestionManager without game tick complexity

### Implementation Already Started

I already began this in my previous update:
- Added QuestionManager import to serverless-game-tick.ts ✅
- Added type imports (Question, Scenario, etc.) ✅

### Next Steps

1. Update `generateNewQuestions()` in game-tick to use QuestionManager
2. Delete the inline prompt string (lines 1722-1786)
3. Add persistence wrapper around QuestionManager call
4. Test end-to-end

## Conclusion

**YES - Consolidate question generation to QuestionManager.**

The game tick should focus on:
- Fetching context data
- Calling QuestionManager
- Persisting results
- Triggering downstream effects (markets, NPC betting, blockchain)

QuestionManager should focus on:
- Building prompts from templates
- Calling LLM
- Parsing responses
- Returning structured Question objects



