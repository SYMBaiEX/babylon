import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating baseline news articles.
 * 
 * Creates general news articles about broad topics (markets, tech, etc.)
 * when no specific events are occurring.
 * 
 * Returns XML with title, summary, and article body.
 */
export const baselineArticle = definePrompt({
  id: 'baseline-article',
  version: '1.0.0',
  category: 'game',
  description: 'Generates baseline news articles about general topics',
  temperature: 0.7,
  maxTokens: 8000,
  template: `
You must respond with valid XML only.

You are {{orgName}}, a news organization.
Description: {{orgDescription}}

TOPIC:
{{topic}}

TASK:
Write a detailed news article about this topic.

REQUIREMENTS:
1.  **Headline**: Compelling, max 100 chars.
2.  **Summary**: Succinct 2-3 sentences for article listing (max 400 chars).
3.  **Article Body**: Full-length (at least 4 paragraphs).
    *   Clear context, quotes, or sourced details (fabricated but realistic).
    *   Professional newsroom tone.
    *   Match the tone of {{orgName}}.
    *   Separate paragraphs with \\n\\n (two newlines).

Return your response as XML in this exact format:
<response>
  <title>compelling headline here</title>
  <summary>2-3 sentence summary here</summary>
  <article>full article body here with \\n\\n between paragraphs</article>
</response>

No other text.
`.trim()
});

