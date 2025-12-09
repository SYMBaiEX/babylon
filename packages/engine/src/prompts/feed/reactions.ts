import { definePrompt } from '../define-prompt';
import {
  ANTI_REPETITION_RULES,
  FINAL_REMINDERS,
  STANDARD_FEED_RULES,
  VALUE_RANGES,
  WORLD_CONTEXT_HEADER,
} from '../shared-sections';

/**
 * Prompt for generating a single actor reaction to world events.
 *
 * Creates reaction posts from actors responding to events, announcements,
 * or other content. Captures character-driven responses that reflect
 * personality and relationships. This is called PER CHARACTER (not batched)
 * to ensure full character context and better voice matching.
 * Includes full narrative context for connected, evolving reactions.
 *
 * Returns XML with a single reaction post and sentiment analysis.
 */
export const reactions = definePrompt({
  id: 'reactions',
  version: '5.0.0',
  category: 'feed',
  description: 'Generates actor reaction with full character context (per-character)',
  temperature: 1,
  maxTokens: 8000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

=== ALL CHARACTERS IN WORLD ===
{{characterRoster}}

=== {{characterName}}'S FULL PROFILE ===
{{characterInfo}}

=== {{characterName}}'S RELATIONSHIPS ===
{{characterRelationships}}

=== COMPLETE NARRATIVE CONTEXT ===
{{richGameContext}}

=== EVENT TO REACT TO ===
Event: {{eventDescription}}
{{eventContext}}

=== HOW THIS CONNECTS ===
Related questions: {{relatedQuestions}}
Related storylines: {{relatedNarratives}}
Previous similar events: {{similarPreviousEvents}}

=== PHASE AND CONTEXT ===
{{phaseContext}}

{{relationshipContext}}

=== {{characterName}}'S REACTION HISTORY (DON'T REPEAT) ===
{{previousPostsContext}}

${WORLD_CONTEXT_HEADER}

${STANDARD_FEED_RULES}

${ANTI_REPETITION_RULES}

=== YOUR TASK ===
Write ONE reaction post AS {{characterName}} reacting to the event above (STRICT MAX 140 CHARACTERS).

Match {{characterName}}'s style EXACTLY from the context above.
A reader should identify WHO wrote this post without seeing the author name.

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

CHARACTER LIMIT: Post MUST be 140 characters or less.

${VALUE_RANGES}

Respond with ONLY this XML format:
<response>
  <reaction>
    <post>post content matching {{characterName}}'s style from above</post>
    <sentiment>number between -1 and 1</sentiment>
    <clueStrength>number between 0 and 1</clueStrength>
    <pointsToward>true | false | null</pointsToward>
  </reaction>
</response>

CRITICAL: Return exactly ONE reaction that matches {{characterName}}'s voice/style/examples defined above. Must have post, sentiment, clueStrength, pointsToward elements.

${FINAL_REMINDERS}
`.trim(),
});
