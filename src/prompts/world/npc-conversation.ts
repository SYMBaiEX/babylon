import { definePrompt } from '../define-prompt';
import { PARODY_NAME_RULES } from '../shared-sections';

/**
 * Prompt for generating brief conversations between NPCs about game events.
 * 
 * Creates natural dialogue between NPCs discussing game events, market
 * movements, or rumors. Captures character voices and relationships while
 * providing world-building context.
 * 
 * Returns XML with NPC conversation.
 */
export const npcConversation = definePrompt({
  id: 'npc-conversation',
  version: '2.0.0',
  category: 'world',
  description: 'Generates brief conversations between NPCs about game events',
  temperature: 0.8,
  maxTokens: 300,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

Generate a brief conversation between NPCs on Day {{day}}.

Context:
- Question: {{question}}
- Real outcome: {{outcome}}
- Participants: {{participants}}
- Recent events: {{recentEvents}}

${PARODY_NAME_RULES}
Use ONLY the exact participant names provided above ({{participants}}).

Generate a natural conversation where:
- Insiders hint at what they know
- Outsiders speculate
- People disagree based on their information
- Keep it brief (2-3 exchanges)

Respond with XML:
<response>
  <conversation>...</conversation>
</response>

No other text.
`.trim()
});
