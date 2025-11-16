# World Facts Update Guide

This guide explains how to update the reality grounding system with current world facts.

## Source Document

**Location:** `/docs/vendor/world-facts.md`

This markdown file contains comprehensive world facts compiled from research:
- Cryptocurrency prices (BTC, ETH, SOL, DOGE)
- Major stock prices (META, NVDA, TSLA)
- U.S. political leadership and events
- State of AI (latest models, releases, roadmaps)
- Technology products (iPhone versions, etc.)
- Pop culture trends
- Economic indicators
- Foreign policy context

**Last Updated:** November 15, 2025

## Reality Grounding System

**Location:** `/src/prompts/reality-grounding.ts`

This TypeScript file contains the condensed, prompt-ready version of world facts.

### Structure

```typescript
// Full context constant (~2000 tokens)
export const REALITY_GROUNDING = `...`;

// Dynamic date context
export function getCurrentDateContext() { ... }

// Prompt-ready grounding (concise version ~500 tokens)
export function getRealityGrounding() { ... }

// Minimal version (~50 tokens)
export function getMinimalRealityGrounding() { ... }

// Validation checks
export function checkRealityGrounding(text: string) { ... }
```

## How to Update

### Step 1: Research Current Facts

Update `/docs/vendor/world-facts.md` with latest information:

```bash
# Add new sections or update existing ones
# Focus on facts LLMs might get wrong due to old training data:
- Current prices (crypto, stocks)
- Political leadership
- Latest AI model releases
- Recent tech products
- Major world events
```

### Step 2: Extract Key Highlights

From the comprehensive markdown, extract key facts that affect game generation:

**Priority 1 - High Impact (Always Update):**
- Cryptocurrency prices (prevent "Will BTC hit $35K?" when it's at $95K)
- Major stock prices
- Current president and administration
- Latest AI models (GPT-X, Claude X, Gemini X)
- Current iPhone/tech product versions

**Priority 2 - Medium Impact:**
- Economic indicators (interest rates, inflation)
- Major ongoing conflicts
- Pop culture trends
- Recent major events

**Priority 3 - Low Impact (Update Monthly):**
- Minor political figures
- Detailed event descriptions
- Extended context

### Step 3: Update Reality Grounding File

Edit `/src/prompts/reality-grounding.ts`:

1. Update `REALITY_GROUNDING` constant (full version)
2. Update `getRealityGrounding()` if structure changes
3. Update date in comments at top of file
4. Update validation rules if new patterns emerge

### Step 4: Test Generation

Run a test generation to ensure grounded output:

```typescript
import { generateWorldContext, validateGeneratedContent } from '@/prompts';

// Generate with reality grounding
const context = await generateWorldContext({
  realityGroundingLevel: 'full'
});

console.log(context.realityGrounding);

// Test validation
const testText = "Will Bitcoin hit $35,000?";
const warnings = validateGeneratedContent(testText).warnings;
// Should warn about outdated BTC price
```

### Step 5: Update Tests

If facts change significantly, update integration tests:

```bash
# Run quality tests
bun run test src/engine/__tests__/integration/game-quality.test.ts
```

## Update Schedule

**Weekly:**
- Cryptocurrency prices (volatile)
- Major stock prices (if significant moves)

**Monthly:**
- AI model releases
- Political events
- Tech product launches
- Pop culture trends

**Quarterly:**
- Economic indicators
- Full comprehensive review

## Validation Patterns

Current validation patterns in `checkRealityGrounding()`:

```typescript
// Outdated Bitcoin price
if (text.match(/bitcoin.*?\$([1-5][0-9],?000)/i))

// Wrong president
if (text.match(/president.*?biden/i) && !text.match(/former|ex-/i))

// Outdated AI models
if (text.match(/GPT-4(?!\.5)/i) && !text.match(/old|previous|earlier/i))

// Outdated iPhone
if (text.match(/iPhone\s*(14|15|16)(?!\s*series)/i))
```

Add new patterns as needed when new facts become important.

## Example Update Flow

```bash
# 1. Research current facts
# Browse news, check coinmarketcap, check tech release calendars

# 2. Update world-facts.md
code docs/vendor/world-facts.md

# 3. Extract key facts and update reality-grounding.ts
code src/prompts/reality-grounding.ts

# 4. Test
bun run typecheck
bun run lint
bun run build

# 5. Verify in running game
# Check generated questions don't reference outdated facts
```

## Automated Updates (Future)

Consider implementing:
- [ ] Cron job to fetch crypto/stock prices from APIs
- [ ] RSS feed integration for major news
- [ ] Automated validation of generated content against current facts
- [ ] Alert system when validation detects many outdated references

## Questions?

See `/src/prompts/README.md` for the main prompt system documentation.

