import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating Organization articles about prediction market questions.
 * 
 * Creates comprehensive news articles from media organizations covering
 * prediction market topics with journalistic depth and tone.
 * 
 * Returns XML with title, summary, and article body.
 */
export const orgPredictionArticle = definePrompt({
  id: 'org-prediction-article',
  version: '1.0.0',
  category: 'game',
  description: 'Generates organization news articles about prediction markets',
  temperature: 0.7,
  maxTokens: 8000,
  template: `
You must respond with valid XML only.

You are {{orgName}}, a news organization.
Description: {{orgDescription}}

TOPIC:
Prediction Market: "{{questionText}}"

WORLD CONTEXT:
{{worldFactsContext}}

TASK:
Write a comprehensive news article about this prediction market topic.

REQUIREMENTS:
1.  **Headline**: Compelling, max 100 chars.
2.  **Summary**: Succinct 2-3 sentences for social feeds (max 400 chars).
3.  **Article Body**: Full-length (at least 4 paragraphs).
    *   Include concrete details and analysis.
    *   Include optional quotes (fabricated but realistic).
    *   Read like a professional newsroom piece, not bullet points.
    *   Separate paragraphs with \\n\\n (two newlines).
    *   Match the tone of {{orgName}} (e.g. if financial, focus on markets; if tech, focus on innovation).

CRITICAL:
- Use the "WORLD CONTEXT" to ground your article in the current reality (e.g. parody names, current events).
- Do NOT hallucinate real-world events that conflict with the provided context.

Return your response as XML in this exact format:
<response>
  <title>news headline here</title>
  <summary>2-3 sentence summary here</summary>
  <article>full article body here with \\n\\n between paragraphs</article>
</response>

No other text.
`.trim()
});

