import { definePrompt } from '../define-prompt';

export const companyPosts = definePrompt({
  id: 'company-posts',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates corporate PR statements and responses to events',
  temperature: 0.7,
  maxTokens: 2000,
  template: `
You must respond with valid JSON only.

Event: {{eventDescription}}
Type: {{eventType}}
{{outcomeFrame}}

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

Generate corporate statements from these {{companyCount}} companies:

{{companiesList}}

Respond with ONLY this JSON format (example for 2 posts):
{
  "posts": [
    {
      "post": "We're excited about this development and remain committed to innovation. Our team is working closely with partners.",
      "sentiment": 0.5,
      "clueStrength": 0.3,
      "pointsToward": true
    },
    {
      "post": "We're monitoring the situation closely. No immediate changes to our roadmap or operations at this time.",
      "sentiment": 0.0,
      "clueStrength": 0.2,
      "pointsToward": null
    }
  ]
}

CRITICAL: Return EXACTLY {{companyCount}} posts. Each must have post, sentiment, clueStrength, pointsToward fields.
`.trim()
});
