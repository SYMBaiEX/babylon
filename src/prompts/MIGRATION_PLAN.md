# Prompt System Migration Plan

## ✅ Phase 3A Complete (Infrastructure)

### What's Been Set Up

1. **Directory Structure** Created
   ```
   src/prompts/
   ├── feed/          # Feed generation prompts
   ├── game/          # Game setup prompts
   ├── image/         # Image generation prompts
   ├── loader.ts      # Prompt loading utility
   └── README.md      # Documentation
   ```

2. **Prompt Loader Utility** [src/prompts/loader.ts](loader.ts)
   - Loads prompts from markdown files with YAML frontmatter
   - Variable substitution with `{{variableName}}` syntax
   - Caching for performance
   - TypeScript typed interfaces

3. **Example Prompt** [src/prompts/feed/news-posts.md](feed/news-posts.md)
   - Demonstrates the format and structure
   - Shows variable substitution
   - Includes metadata (version, temperature, etc.)

### How To Use

```typescript
import { loadPrompt } from '@/prompts/loader';

// Before (inline):
const prompt = `You must respond with valid JSON only.
Event: ${event.description}
...`;

// After (external):
const prompt = loadPrompt('feed/news-posts', {
  eventDescription: event.description,
  eventType: event.type,
  sourceContext: source ? `Sources close to ${source.name} leaked information.` : '',
  outcomeFrame: outcome ? 'Frame with positive spin' : 'Emphasize problems and concerns',
  mediaCount: mediaEntities.length,
  mediaList: mediaEntities.map((entity, i) => {
    return `${i + 1}. ${entity.name}\n   About: ${entity.description}\n   ...`;
  }).join('\n')
});
```

## 📋 Phase 3B: Remaining Prompt Extractions

### Priority 1: Feed Generation Prompts (FeedGenerator.ts)

**High Impact** - These cause most retry loops

- [ ] `feed/world-events.md` - Line 352 (news posts) ✅ DONE
- [ ] `feed/reactions.md` - Line 469
- [ ] `feed/conspiracy.md` - Line 565
- [ ] `feed/commentary.md` - Line 652
- [ ] `feed/ambient-posts.md` - Line 753
- [ ] `feed/event-reactions.md` - Line 824
- [ ] `feed/reactions-batch.md` - Line 896
- [ ] `feed/conspiracy-batch.md` - Line 982
- [ ] `feed/commentary-batch.md` - Line 1068
- [ ] `feed/ambient-batch.md` - Line 1143
- [ ] `feed/threads.md` - Line 1215
- [ ] `feed/replies.md` - Line 1341
- [ ] `feed/post-replies.md` - Line 1486
- [ ] `feed/group-reactions.md` - Line 1579
- [ ] `feed/group-replies.md` - Line 1653

**Estimated Impact:** 70% reduction in retry loops, 50% faster generation

### Priority 2: Game Generation Prompts (GameGenerator.ts)

- [ ] `game/scenarios.md` - Line 647
- [ ] `game/questions.md` - Line 902
- [ ] `game/question-rankings.md` - Line 954
- [ ] `game/group-chat-names.md` - Line 1081
- [ ] `game/event-descriptions.md` - Line 1378, 1456
- [ ] `game/group-messages.md` - Line 1493
- [ ] `game/group-message-replies.md` - Line 1666
- [ ] `game/actor-voice.md` - Line 1829

**Estimated Impact:** 30% reduction in retry loops, better narrative coherence

### Priority 3: Image Generation Prompts (generate-actor-images.ts)

- [ ] `image/actor-portrait.md` - Line 63
- [ ] `image/organization-logo.md` - Line 100

**Estimated Impact:** Consistent image style, easier A/B testing

## 🔧 Migration Steps (Per Prompt)

1. **Extract** prompt from code to `.md` file
2. **Add** YAML frontmatter with metadata
3. **Identify** variables (text that changes per call)
4. **Replace** variables with `{{variableName}}` syntax
5. **Update** code to use `loadPrompt('category/name', { vars })`
6. **Test** generation to ensure same behavior
7. **Optimize** prompt if needed (reduce retries)

## 📊 Expected Benefits

### Immediate

- ✅ **Centralized** - All prompts in one place
- ✅ **Versionable** - Track changes over time
- ✅ **Testable** - Easy to A/B test different versions
- ✅ **Maintainable** - Separate concerns from code logic

### After Full Migration

- 🎯 **50-70% Faster** - Reduced retry loops
- 🎯 **90%+ Success Rate** - Better JSON formatting
- 🎯 **Consistent Quality** - Standardized prompts
- 🎯 **Easy Optimization** - Iterate on prompts without code changes

## 🚀 Next Steps

1. **Complete Phase 3B** - Extract remaining prompts (2-3 hours)
2. **Optimize Prompts** - Reduce retry loops (1-2 hours)
3. **A/B Testing** - Test variations for quality (ongoing)
4. **Documentation** - Add examples and best practices (30 min)

## 📝 Notes

- Keep variable names descriptive and consistent
- Use `camelCase` for variable names
- Include examples in prompt files
- Document any special formatting requirements
- Test each prompt after extraction to ensure parity
