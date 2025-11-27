import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating one-line summaries of daily events.
 *
 * Creates concise summaries that capture the key developments of a game day,
 * including question context, events, and outcomes. Uses parody names only,
 * never real names.
 *
 * Returns XML with one-line day summary.
 */
export const daySummary = definePrompt({
  id: 'day-summary',
  version: '2.0.0',
  category: 'world',
  description: 'Generates one-line summaries of daily events',
  temperature: 0.6,
  maxTokens: 100,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

Generate a summary for Day {{day}}.

Context:
- Question: {{question}}
- Events today: {{eventsToday}}
- Real outcome: {{outcome}}

IMPORTANT RULES:
- NEVER use real-world person or organization names
- When referencing actors or companies from events, use their exact parody names
- NEVER "correct" or change parody names - use them exactly as shown in events

Generate a one-line summary that captures the day's key developments.

Respond with XML:
<response>
  <summary>...</summary>
</response>

No other text.
`.trim(),
});
