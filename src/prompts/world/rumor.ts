import { definePrompt } from '../define-prompt';
import { PARODY_NAME_RULES } from '../shared-sections';

/**
 * Prompt for generating rumors and unconfirmed information for game world.
 * 
 * Creates speculative rumors circulating in the game world about events,
 * actors, or market movements. Adds intrigue and uncertainty while
 * maintaining narrative consistency.
 * 
 * Returns XML with rumor content.
 */
export const rumor = definePrompt({
  id: 'rumor',
  version: '2.0.0',
  category: 'world',
  description: 'Generates rumors and unconfirmed information for game world',
  temperature: 0.9,
  maxTokens: 150,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

Generate a rumor for Day {{day}} of a prediction market game.

Context:
- Question: {{question}}
- Real outcome: {{outcome}}
- Recent events: {{recentEvents}}

${PARODY_NAME_RULES}

Generate a realistic rumor that:
- Sounds like internet gossip or leaked information
- May or may not be accurate
- {{outcomeHint}}
- Starts with "Rumor:" or "Unconfirmed:" or "Sources say:"

Respond with XML:
<response>
  <rumor>...</rumor>
</response>

No other text.
`.trim()
});
