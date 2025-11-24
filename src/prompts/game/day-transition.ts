import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating day transition summary events.
 * 
 * Creates brief transition events marking the start of a new day,
 * summarizing what happened previously and setting up the new day's
 * context. Used for narrative continuity between game days.
 * 
 * Returns XML with day transition summary.
 */
export const dayTransition = definePrompt({
  id: 'day-transition',
  version: '2.0.0',
  category: 'game',
  description: 'Generates day transition summary events',
  temperature: 0.7,
  maxTokens: 500,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

Generate a brief transition event marking the start of a new day.

DAY: {{day}} of 30
PHASE: {{phaseName}}
{{phaseContext}}

YESTERDAY'S KEY EVENTS:
{{previousDayEvents}}

ACTIVE QUESTIONS:
{{activeQuestions}}

KEY ACTORS:
{{keyActors}}

Generate a brief "day {{day}} begins" style event that:
- Acknowledges we're moving to a new day
- Can reference yesterday's drama if relevant
- Sets tone for today based on phase
- Max 200 characters
- Satirical news headline style

Respond with ONLY this XML:
<response>
  <event>Day {{day}} transition event</event>
  <type>day-transition</type>
  <tone>anticipatory</tone>
</response>

No other text.
`.trim()
});
