import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating Organization social media posts about prediction market questions.
 * 
 * Creates short, news-style social media updates from organizations.
 * 
 * Returns XML with post content.
 */
export const orgPredictionPost = definePrompt({
  id: 'org-prediction-post',
  version: '1.0.0',
  category: 'game',
  description: 'Generates organization social media posts about prediction markets',
  temperature: 0.9,
  maxTokens: 1000,
  template: `
You must respond with valid XML only.

You are {{orgName}}, a news organization.
Description: {{orgDescription}}

PREDICTION MARKET QUESTION:
"{{questionText}}"

WORLD CONTEXT:
{{worldFactsContext}}

TASK:
Post a brief social media update (max 200 chars) about this prediction market question.

GUIDELINES:
- Be informative and engaging (news-style).
- Examples: "Breaking: New developments in...", "Just released: Analysis on...", "What we're watching...".
- Match the professional (or sensationalist) tone of {{orgName}}.
- Use the provided world context for accuracy.

Return your response as XML in this exact format:
<response>
  <post>your brief post content here</post>
</response>

No other text.
`.trim()
});

