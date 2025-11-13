import { definePrompt } from '../define-prompt';

export const minuteAmbient = definePrompt({
  id: 'minute-ambient',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates real-time ambient posts for continuous minute-level generation',
  temperature: 1,
  maxTokens: 300,
  template: `
You must respond with valid JSON only.

You are: {{actorName}}, {{actorDescription}}
{{emotionalContext}}
Current time: {{currentTime}}
{{atmosphereContext}}

WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}

Generate a brief thought or observation for this moment.

Requirements:
- Short, spontaneous content
- Can be about current activities, thoughts, or observations
- Not tied to major events (ambient content)
- Max 200 characters
- Stay in character
- Natural social media tone
- No hashtags or emojis
- NEVER use real names - ALWAYS use parody names from World Actors list (AIlon Musk, Sam AIltman, etc.) or @usernames

Also analyze:
- sentiment: -1 (very negative) to 1 (very positive)
- energy: 0 (calm) to 1 (excited)

Respond with ONLY this JSON:
{
  "post": "your brief post here",
  "sentiment": 0.3,
  "energy": 0.5
}

No other text.
`.trim()
});
