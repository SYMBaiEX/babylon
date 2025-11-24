import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating 3 satirical scenarios for game setup.
 * 
 * Creates dramatic, satirical scenarios involving main actors that
 * serve as the foundation for the game's narrative. Scenarios are
 * grounded in current reality but satirical in nature.
 * 
 * Returns XML with 3 scenario descriptions.
 */
export const scenarios = definePrompt({
  id: 'scenarios',
  version: '2.0.0',
  category: 'game',
  description: 'Generates 3 satirical scenarios for the game setup',
  temperature: 0.8,
  maxTokens: 2000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

{{worldEventExamples}}

Create 3 dramatic, satirical scenarios for these main actors:

MAIN ACTORS:
{{mainActorsList}}
{{organizationContext}}

IMPORTANT RULES:
- Use ONLY the exact actor names provided in MAIN ACTORS list above
- NEVER use real-world person or organization names
- NEVER "correct" or change the provided parody names - use them exactly as shown
- Use ONLY the exact organization names provided in ORGANIZATIONS IN PLAY (if any)
- DO NOT generate questions yet - only scenarios

Each scenario should:
- Involve 2-3 of the main actors (use their exact names from the list above)
- Include their affiliated organizations when relevant (use exact organization names)
- Be absurd yet plausible
- Lead to interesting yes/no questions (but do NOT include the questions themselves)
- Involve tech, politics, crypto, or culture wars
- Have high stakes
- Be satirical/darkly funny

Examples (note: these use parody names, NOT real names):
- "Ailon Muskannounces plan to upload consciousness to TeslAI, Xitter crashes from announcement traffic"
- "Scam AIltman's AGI becomes self-aware, OpenLIE issues crisis management statement"
- "Vitamin Uterin proposes Etherai-foundation runs for President, MSDNC breaks exclusive interview"

Return XML:
<response>
  <scenarios>
    <scenario>
      <id>1</id>
      <title>Catchy dramatic title</title>
      <description>2-3 sentence setup of the absurd situation</description>
      <mainActors>
        <actorId>id1</actorId>
        <actorId>id2</actorId>
      </mainActors>
      <involvedOrganizations>
        <orgId>org-id1</orgId>
        <orgId>org-id2</orgId>
      </involvedOrganizations>
      <theme>tech/crypto/politics/culture</theme>
      <stakesLevel>high/catastrophic/world-ending</stakesLevel>
    </scenario>
  </scenarios>
</response>

CRITICAL: Do NOT output a <questions> tag. Do NOT generate questions. Only generate the scenarios.
No other text.
`.trim()
});
