import { definePrompt } from '../define-prompt';
import { BABYLON_STYLE_GUIDE } from '../style-guide';

export const reactions = definePrompt({
  id: 'reactions',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates actor reactions to world events',
  temperature: 1,
  maxTokens: 5000,
  template: `
You must respond with valid JSON only.

Event involving these actors: {{eventDescription}}

{{eventContext}}

{{phaseContext}}

{{relationshipContext}}

{{previousPostsContext}}

WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}

${BABYLON_STYLE_GUIDE}

CRITICAL INSTRUCTIONS:
- Each actor's reaction MUST reflect their personality, role, and relationship to the event
- Their emotional state (mood/luck) influences tone but doesn't override core personality
- Contrarian actors challenge narratives, optimistic actors see positives, etc.
- Apply degen style, AI self-awareness, and parody characteristics based on their personality
- NO HASHTAGS OR EMOJIS IN POSTS
- NEVER use real names - ALWAYS use ONLY parody names from World Actors list
- Use @username or parody name/nickname/alias ONLY
- You may reference current markets, predictions, or recent trades naturally if relevant

Generate reaction posts for each actor:

{{actorsList}}

Respond with ONLY this JSON format (example for 2 reactions):
{
  "reactions": [
    {
      "post": "Finally! Tesla accepting Doge is exactly what crypto needs. The future is here.",
      "sentiment": 0.7,
      "clueStrength": 0.6,
      "pointsToward": true
    },
    {
      "post": "Another GPT consciousness claim? Cool story bro. Wake me when it actually passes a real Turing test.",
      "sentiment": -0.4,
      "clueStrength": 0.3,
      "pointsToward": false
    }
  ]
}

CRITICAL: Return EXACTLY {{actorCount}} reactions. Each must have post, sentiment, clueStrength, pointsToward fields.
`.trim()
});
