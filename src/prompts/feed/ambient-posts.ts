import { definePrompt } from '../define-prompt';

export const ambientPosts = definePrompt({
  id: 'ambient-posts',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates organic ambient posts from actors not directly involved in events',
  temperature: 1.1,
  maxTokens: 5000,
  template: `
You must respond with valid JSON only.

Day {{day}}/30
{{progressContext}}
{{atmosphereContext}}

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

Generate general thoughts posts for these {{actorCount}} actors:

{{actorsList}}

Respond with ONLY this JSON format (example for 2 posts):
{
  "posts": [
    {
      "post": "Been thinking about the future of payments. Crypto integration might be the key. Time will tell.",
      "sentiment": 0.2, // number between 0 and 1
      "clueStrength": 0.1, // number between 0 and 1
      "pointsToward": null
    },
    {
      "post": "AI progress moves fast. Maybe too fast? Hard to say where we'll be in a year.",
      "sentiment": -0.1,// number between -1 and 1
      "clueStrength": 0.05, // number between 0 and 1
      "pointsToward": null
    }
  ]
}

CRITICAL: Return EXACTLY {{actorCount}} posts. Each must have post, sentiment, clueStrength, pointsToward fields.
`.trim()
});
