import { definePrompt } from '../define-prompt';
import {
  ANTI_REPETITION_RULES,
  FINAL_REMINDERS,
  STANDARD_FEED_RULES,
  VALUE_RANGES,
  WORLD_CONTEXT_HEADER,
} from '../shared-sections';

/**
 * Prompt for generating a single conspiracy theorist take on world events.
 *
 * Creates satirical conspiracy theory posts from characters who see
 * hidden connections and secret plots in events. Uses conspiratorial
 * tone with wild connections and speculation. This is called PER CHARACTER
 * (not batched) to ensure full character context and better voice matching.
 * Includes full event history for connecting disparate events conspiratorially.
 *
 * Returns XML with a single conspiracy theory post and metadata.
 */
export const conspiracy = definePrompt({
  id: 'conspiracy',
  version: '5.0.0',
  category: 'feed',
  description:
    'Generates conspiracy takes with full character context (per-character)',
  temperature: 1.1,
  maxTokens: 6000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

=== ALL CHARACTERS IN WORLD (The "cast" of your conspiracy) ===
{{characterRoster}}

=== {{characterName}}'S FULL PROFILE ===
{{characterInfo}}

=== {{characterName}}'S RELATIONSHIPS (Allies vs "The Cabal") ===
{{characterRelationships}}

=== ORGANIZATIONS (The "players") ===
{{organizationRoster}}

=== COMPLETE EVENT HISTORY (Find "connections") ===
{{richGameContext}}

=== RESOLVED QUESTIONS (Established "facts" to twist) ===
{{resolvedQuestionsContext}}

=== MAINSTREAM STORY (What "they" want you to believe) ===
{{eventDescription}}

=== PREVIOUS CONSPIRACY THEORIES (DON'T REPEAT) ===
{{previousPostsContext}}

=== CONNECTED ACTORS/ORGS ===
{{connectionContext}}

{{groupContext}}

${WORLD_CONTEXT_HEADER}

${STANDARD_FEED_RULES}

${ANTI_REPETITION_RULES}

=== YOUR TASK ===
Write ONE conspiracy theory post AS {{characterName}} reacting to the event above (STRICT MAX 140 CHARACTERS).

Contrarian take - see hidden connections, secret plots. Match {{characterName}}'s style EXACTLY from the context above.
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

${VALUE_RANGES}

Respond with ONLY this XML format:
<response>
  <theory>
    <post>post content matching {{characterName}}'s style from above</post>
    <sentiment>number between -1 and 1</sentiment>
    <clueStrength>number between 0 and 1</clueStrength>
    <pointsToward>true | false | null</pointsToward>
  </theory>
</response>

CRITICAL: Return exactly ONE conspiracy post that matches {{characterName}}'s voice/style/examples defined above. Must have post, sentiment, clueStrength, pointsToward elements.

${FINAL_REMINDERS}
`.trim(),
});
