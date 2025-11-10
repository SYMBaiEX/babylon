import { definePrompt } from '../define-prompt';

export const questionEvent = definePrompt({
  id: 'question-event',
  version: '1.0.0',
  category: 'game',
  description: 'Generates specific events for prediction market questions',
  temperature: 0.8,
  maxTokens: 500,
  template: `
Generate a SPECIFIC event for this prediction market question:

QUESTION: {{questionText}}
PREDETERMINED OUTCOME: {{outcome}}
DAYS UNTIL RESOLUTION: {{daysLeft}}
URGENCY: {{urgency}}

INVOLVED ACTORS: {{involvedActors}}

REQUIREMENTS:
- Event must be SPECIFIC and OBSERVABLE
- {{urgencyRequirement}}
- {{outcomeGuidance}}
- Use actor names and be dramatic
- One sentence, max 150 characters
- Satirical tone

OUTPUT JSON:
{
  "description": "Your event here",
  "type": "announcement|scandal|deal|conflict|revelation"
}
`.trim()
});

