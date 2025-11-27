# Feed Prompts - Quick Reference Card

## 📝 Generate Feed Content in 3 Lines

```typescript
import { generateWorldContext } from '@/lib/prompts';
import { renderPrompt, ambientPosts } from '@/prompts';

const worldContext = await generateWorldContext();
const prompt = renderPrompt(ambientPosts, { day: 5, actorCount: 3, actorsList: "...", ...worldContext });
const posts = await ai.generate(prompt);
```

## 🎯 What You Get

```
worldContext = {
  worldActors: "AIlon Musk (@ailonmusk), Sam AIltman (@ailtman), ..." // 30 actors
  currentMarkets: "Predictions: Bitcoin $30k? (50% Yes) | ... / Stocks: NVIDAI $1317.20 | ..."
  recentTrades: "SpartAIn open_long OPENAI | Arthur HAIyes open_long METAI | ..."
}
```

## 📊 Available Prompts

```typescript
import {
  // Batch (multiple posts)
  ambientPosts, reactions, newsPosts,
  conspiracy, commentary, replies,
  
  // Individual (single post)
  companyPost, governmentPost,
  analystReaction, stockTicker, minuteAmbient,
  reply,
} from '@/prompts';
```

## ✅ Validation

```typescript
import { validateFeedPost, CHARACTER_LIMITS } from '@/lib/prompts';

const result = validateFeedPost(post, {
  maxLength: CHARACTER_LIMITS.AMBIENT,
  postType: 'AMBIENT'
});

// Checks: real names ❌, hashtags ❌, emojis ❌, length ✅
```

## 📏 Character Limits

```typescript
CHARACTER_LIMITS.AMBIENT        // 280
CHARACTER_LIMITS.REPLY          // 140
CHARACTER_LIMITS.REACTION       // 140
CHARACTER_LIMITS.MINUTE_AMBIENT // 200
CHARACTER_LIMITS.ANALYST        // 250
```

## 🚨 Rules Enforced

Every prompt enforces:
- ❌ NO real names (Elon Musk, Sam Altman, etc.)
- ✅ ONLY parody names (AIlon Musk, Sam AIltman, etc.)
- ❌ NO hashtags
- ❌ NO emojis
- ✅ Short posts (140-280 chars)

## 🗂️ Files

- **Main**: `src/lib/prompts/world-context.ts`
- **Validation**: `src/lib/prompts/validate-output.ts`
- **Examples**: `src/lib/prompts/complete-example.ts`
- **Test**: `scripts/test-world-context.ts`
- **Prompts**: `src/prompts/feed/*.ts` (26 files)

## 🧪 Test

```bash
npx tsx scripts/test-world-context.ts
```

## 📖 Full Docs

See `src/lib/prompts/README.md` for complete documentation.

