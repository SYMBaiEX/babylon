import { definePrompt } from '../define-prompt';
import { BABYLON_STYLE_GUIDE } from '../style-guide';

export const companyPost = definePrompt({
  id: 'company-post',
  version: '1.0.0',
  category: 'feed',
  description: 'Single company PR statement or announcement',
  temperature: 0.9,
  maxTokens: 5000,
  template: `
You must respond with valid JSON only.

You are the PR team for {{companyName}}.
About: {{companyDescription}}
{{ceoRepresentative}}

Event: {{eventDescription}} ({{eventType}})

WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}

${BABYLON_STYLE_GUIDE}

CRITICAL INSTRUCTIONS:
- This is a {{postType}} post
- Maintain the company's satirical corporate personality and brand voice
- Apply parody style - exaggerate corporate PR tropes and language
- {{outcomeFrame}}
- NO hashtags or emojis
- NEVER use real names - ALWAYS use ONLY parody names from World Actors list
- Use @username or parody name/nickname/alias ONLY

Write ONE corporate post (max 140 chars).
Professional, on-brand corporate speak with satirical edge.

Respond with ONLY this JSON format:
{
  "post": "your corporate statement here",
  "sentiment": 0.5,
  "clueStrength": 0.3,
  "pointsToward": true
}

sentiment: -1 (very negative) to 1 (very positive)
clueStrength: 0 (no info) to 1 (smoking gun)
pointsToward: true/false/null (does this help guilty party?)
`.trim()
});
