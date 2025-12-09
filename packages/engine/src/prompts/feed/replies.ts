import { definePrompt } from '../define-prompt';
import {
  ANTI_REPETITION_RULES,
  FINAL_REMINDERS,
  STANDARD_FEED_RULES,
  VALUE_RANGES,
  WORLD_CONTEXT_HEADER,
} from '../shared-sections';

/**
 * Prompt for generating a single reply post creating conversation.
 *
 * Generates a reply from an actor responding to an original post, creating
 * natural conversation flow. Maintains character voice and builds on the
 * original post. This is called PER CHARACTER (not batched) to ensure
 * full character context and better voice matching.
 * Includes full context for evolving conversation threads.
 *
 * Returns XML with a single reply entry.
 */
export const replies = definePrompt({
  id: 'replies',
  version: '5.0.0',
  category: 'feed',
  description: 'Generates reply with full character context (per-character)',
  temperature: 1,
  maxTokens: 6000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

=== ALL CHARACTERS IN WORLD ===
{{characterRoster}}

=== {{characterName}}'S FULL PROFILE ===
{{characterInfo}}

=== {{characterName}}'S RELATIONSHIPS ===
{{characterRelationships}}

=== PROFILE OF @{{originalAuthorName}} ===
{{originalAuthorProfile}}

=== NARRATIVE CONTEXT ===
{{richGameContext}}

=== CONVERSATION THREAD ===
Original post by @{{originalAuthorName}}: "{{originalContent}}"

Previous replies in this thread:
{{threadHistory}}

=== RELATIONSHIP BETWEEN {{characterName}} AND {{originalAuthorName}} ===
{{relationshipContext}}

=== {{characterName}}'S PREVIOUS REPLIES (DON'T REPEAT) ===
{{previousRepliesContext}}

{{groupContext}}

${WORLD_CONTEXT_HEADER}

${STANDARD_FEED_RULES}

${ANTI_REPETITION_RULES}

=== YOUR TASK ===
Write ONE reply post AS {{characterName}} responding to the post above (STRICT MAX 140 CHARACTERS).

Match {{characterName}}'s style EXACTLY from the context above.
A reader should identify WHO wrote this post without seeing the author name.

=== DO ===
- Subtweet rivals or endorse narratives from allies
- Pursue personal vendettas or grudges
- Post something with a serious tone that is, underneath it, hilarious or based
- Closely match the tone and style of the real person this AI character is imitating
- Only use the AI names for other actors and characters, not the real names
- REPLY DYNAMICS - this is social media, not polite discussion:
  - Agreement: "this", "W", "based", pile on with support
  - Disagreement: "ratio", "L take", "this ain't it", dismissive one-liners
  - Quote dunk: Mock the original point directly
  - Escalate: Raise stakes, don't de-escalate

=== DO NOT ===
- Mention specific prediction or event details directly, only if reference
- Sound like a market analyst or news reporter
- Use phrases like "cautiously optimistic", "this suggests", "implications"
- Use thesaurus words like "hypernormalized", "transcendence"
- Explain predictions or markets

CHARACTER LIMIT: Post MUST be 140 characters or less.

${VALUE_RANGES}

Respond with ONLY this XML format:
<response>
  <reply>
    <post>post content matching {{characterName}}'s style from above</post>
    <sentiment>number between -1 and 1</sentiment>
    <clueStrength>number between 0 and 1</clueStrength>
    <pointsToward>true | false | null</pointsToward>
  </reply>
</response>

CRITICAL: Return exactly ONE reply that matches {{characterName}}'s voice/style/examples defined above. Must have post, sentiment, clueStrength, pointsToward elements.

${FINAL_REMINDERS}
`.trim(),
});
