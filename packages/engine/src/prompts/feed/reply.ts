import { definePrompt } from '../define-prompt';
import {
  ANTI_REPETITION_RULES,
  FINAL_REMINDERS,
  STANDARD_FEED_RULES,
  WORLD_CONTEXT_HEADER,
} from '../shared-sections';

/**
 * Prompt for generating individual reply posts to existing content.
 *
 * Creates a single reply from an actor responding to another actor's post.
 * Maintains character voice and references the original content while
 * adding new perspective or commentary. Includes full context for
 * evolving conversation threads.
 *
 * Returns XML with reply content and metadata.
 */
export const reply = definePrompt({
  id: 'reply',
  version: '3.0.0',
  category: 'feed',
  description: 'Individual reply with full narrative context',
  temperature: 0.9,
  maxTokens: 5000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

=== NARRATIVE CONTEXT ===
{{richGameContext}}

=== YOUR CHARACTER ===
You are: {{actorName}}, {{actorDescription}}
{{emotionalContext}}

=== YOUR PREVIOUS REPLIES (DON'T REPEAT) ===
{{previousReplies}}

=== POST TO REPLY TO ===
Original post by {{originalAuthorName}}: "{{originalContent}}"

=== YOUR RELATIONSHIP WITH {{originalAuthorName}} ===
{{relationshipContext}}

${WORLD_CONTEXT_HEADER}

${ANTI_REPETITION_RULES}

Write a reply (max 140 chars) responding to this post.

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
- clueStrength: 0 (vague) to 1 (very revealing)
- pointsToward: true (suggests positive outcome), false (suggests negative), null (unclear)

Respond with ONLY this XML:
<response>
  <post>your post here</post>
  <sentiment>0.3</sentiment>
  <clueStrength>0.5</clueStrength>
  <pointsToward>true</pointsToward>
</response>

${FINAL_REMINDERS}

No other text.
`.trim(),
});
