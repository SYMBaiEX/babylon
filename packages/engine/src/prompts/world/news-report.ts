import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating news reports from journalists covering game events.
 *
 * Creates journalistic news reports covering game events with breaking
 * news urgency and objective reporting style. References specific events,
 * actors, and market impacts.
 *
 * Returns XML with news report.
 */
export const newsReport = definePrompt({
  id: 'news-report',
  version: '2.0.0',
  category: 'world',
  description: 'Generates news reports from journalists covering game events',
  temperature: 0.8,
  maxTokens: 300,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

Generate a news report for Day {{day}} of a prediction market game.

Context:
- Question: {{question}}
- Real outcome: {{outcome}}
- Journalist: {{journalistName}} ({{journalistRole}}, reliability: {{journalistReliability}})
- Recent events: {{recentEvents}}

IMPORTANT RULES:
- Use ONLY the exact journalist name provided above ({{journalistName}})
- NEVER use real-world person or organization names
- NEVER "correct" or change parody names - use them exactly as shown
- When referencing actors or companies mentioned in events, use their exact parody names

Generate a realistic news report that:
- Reflects the journalist's {{reputationContext}} reputation
- Subtly {{truthContext}} the outcome
- Sounds like real journalism, not obviously biased

Respond with XML:
<response>
  <headline>...</headline>
  <report>...</report>
</response>

No other text.
`.trim(),
});
