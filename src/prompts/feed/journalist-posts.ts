import { definePrompt } from '../define-prompt';

export const journalistPosts = definePrompt({
  id: 'journalist-posts',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates breaking news posts from journalists covering world events',
  temperature: 0.8,
  maxTokens: 2000,
  template: `
You must respond with valid JSON only.

Event: {{eventDescription}}
Type: {{eventType}}
{{outcomeFrame}}

{{phaseContext}}

{{relationshipContext}}

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

Generate breaking news posts from these {{journalistCount}} journalists:

{{journalistsList}}

Respond with ONLY this JSON format (example for 2 posts):
{
  "posts": [
    {
      "post": "BREAKING: Major development in ongoing story. Sources confirm significant implications for market.",
      "sentiment": 0.2,
      "clueStrength": 0.4,
      "pointsToward": null
    },
    {
      "post": "Exclusive: Industry insiders report unexpected turn of events. Analysts scrambling to assess impact.",
      "sentiment": 0.1,
      "clueStrength": 0.5,
      "pointsToward": true
    }
  ]
}

CRITICAL: Return EXACTLY {{journalistCount}} posts. Each must have post, sentiment, clueStrength, pointsToward fields.
`.trim()
});
