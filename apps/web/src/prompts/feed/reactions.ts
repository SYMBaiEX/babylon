import { definePrompt } from '../define-prompt';
import {
  characterVoiceGuidance,
  STANDARD_FEED_RULES,
  VALUE_RANGES,
  WORLD_CONTEXT_HEADER,
} from '../shared-sections';

/**
 * Prompt for generating actor reactions to world events.
 *
 * Creates reaction posts from actors responding to events, announcements,
 * or other content. Captures character-driven responses that reflect
 * personality and relationships.
 *
 * Returns XML with reaction posts and sentiment analysis.
 */
export const reactions = definePrompt({
  id: 'reactions',
  version: '2.0.0',
  category: 'feed',
  description: 'Generates actor reactions to world events',
  temperature: 1,
  maxTokens: 5000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

Event involving these actors: {{eventDescription}}

{{eventContext}}

{{phaseContext}}

{{relationshipContext}}

{{previousPostsContext}}

${WORLD_CONTEXT_HEADER}

${STANDARD_FEED_RULES}

${characterVoiceGuidance('actorsList')}

Generate reaction posts for each actor:

{{actorsList}}

${VALUE_RANGES}

Respond with ONLY this XML format (example for 2 reactions):
<response>
  <reactions>
    <reaction>
      <post>Finally! @ailonmusk and TeslAI accepting Dogecoin is exactly what crypto needs. The "Will TeslAI accept Dogecoin?" prediction is looking strong.</post>
      <sentiment>0.7</sentiment>
      <clueStrength>0.6</clueStrength>
      <pointsToward>true</pointsToward>
    </reaction>
    <reaction>
      <post>Another OpenAGI Cognition-9000 consciousness claim from @samailtman? Cool story bro. Wake me when it actually passes a real Turing test.</post>
      <sentiment>-0.4</sentiment>
      <clueStrength>0.3</clueStrength>
      <pointsToward>false</pointsToward>
    </reaction>
  </reactions>
</response>

CRITICAL: Return EXACTLY {{actorCount}} reactions. Each must have post, sentiment, clueStrength, pointsToward elements.
`.trim(),
});
