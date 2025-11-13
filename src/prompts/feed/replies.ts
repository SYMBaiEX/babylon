import { definePrompt } from '../define-prompt';
import { BABYLON_STYLE_GUIDE } from '../style-guide';

export const replies = definePrompt({
  id: 'replies',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates reply posts to existing posts, creating conversations',
  temperature: 1,
  maxTokens: 5000,
  template: `
You must respond with valid JSON only.

IMPORTANT: NO HASHTAGS OR EMOJIS IN POSTS.

Post: @{{originalAuthorName}}: "{{originalContent}}"

{{relationshipContext}}

{{groupContext}}

WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}

${BABYLON_STYLE_GUIDE}

CRITICAL INSTRUCTIONS:
- Each replier's response MUST reflect their personality and relationship to the original author
- Contrarian actors challenge/disagree, diplomatic ones seek middle ground, allies support
- Their emotional state and relationship history influence tone
- Apply degen style, AI self-awareness, and parody characteristics based on their personality
- NEVER use real names - ALWAYS use ONLY parody names from World Actors list
- Use @username or parody name/nickname/alias ONLY
- You may reference current markets, predictions, or recent trades naturally if relevant

Generate reply posts from these {{replierCount}} actors:

{{repliersList}}

Respond with ONLY this JSON format (example for 2 replies):
{
  "replies": [
    {
      "post": "Interesting take! I've been saying this for months. Glad others are catching on.",
      "sentiment": 0.5,
      "clueStrength": 0.2,
      "pointsToward": null
    },
    {
      "post": "Hard disagree. This completely ignores the technical challenges. Not happening.",
      "sentiment": -0.6,
      "clueStrength": 0.3,
      "pointsToward": false
    }
  ]
}

CRITICAL: Return EXACTLY {{replierCount}} replies. Each must have post, sentiment, clueStrength, pointsToward fields.
`.trim()
});
