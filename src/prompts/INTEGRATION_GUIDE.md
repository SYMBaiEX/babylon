# Code Integration Guide

Step-by-step guide for refactoring FeedGenerator.ts and GameGenerator.ts to use the prompt system.

## Status

✅ **Completed**:
- Prompt system infrastructure (loader.ts)
- 14 prompts extracted to markdown files
- Image generation refactored (generate-actor-images.ts)
- Imports added to FeedGenerator.ts and GameGenerator.ts

🔄 **In Progress**:
- Refactoring FeedGenerator batched methods
- Refactoring GameGenerator batched methods

## FeedGenerator.ts Refactoring

### Import Added ✅
```typescript
import { loadPrompt } from '../prompts/loader';
```

### Methods to Refactor

#### 1. generateNewsPostsBatch() - Line 352

**Current Code:**
```typescript
const prompt = `You must respond with valid JSON only.
Event: ${worldEvent.description}
// ... rest of inline prompt
`;
```

**Target Code:**
```typescript
const sourceContext = sourceOrganization ?
  `Source Organization: ${sourceOrganization.name} - ${sourceOrganization.description}` : '';

const outcomeFrame = outcome
  ? 'Frame stories with cautious optimism or potential positives'
  : 'Emphasize concerns, problems, or uncertainties';

const mediaList = media.map((m, i) => `${i + 1}. ${m.name}
   Type: ${m.type}
   About: ${m.description}
   Bias: ${m.description.toLowerCase().includes('progressive') ? 'left-leaning' : m.description.toLowerCase().includes('conservative') ? 'right-leaning' : 'mixed'}

   Write breaking news (max 280 chars).
   Match your organization's typical editorial bias.
   Be provocative and attention-grabbing.`).join('\n');

const prompt = loadPrompt('feed/news-posts', {
  eventDescription: worldEvent.description,
  eventType: worldEvent.type,
  sourceContext,
  outcomeFrame,
  mediaCount: media.length,
  mediaList
});
```

#### 2. generateReactionsBatch() - Line 469

**Variables needed:**
- `eventDescription` - worldEvent.description
- `eventContext` - outcome messaging
- `actorCount` - contexts.length
- `actorsList` - formatted list with mood/luck/voice context

#### 3. generateCommentaryBatch() - Line 565

**Variables needed:**
- `eventDescription` - worldEvent.description
- `outcome` - boolean for tone
- `commentatorCount` - commentators.length
- `commentatorsList` - formatted with emotional context

#### 4. generateConspiracyPostsBatch() - Line 652

**Variables needed:**
- `eventDescription` - worldEvent.description
- `outcome` - for framing instructions
- `conspiracistCount` - conspiracists.length
- `conspiracistsList` - formatted list

#### 5. generateAmbientPostsBatch() - Line 1341

**Variables needed:**
- `day` - day number
- `progressContext` - Early/Mid/Late game context
- `atmosphereContext` - Outcome-based atmosphere
- `actorCount` - actors.length
- `actorsList` - formatted with mood/luck/group context

#### 6. generateRepliesBatch() - Line 1486

**Variables needed:**
- `originalAuthorName` - originalPost.authorName
- `originalContent` - originalPost.content
- `replierCount` - actors.length
- `repliersList` - formatted with emotional context

## GameGenerator.ts Refactoring

### Import Added ✅
```typescript
import { loadPrompt } from '../prompts/loader';
```

### Methods to Refactor

#### 1. generateGroupChatName() - Line 1081

**Current**: Inline prompt string
**Target**:
```typescript
const memberDescriptions = members.map((m, i) =>
  `${i + 1}. ${m.name} - ${m.description}`
).join('\n');

const prompt = loadPrompt('game/group-chat-names', {
  adminName: admin.name,
  adminRole: admin.role || 'Notable figure',
  domain,
  adminAffiliations: admin.affiliations?.slice(0, 3).join(', ') || 'various organizations',
  memberDescriptions
});
```

#### 2. generateDayEventsBatch() - Line 1378

**Variables needed:**
- `fullContext` - narrative context from previous days
- `day` - day number
- `eventCount` - eventRequests.length
- `eventRequestsList` - formatted event requests with actors/questions

#### 3. generateDayGroupMessagesBatch() - Line 1670

**Variables needed:**
- `day` - day number
- `eventsList` - events.map(e => e.description).join('; ')
- `recentEventContext` - optional recent event highlight
- `groupCount` - groupRequests.length
- `groupsList` - complex formatted group data with members, relationships, history

#### 4-6. Helper Functions (Lower Priority)

These build prompt strings but don't call LLM directly:
- `createScenarioPrompt()` - Line 159
- `createQuestionPrompt()` - Line 220
- Question ranking inline - Line 955

**Note**: These can use loadPrompt() but less critical since they're helpers.

## Refactoring Pattern

For each method:

1. **Identify Variables**: What data needs to be inserted into the prompt?
2. **Format Data**: Build the variable values (lists, contexts, etc.)
3. **Call loadPrompt()**: Replace inline string with `loadPrompt('category/name', variables)`
4. **Test**: Verify output matches original behavior

## Testing Strategy

After each refactoring:

1. **TypeScript**: `bunx tsc --noEmit` - Check for type errors
2. **Unit Tests**: `bun test` - Verify functionality
3. **Generation Test**: `bun run src/cli/generate-game.ts` - Full game generation
4. **Compare Output**: Ensure prompts produce equivalent results

## Benefits

- **Easier Optimization**: Tweak prompts without touching code
- **Version Control**: Track prompt changes separately
- **A/B Testing**: Easy to test prompt variations
- **Reduced Retry Loops**: Clearer format = fewer LLM errors
- **Better Maintainability**: Prompts organized by category

## Next Steps

1. Complete FeedGenerator refactoring (6 methods)
2. Complete GameGenerator refactoring (3 main methods + 3 helpers)
3. Run full test suite
4. Measure generation speed improvements
5. Optimize prompts based on retry loop patterns
