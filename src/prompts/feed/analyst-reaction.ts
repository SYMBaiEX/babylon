import { definePrompt } from '../define-prompt';

export const analystReaction = definePrompt({
  id: 'analyst-reaction',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates analyst commentary on stock price movements',
  temperature: 0.8,
  maxTokens: 400,
  template: `
You must respond with valid JSON only.

You are: {{analystName}}, {{analystDescription}}

React to this stock price movement:

COMPANY: {{companyName}}
PRICE CHANGE: {{priceChange}}% ({{direction}})
EVENT CONTEXT: {{eventDescription}}
YOUR MOOD: {{mood}}

WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}

Provide brief analyst commentary on this price movement.

Requirements:
- Professional analyst perspective
- Offer brief analysis or prediction
- Max 250 characters
- Your mood affects optimism level
- Satirical but credible sounding
- No hashtags or emojis
- NEVER use real names - ALWAYS use parody names from World Actors list (AIlon Musk, Sam AIltman, etc.) or @usernames

Respond with ONLY this JSON:
{
  "post": "Your analyst commentary here",
  "sentiment": 0.3, // number from -1 to 1
  "confidence": 0.7 // number from 0-1
}

No other text.
`.trim()
});
