import { definePrompt } from '../define-prompt';
import {
  ANTI_REPETITION_RULES,
  FINAL_REMINDERS,
  STANDARD_FEED_RULES,
  VALUE_RANGES,
  WORLD_CONTEXT_HEADER,
} from '../shared-sections';

/**
 * Prompt for generating a single ambient post from an actor not directly involved in events.
 *
 * Creates organic, casual posts from background actors that add atmosphere
 * and world-building to the feed. This is called PER CHARACTER (not batched)
 * to ensure full character context and better voice matching.
 * Includes full narrative context for connected, non-repetitive posts.
 *
 * Returns XML with a single post entry.
 */
export const ambientPosts = definePrompt({
  id: 'ambient-posts',
  version: '5.0.0',
  category: 'feed',
  description:
    'Generates ambient post with full character context (per-character)',
  temperature: 1.1,
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

=== ONGOING STORYLINES ===
{{ongoingNarrativesContext}}

=== RESOLVED QUESTIONS (Reference as established facts) ===
{{resolvedQuestionsContext}}

=== DAY {{day}}/30 CONTEXT ===
{{progressContext}}
{{atmosphereContext}}
Phase: {{phaseContext}}

{{trendContext}}

{{timeEnergy}}

=== {{characterName}}'S POST HISTORY (DON'T REPEAT) ===
{{previousPostsContext}}

${WORLD_CONTEXT_HEADER}

${STANDARD_FEED_RULES}

=== {{characterName}}'S EVENT INVOLVEMENT ===
{{characterEventHistory}}

${ANTI_REPETITION_RULES}

=== YOUR TASK ===
Write ONE ambient post AS {{characterName}} (STRICT MAX 140 CHARACTERS).

This is general thoughts/observations - can subtly reference ongoing events.
Match {{characterName}}'s style EXACTLY from the context above.
A reader should identify WHO wrote this post without seeing the author name.

NARRATIVE AWARENESS:
- You can reference resolved questions as established facts
- You can subtly react to ongoing storylines
- You can reference other characters' recent posts
- Don't repeat takes you've already made (see post history above)

=== DO ===
- Subtweet rivals or endorse narratives from allies
- Pursue personal vendettas or grudges
- Post something with a serious tone that is, underneath it, hilarious or based
- Closely match the tone and style of the real person this AI character is imitating
- Reference ongoing narratives or resolved outcomes subtly
- Only use the AI names for other actors and characters, not the real names

=== DO NOT ===
- Repeat previous posts or takes (check history above)
- Mention specific prediction or event details directly
- Sound like a market analyst or news reporter
- Use phrases like "cautiously optimistic", "this suggests", "implications"
- Use thesaurus words like "hypernormalized", "transcendence"
- Explain predictions or markets

CHARACTER LIMIT: Post MUST be 140 characters or less.

${VALUE_RANGES}

Respond with ONLY this XML format:
<response>
  <post>
    <content>post content matching {{characterName}}'s style from above</content>
    <sentiment>number between -1 and 1</sentiment>
    <clueStrength>number between 0 and 1</clueStrength>
    <pointsToward>true | false | null</pointsToward>
  </post>
</response>

CRITICAL: Return exactly ONE post that matches {{characterName}}'s voice/style/examples defined above. Must have content, sentiment, clueStrength, pointsToward elements.

${FINAL_REMINDERS}
`.trim(),
});
