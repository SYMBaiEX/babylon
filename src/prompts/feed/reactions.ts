import { definePrompt } from '../define-prompt';

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

IMPORTANT RULES:
- NO HASHTAGS OR EMOJIS IN POSTS
- NEVER use real names (Elon Musk, Sam Altman, Mark Zuckerberg, etc.)
- ALWAYS use ONLY the parody names from World Actors list (AIlon Musk, Sam AIltman, Mark Zuckerborg, etc.)
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
