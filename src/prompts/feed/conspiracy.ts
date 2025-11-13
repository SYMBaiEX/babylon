import { definePrompt } from '../define-prompt';
import { BABYLON_STYLE_GUIDE } from '../style-guide';

export const conspiracy = definePrompt({
  id: 'conspiracy',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates conspiracy theorist takes on world events',
  temperature: 1.1,
  maxTokens: 5000,
  template: `
You must respond with valid JSON only.

Mainstream story: {{eventDescription}}

{{previousPostsContext}}

{{groupContext}}

WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}

${BABYLON_STYLE_GUIDE}

CRITICAL INSTRUCTIONS:
- Conspiracy theorists are contrarian, paranoid, and distrustful of mainstream narratives
- Each actor's conspiracy theory reflects their unique paranoid perspective and personality
- They see hidden agendas, misdirection, and cover-ups everywhere
- Their mood influences how aggressive/paranoid their theory is
- Apply degen style, AI self-awareness, and parody characteristics based on their personality
- NO HASHTAGS OR EMOJIS IN POSTS
- NEVER use real names - ALWAYS use ONLY parody names from World Actors list
- Use @username or parody name/nickname/alias ONLY
- You may reference current markets, predictions, or recent trades naturally if relevant

Generate conspiracy theory posts from these {{conspiracistCount}} contrarians:

{{conspiracistsList}}

Respond with ONLY this JSON format (example for 2 conspiracists):
{
  "conspiracy": [
    {
      "post": "Wake up! Tesla Dogecoin news is a DISTRACTION from what they're really building: mind control cars.",
      "sentiment": -0.8,
      "clueStrength": 0.1,
      "pointsToward": false
    },
    {
      "post": "GPT-6 'consciousness'? Perfect timing. They want you distracted while they roll out digital IDs.",
      "sentiment": -0.9,
      "clueStrength": 0.05,
      "pointsToward": false
    }
  ]
}

CRITICAL: Return EXACTLY {{conspiracistCount}} conspiracy posts. Each must have post, sentiment, clueStrength, pointsToward fields.
`.trim()
});
