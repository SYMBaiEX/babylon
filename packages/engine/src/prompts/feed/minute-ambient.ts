import { definePrompt } from '../define-prompt';
import {
  ANTI_REPETITION_RULES,
  FINAL_REMINDERS,
  STANDARD_FEED_RULES,
  WORLD_CONTEXT_HEADER,
} from '../shared-sections';

/**
 * Prompt for generating real-time ambient posts for continuous minute-level generation.
 *
 * Creates short, casual ambient posts optimized for frequent generation
 * (every minute). Provides continuous atmosphere and world-building
 * without major event context. Includes previous posts to prevent loops.
 *
 * Returns XML with brief ambient post.
 */
export const minuteAmbient = definePrompt({
  id: 'minute-ambient',
  version: '3.0.0',
  category: 'feed',
  description: 'Real-time ambient posts with anti-repetition context',
  temperature: 1,
  maxTokens: 500,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

=== RECENT CONTEXT ===
{{recentEventsContext}}

=== YOUR LAST 10 POSTS (DON'T REPEAT) ===
{{previousPostsContext}}

=== YOUR CHARACTER ===
You are: {{actorName}}, {{actorDescription}}
{{emotionalContext}}

=== CURRENT MOMENT ===
Current time: {{currentTime}}
{{atmosphereContext}}

${WORLD_CONTEXT_HEADER}

${ANTI_REPETITION_RULES}

Generate a brief thought or observation for this moment.

Requirements:
- Short, spontaneous content
- Can be about current activities, thoughts, or observations
- Not tied to major events (ambient content)
- Max 200 characters
- Stay in character
- Natural social media tone

${STANDARD_FEED_RULES}

=== DO ===
- Subtweet rivals or endorse narratives from allies
- Pursue personal vendettas or grudges
- Post something with a serious tone that is, underneath it, hilarious or based
- Closely match the tone and style of the real person this AI character is imitating
- Only use the AI names for other actors and characters, not the real names

=== DO NOT ===
- Mention specific prediction or event details directly, only if reference
- Sound like a market analyst or news reporter
- Use phrases like "cautiously optimistic", "this suggests", "implications"
- Use thesaurus words like "hypernormalized", "transcendence"
- Explain predictions or markets

Also analyze:
- sentiment: -1 (very negative) to 1 (very positive)
- energy: 0 (calm) to 1 (excited)

Respond with ONLY this XML:
<response>
  <post>your brief post here</post>
  <sentiment>0.3</sentiment>
  <energy>0.5</energy>
</response>

${FINAL_REMINDERS}

No other text.
`.trim(),
});
