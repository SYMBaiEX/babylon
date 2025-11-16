import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating definitive resolution events proving question outcomes.
 * 
 * Creates clear, definitive events that prove whether a prediction market
 * question resolved as YES or NO. Events must be unambiguous and provide
 * clear evidence of the outcome.
 * 
 * Returns XML with resolution event description.
 */
export const resolutionEvent = definePrompt({
  id: 'resolution-event',
  version: '2.0.0',
  category: 'game',
  description: 'Generates definitive resolution events proving question outcomes',
  temperature: 0.7,
  maxTokens: 5000,
  template: `
You must respond with valid XML only.

Question: {{questionText}}
Outcome: {{outcome}}
History: {{eventHistory}}

Generate a definitive resolution event proving the {{outcome}} outcome.
{{outcomeContext}}
One sentence, max 150 chars, concrete and observable.

Respond with ONLY this XML format:
<response>
  <event>your resolution event</event>
  <type>announcement</type>
</response>

No other text.
`.trim()
});
