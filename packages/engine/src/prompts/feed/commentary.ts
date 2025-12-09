import { definePrompt } from '../define-prompt';
import {
  ANTI_REPETITION_RULES,
  FINAL_REMINDERS,
  STANDARD_FEED_RULES,
  VALUE_RANGES,
  WORLD_CONTEXT_HEADER,
} from '../shared-sections';

/**
 * Prompt for generating a single character's reaction to world events.
 *
 * Creates in-character posts where NPCs react to news and events
 * in their unique voices - NOT as market analysts or news reporters.
 * Each character should sound immediately recognizable by voice alone.
 * Includes full narrative context for connected, evolving reactions.
 *
 * This is called PER CHARACTER (not batched) to ensure full character context
 * and better voice matching.
 *
 * Returns XML with a single character post and metadata.
 */
export const commentary = definePrompt({
  id: 'commentary',
  version: '6.0.0',
  category: 'feed',
  description:
    'Generates in-character reaction with full character context (per-character)',
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

=== EVENT HISTORY ===
{{eventTimeline}}

=== RESOLVED QUESTIONS ===
{{resolvedQuestionsContext}}

=== THE EVENT TO REACT TO ===
{{eventDescription}}

Event context:
- Related questions: {{relatedQuestions}}
- Involved actors: {{involvedActors}}
- Storyline: {{relatedNarrative}}

=== {{characterName}}'S POST HISTORY (DON'T REPEAT TAKES) ===
{{previousPostsContext}}

=== {{characterName}}'S RELATIONSHIP TO THIS EVENT ===
{{characterEventRelation}}

{{groupContext}}

${WORLD_CONTEXT_HEADER}

${STANDARD_FEED_RULES}

${ANTI_REPETITION_RULES}

=== YOUR TASK ===
Write ONE post AS {{characterName}} reacting to the event above (STRICT MAX 140 CHARACTERS).

MATCH {{characterName}}'s style EXACTLY from the context above.
A reader should identify WHO wrote this post without seeing the author name.

NARRATIVE AWARENESS:
- Consider {{characterName}}'s previous takes on related topics
- Reference their ongoing storylines if relevant
- Show character evolution (don't just repeat old positions)
- React in a way consistent with their relationships

=== DO ===
- Subtweet rivals or endorse narratives from allies
- Pursue personal vendettas or grudges
- Post something with a serious tone that is, underneath it, hilarious or based
- Closely match the tone and style of the real person this AI character is imitating
- Show how this event affects their ongoing concerns
- Only use the AI names for other actors and characters, not the real names

=== DO NOT ===
- Repeat previous takes (check history above)
- Mention specific prediction or event details directly
- Sound like a market analyst or news reporter
- Use phrases like "cautiously optimistic", "this suggests", "implications"
- Use thesaurus words like "hypernormalized", "transcendence"
- Explain predictions or markets

CHARACTER LIMIT: Post MUST be 140 characters or less.

${VALUE_RANGES}

Respond with ONLY this XML format:
<response>
  <comment>
    <post>post content matching {{characterName}}'s style from above</post>
    <sentiment>number between -1 and 1</sentiment>
    <clueStrength>number between 0 and 1</clueStrength>
    <pointsToward>true | false | null</pointsToward>
  </comment>
</response>

CRITICAL: Return exactly ONE post that matches {{characterName}}'s voice/style/examples defined above. Must have post, sentiment, clueStrength, pointsToward elements.

${FINAL_REMINDERS}
`.trim(),
});
