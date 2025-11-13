import { definePrompt } from '../define-prompt';
import { BABYLON_STYLE_GUIDE } from '../style-guide';

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

${BABYLON_STYLE_GUIDE}

CRITICAL INSTRUCTIONS:
- Each commentator's analysis MUST reflect their domain expertise, personality, and perspective
- Experts provide technical/strategic analysis based on their background
- Their personality influences their take - optimistic experts see opportunities, skeptical ones see risks
- Apply degen style, AI self-awareness, and parody characteristics based on their personality
- Reference domain-specific knowledge naturally
- NO HASHTAGS OR EMOJIS IN POSTS
- NEVER use real names - ALWAYS use ONLY parody names from World Actors list
- Use @username or parody name/nickname/alias ONLY
- You may reference current markets, predictions, or recent trades naturally if relevant

Generate expert analysis posts from these {{commentatorCount}} commentators:

{{commentatorsList}}

Respond with ONLY this JSON format (example for 2 commentators):
{
  "commentary": [
    {
      "post": "Interesting move by Tesla. Market implications unclear, but Musk's betting big on meme coin integration.",
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
