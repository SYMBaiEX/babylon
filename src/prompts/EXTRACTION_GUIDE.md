# Prompt Extraction Guide

Step-by-step guide for extracting inline prompts to the new prompt system.

## ✅ Completed Extractions

### Phase 3B - Round 1 (14 prompts extracted)

**Feed Generation (6 prompts)**:
1. **feed/news-posts.md** - News post generation (FeedGenerator.ts:352)
2. **feed/reactions.md** - Actor reactions to events (FeedGenerator.ts:469)
3. **feed/commentary.md** - Expert commentary/analysis (FeedGenerator.ts:565)
4. **feed/conspiracy.md** - Conspiracy theorist takes (FeedGenerator.ts:652)
5. **feed/ambient-posts.md** - Organic background posts (FeedGenerator.ts:1341)
6. **feed/replies.md** - Reply posts creating conversations (FeedGenerator.ts:1486)

**Game Generation (6 prompts)**:
7. **game/group-messages.md** - Private group chat messages (GameGenerator.ts:1670)
8. **game/scenarios.md** - 3 satirical game scenarios (GameGenerator.ts:185)
9. **game/questions.md** - Yes/no prediction questions (GameGenerator.ts:232)
10. **game/question-rankings.md** - Question quality ranking (GameGenerator.ts:955)
11. **game/group-chat-names.md** - Satirical group names (GameGenerator.ts:1081)
12. **game/event-descriptions.md** - Daily event generation (GameGenerator.ts:1378)

**Image Generation (2 prompts)**:
13. **image/actor-portrait.md** - Character portraits (generate-actor-images.ts:63)
14. **image/organization-logo.md** - Organization logos (generate-actor-images.ts:100)

## 📋 Remaining Extractions (Lower Priority)

### Specialized Feed Prompts (Optional)

The major batched prompts have been extracted. These remaining prompts are smaller, individual generation functions that are less critical:

#### **feed/journalist-post.md** (FeedGenerator.ts:753)
- **Pattern**: Individual journalist breaking news post
- **Variables**: journalist, event, emotionalContext
- **Temperature**: 0.9
- **Impact**: Low (batched news-posts.md covers most use cases)
- **Note**: Consider if this is needed or if news-posts.md is sufficient

#### **feed/media-post.md** (FeedGenerator.ts:824)
- **Pattern**: Individual media organization post with bias
- **Variables**: media, event, potentialSource
- **Temperature**: 0.9
- **Impact**: Low (batched news-posts.md covers most use cases)
- **Note**: Consider if this is needed or if news-posts.md is sufficient

### Specialized Game Prompts (Optional)

#### **game/baseline-event.md** (GameGenerator.ts:647)
- **Pattern**: Generate mundane baseline event (fallback)
- **Variables**: dateStr, type, actorDescriptions
- **Temperature**: 0.7
- **Impact**: Very Low (fallback for when main event generation fails)
- **Note**: May not need extraction as it's rarely used

### Analysis

**Major Extractions Complete**: 14 out of ~17 total prompts extracted
**Retry Loop Impact**: Covered all high-impact batched prompts
**Remaining Work**: 3 optional individual prompts with low retry impact

## 🔧 Extraction Process

### 1. Read the Inline Prompt

```bash
# Find the prompt in the source file
grep -n "const prompt" src/engine/FeedGenerator.ts
```

### 2. Create the Markdown File

```bash
touch src/prompts/feed/prompt-name.md
```

### 3. Extract to Markdown with Frontmatter

```markdown
---
id: prompt-name
version: 1.0.0
category: feed|game|image
description: What this prompt does
temperature: 0.8
max_tokens: 2000
---

[Prompt content with {{variables}}]
```

### 4. Identify Variables

Look for dynamic content in the inline prompt:
- `${variable}` → `{{variable}}`
- Template strings → Variable names
- Array maps → Loop variables

### 5. Update the Code

```typescript
// Before
const prompt = `You must respond...
Event: ${worldEvent.description}
Generate posts for ${actors.length} actors...`;

// After
import { loadPrompt } from '@/prompts/loader';

const prompt = loadPrompt('feed/prompt-name', {
  eventDescription: worldEvent.description,
  actorCount: actors.length,
  actorsList: actors.map((actor, i) => `${i + 1}. ${actor.name}...`).join('\n')
});
```

### 6. Test Generation

```bash
# Run tests to verify same behavior
bun test src/engine/__tests__/

# Or generate a game
bun run src/cli/generate-game.ts
```

## 📊 Variable Patterns

Common variables across prompts:

- `{{eventDescription}}` - World event description
- `{{actorCount}}` - Number of actors
- `{{actorsList}}` - Formatted list of actors with context
- `{{mediaCount}}` - Number of media entities
- `{{mediaList}}` - Formatted list of media entities
- `{{sourceContext}}` - Context about information sources
- `{{outcomeFrame}}` - Positive or negative framing
- `{{emotionalContext}}` - Mood and luck context for actors
- `{{groupContext}}` - Private group chat context

## ✅ Validation Checklist

After each extraction:

- [ ] Prompt file has valid YAML frontmatter
- [ ] All `${variables}` converted to `{{variables}}`
- [ ] Code updated to use `loadPrompt()`
- [ ] Variables object includes all needed data
- [ ] TypeScript compiles without errors
- [ ] Tests pass
- [ ] Generation produces same quality output
- [ ] No regression in success rate

## 🚀 Quick Reference

```typescript
// Load a prompt
import { loadPrompt } from '@/prompts/loader';

const prompt = loadPrompt('feed/reactions', {
  eventDescription: 'Tesla announces Dogecoin support',
  actorCount: 5,
  actorsList: formattedActors
});

// Get metadata
import { getPromptMetadata } from '@/prompts/loader';

const meta = getPromptMetadata('feed/reactions');
console.log(meta.temperature); // 1.0
```

## 📝 Tips

1. **Start with high-impact prompts** - Feed generation prompts have the most retries
2. **Keep variable names consistent** - Reuse patterns like `{{actorCount}}` and `{{actorsList}}`
3. **Test incrementally** - Extract and test one prompt at a time
4. **Document special requirements** - Note any unusual formatting in prompt comments
5. **Preserve examples** - Keep JSON examples in prompts for LLM guidance
6. **Optimize later** - First goal is parity, then optimize for fewer retries
