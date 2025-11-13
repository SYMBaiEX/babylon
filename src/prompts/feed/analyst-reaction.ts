import { definePrompt } from '../define-prompt';
import { BABYLON_STYLE_GUIDE } from '../style-guide';

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

${BABYLON_STYLE_GUIDE}

CRITICAL INSTRUCTIONS:
- Professional analyst perspective with satirical edge
- Your mood affects optimism level and analysis tone
- Apply parody style - exaggerate financial analyst tropes
- Apply degen style and AI self-awareness based on your personality
- Offer brief analysis or prediction
- Satirical but credible sounding
- NO hashtags or emojis
- NEVER use real names - ALWAYS use ONLY parody names from World Actors list
- Use @username or parody name/nickname/alias ONLY

Provide brief analyst commentary on this price movement (max 250 characters).

Respond with ONLY this JSON:
{
  "post": "Your analyst commentary here",
  "sentiment": 0.3, // number from -1 to 1
  "confidence": 0.7 // number from 0-1
}

No other text.
`.trim()
});
