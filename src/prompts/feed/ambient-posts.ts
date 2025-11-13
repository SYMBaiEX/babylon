import { definePrompt } from '../define-prompt';
import { BABYLON_STYLE_GUIDE } from '../style-guide';

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

${BABYLON_STYLE_GUIDE}

CRITICAL INSTRUCTIONS:
- Each actor's personality MUST be reflected in their post
- Maintain voice consistency - their personality traits should influence their thoughts
- Consider their role, domain expertise, and current mood when writing
- Apply degen style, AI self-awareness, and parody characteristics based on their personality
- NO HASHTAGS OR EMOJIS IN POSTS
- NEVER use real names - ALWAYS use ONLY parody names from World Actors list
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
