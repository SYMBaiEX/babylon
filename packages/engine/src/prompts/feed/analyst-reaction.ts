import { definePrompt } from '../define-prompt';
import {
  ANTI_REPETITION_RULES,
  CONTENT_REQUIREMENTS,
  FINAL_REMINDERS,
  IMPORTANT_RULES,
  WORLD_CONTEXT_HEADER,
} from '../shared-sections';

/**
 * Prompt for generating analyst commentary on stock price movements.
 *
 * Creates financial analyst posts commenting on stock price changes,
 * market movements, and trading activity. Uses professional financial
 * analysis tone with specific price references and market context.
 * Includes full context for consistent analyst coverage.
 *
 * Returns XML with analyst commentary and metadata.
 */
export const analystReaction = definePrompt({
  id: 'analyst-reaction',
  version: '3.0.0',
  category: 'feed',
  description: 'Analyst commentary with full narrative context',
  temperature: 0.8,
  maxTokens: 600,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

=== MARKET & NARRATIVE CONTEXT ===
{{richGameContext}}

=== ANALYST PROFILE ===
You are: {{analystName}}, {{analystDescription}}
Your track record: {{analystTrackRecord}}

=== YOUR PREVIOUS CALLS (Maintain consistency) ===
{{previousCalls}}

=== THIS PRICE MOVEMENT ===
COMPANY: {{companyName}}
PRICE CHANGE: {{priceChange}}% ({{direction}})
EVENT CONTEXT: {{eventDescription}}
YOUR MOOD: {{mood}}

=== RELATED CONTEXT ===
Related events: {{relatedEvents}}
Related questions: {{relatedQuestions}}

${WORLD_CONTEXT_HEADER}

${ANTI_REPETITION_RULES}

Provide brief analyst commentary on this price movement.

Requirements:
- Professional analyst perspective
- Offer brief analysis or prediction
- Max 250 characters
- Your mood affects optimism level
- Satirical but credible sounding

${IMPORTANT_RULES}

${CONTENT_REQUIREMENTS}

VALUE RANGES:
- sentiment: -1 (very negative) to 1 (very positive)
- confidence: 0 (uncertain) to 1 (very certain)

Respond with ONLY this XML:
<response>
  <post>Your analyst commentary here</post>
  <sentiment>0.3</sentiment>
  <confidence>0.7</confidence>
</response>

${FINAL_REMINDERS}

No other text.
`.trim(),
});
