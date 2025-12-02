import { definePrompt } from '../define-prompt';

/**
 * Prompt for validating question resolution outcomes.
 *
 * Ensures that a question outcome matches the available evidence and
 * generates a definitive resolution event description.
 */
export const questionResolutionValidation = definePrompt({
  id: 'question-resolution-validation',
  version: '1.0.0',
  category: 'game',
  description: 'Validates resolution outcome and generates proof event',
  temperature: 0.7,
  maxTokens: 5000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

Question: {{questionText}}
Outcome: {{outcome}}
History: {{eventHistory}}
Context: {{contextInfo}}

Generate a definitive resolution event proving the {{outcome}} outcome.
{{outcomeContext}}
One sentence, max 150 chars, concrete and observable.

Respond with ONLY this XML format:
<response>
  <event>your resolution event</event>
  <type>announcement</type>
</response>

No other text.
`.trim(),
});
