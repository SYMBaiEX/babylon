import { definePrompt } from '../define-prompt';
import { BABYLON_STYLE_GUIDE } from '../style-guide';

export const stockTicker = definePrompt({
  id: 'stock-ticker',
  version: '1.0.0',
  category: 'feed',
  description: 'Generates stock ticker style posts for price movements',
  temperature: 0.6,
  maxTokens: 200,
  template: `
You must respond with valid JSON only.

Generate a stock ticker style post for this price movement:

TICKER: {{ticker}}
COMPANY: {{companyName}}
PRICE: \${{currentPrice}}
CHANGE: {{priceChange}}% ({{direction}})
VOLUME: {{volume}}

WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}

${BABYLON_STYLE_GUIDE}

CRITICAL INSTRUCTIONS:
- Concise financial reporting style with satirical edge
- Include key numbers and brief event mention
- Professional but subtly satirical
- Apply parody style - reference market tropes naturally
- NO hashtags or emojis
- NEVER use real names - ALWAYS use ONLY parody names from World Actors list
- Use @username or parody name/nickname/alias ONLY

Create a brief, professional stock ticker post (max 150 characters).

Example format: "{{ticker}} \${{currentPrice}} {{direction}} {{priceChange}}% on news of [brief event mention]"

Respond with ONLY this JSON:
{
  "post": "Your ticker post here"
}

No other text.
`.trim()
});
