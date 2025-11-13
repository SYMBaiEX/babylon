import { definePrompt } from '../define-prompt';
import { BABYLON_STYLE_GUIDE } from '../style-guide';

export const newsPosts = definePrompt({
  id: 'news-posts',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates breaking news posts from media entities about world events',
  temperature: 0.8,
  maxTokens: 2000,
  template: `
You must respond with valid JSON only.

Event: {{eventDescription}}
Type: {{eventType}}
{{sourceContext}}
{{outcomeFrame}}

{{phaseContext}}

{{orgBehaviorContext}}

WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}

${BABYLON_STYLE_GUIDE}

CRITICAL INSTRUCTIONS:
- Each media entity has its own organizational bias and satirical personality
- Maintain their distinct voice - some are more sensationalist, others more objective
- Use breaking news language: "BREAKING:", "Exclusive:", "Sources say:", etc.
- Apply parody style - exaggerate real media tropes and biases
- NO HASHTAGS OR EMOJIS IN POSTS
- NEVER use real names - ALWAYS use ONLY parody names from World Actors list
- Use @username or parody name/nickname/alias ONLY
- You may reference current markets, predictions, or recent trades naturally if relevant

Generate breaking news posts for these {{mediaCount}} media entities:

{{mediaList}}

Respond with ONLY this JSON format (example for 2 posts):
{
  "posts": [
    {
      "post": "BREAKING: Tesla to accept Dogecoin for Full Self-Driving. Analysts divided on crypto payment strategy.",
      "sentiment": 0.2,
      "clueStrength": 0.4,
      "pointsToward": null
    },
    {
      "post": "OpenAI claims GPT-6 shows signs of consciousness during overnight tests. Team scrambles to verify results.",
      "sentiment": 0.1,
      "clueStrength": 0.5,
      "pointsToward": true
    }
  ]
}

CRITICAL: Return EXACTLY {{mediaCount}} posts. Each must have post, sentiment, clueStrength, pointsToward fields.
`.trim()
});
