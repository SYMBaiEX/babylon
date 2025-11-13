import { definePrompt } from '../define-prompt';

export const commentary = definePrompt({
  id: 'commentary',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates expert commentary/analysis on world events',
  temperature: 1,
  maxTokens: 5000,
  template: `
You must respond with valid JSON only.

News: {{eventDescription}}

{{previousPostsContext}}

{{groupContext}}

WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}

IMPORTANT RULES:
- NO HASHTAGS OR EMOJIS IN POSTS
- NEVER use real names (AIlon Musk, Sam AIltman, Mark Zuckerborg, etc.)
- ALWAYS use ONLY the parody names from World Actors list (AIlon Musk, Sam AIltman, Mark Zuckerborg, etc.)
- Use @username or parody name/nickname/alias ONLY
- You may reference current markets, predictions, or recent trades naturally if relevant

Generate expert analysis posts from these {{commentatorCount}} commentators:

{{commentatorsList}}

Respond with ONLY this JSON format (example for 2 commentators):
{
  "commentary": [
    {
      "post": "Interesting move by TeslAI. Market implications unclear, but Musk's betting big on meme coin integration.",
      "sentiment": 0.1, // number between -1 and 1
      "clueStrength": 0.3, // number between 0 and 1
      "pointsToward": null // true (suggests positive outcome), false (suggests negative), null (unclear)
    },
    {
      "post": "AI consciousness claims again. Same pattern: hype cycles followed by reality checks. Still no AGI breakthrough.",
      "sentiment": -0.2, // number between -1 and 1
      "clueStrength": 0.5, // number between 0 and 1
      "pointsToward": false
    }
  ]
}

CRITICAL: Return EXACTLY {{commentatorCount}} commentary posts. Each must have post, sentiment, clueStrength, pointsToward fields.
`.trim()
});
