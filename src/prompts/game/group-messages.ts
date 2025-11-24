import { definePrompt } from '../define-prompt';
import { PARODY_NAME_RULES, characterVoiceGuidance } from '../shared-sections';

/**
 * Prompt for generating private group chat messages for the day.
 * 
 * Creates batch private group chat messages containing insider information,
 * strategic discussions, and confidential revelations. Messages provide
 * exclusive context to group members that affects trading decisions.
 * 
 * Returns XML with multiple group messages.
 */
export const groupMessages = definePrompt({
  id: 'group-messages',
  version: '2.0.0',
  category: 'game',
  description: 'Generates private group chat messages for the day',
  temperature: 1,
  maxTokens: 5000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

{{fullContext}}{{scenarioContext}}{{questionContext}}

━━━ PRIVATE GROUP CHATS FOR DAY {{day}} ━━━

This is PRIVATE. Members say things here they would NEVER say publicly:
- Vulnerabilities, fears, doubts
- Real insider knowledge about their companies
- Strategic planning and market manipulation
- Gossip about people outside the group
- Honest reactions vs their public persona
- SPECIFIC trading positions and intentions
- Coordination of attacks on rivals
- Insider data (revenues, deals, failures)
- What they're REALLY doing vs what they say publicly

${PARODY_NAME_RULES}

${characterVoiceGuidance('groupsList')}

Today's events: {{eventsList}}
{{recentEventContext}}

Generate {{groupCount}} private group conversations:

{{groupsList}}

Respond with ONLY this XML:
<response>
  <groups>
    <group>
      <groupId>group-id</groupId>
      <messages>
        <message>
          <actorId>actor-id</actorId>
          <content>private message here</content>
        </message>
      </messages>
    </group>
  </groups>
</response>

Return {{groupCount}} groups in the array. No other text.
`.trim()
});
