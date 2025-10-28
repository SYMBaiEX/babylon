# Babylon Prompt System

Centralized prompt management for LLM-driven game generation.

## Structure

```
prompts/
├── feed/          # Feed post generation prompts
│   ├── world-events.md
│   ├── news-posts.md
│   ├── reactions.md
│   ├── conspiracy.md
│   ├── commentary.md
│   ├── threads.md
│   └── replies.md
├── game/          # Game setup prompts
│   ├── scenarios.md
│   ├── questions.md
│   ├── rankings.md
│   ├── group-chat-names.md
│   ├── event-descriptions.md
│   └── group-messages.md
└── image/         # Image generation prompts
    ├── actor-images.md
    └── organization-logos.md
```

## File Format

Each `.md` file contains one or more prompt templates with YAML frontmatter:

```markdown
---
id: world-events
version: 1.0.0
category: feed
description: Generates world events that actors react to
temperature: 0.8
max_tokens: 2000
---

# World Events Prompt

You must respond with valid JSON only.

Generate {{count}} realistic world events...

## Variables
- {{count}}: Number of events to generate
- {{context}}: Additional context about the game world
```

## Usage

```typescript
import { loadPrompt } from '@/prompts/loader';

const prompt = await loadPrompt('feed/world-events', {
  count: 5,
  context: gameContext
});

const result = await llm.generateJSON(prompt);
```

## Benefits

- ✅ **Centralized** - All prompts in one place
- ✅ **Versionable** - Track prompt changes over time
- ✅ **Testable** - Easy to A/B test prompts
- ✅ **Maintainable** - Separate concerns from code
- ✅ **Optimizable** - Reduce retry loops and improve quality
