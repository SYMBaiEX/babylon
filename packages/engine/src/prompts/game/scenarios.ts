import { definePrompt } from '../define-prompt';
import {
  NARRATIVE_CONTINUITY_RULES,
  PARODY_NAME_RULES,
} from '../shared-sections';

/**
 * Prompt for generating 3 satirical scenarios for game setup.
 *
 * Creates dramatic, satirical scenarios involving main actors that
 * serve as the foundation for the game's narrative. Scenarios are
 * grounded in current reality but satirical in nature. Includes
 * full narrative context when continuing an existing game.
 *
 * Returns XML with 3 scenario descriptions.
 */
export const scenarios = definePrompt({
  id: 'scenarios',
  version: '4.0.0',
  category: 'game',
  description: 'Generates 3 satirical scenarios with full character context',
  temperature: 0.8,
  maxTokens: 8000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

=== ALL CHARACTERS IN WORLD ===
{{characterRoster}}

=== DETAILED CHARACTER PROFILES ===
{{detailedCharacterProfiles}}

=== ALL ORGANIZATIONS ===
{{organizationRoster}}

=== WORLD STATE & HISTORY ===
{{richGameContext}}

=== PREVIOUS SCENARIOS (If continuing) ===
{{previousScenarios}}

=== RESOLVED NARRATIVES (Build on these) ===
{{resolvedQuestionsContext}}

=== WORLD FACTS (Established truths) ===
{{worldFactsContext}}

{{worldEventExamples}}

=== SCENARIO GENERATION ===

Create 3 dramatic, satirical scenarios using the main actors below.
USE the character profiles above to make scenarios true to their personalities.

MAIN ACTORS FOR THIS GAME:
{{mainActorsList}}

ORGANIZATIONS AVAILABLE:
{{organizationContext}}

${PARODY_NAME_RULES}

${NARRATIVE_CONTINUITY_RULES}

=== SCENARIO REQUIREMENTS ===

Each scenario must:
1. Involve 2-3 main actors (use exact names from list above)
2. Include affiliated organizations when relevant
3. Be absurd yet plausible
4. Lead to interesting yes/no questions (but DON'T include questions)
5. Involve tech, politics, crypto, or culture wars
6. Have high stakes
7. Be satirical/darkly funny

IF CONTINUING A GAME:
- Review previous scenarios above
- New scenarios should BUILD ON or CONTRAST with previous ones
- Reference resolved question outcomes as established facts
- Don't repeat scenario themes already covered

SCENARIO VARIETY:
Ensure the 3 scenarios cover different themes:
- One could be tech/AI focused
- One could be crypto/finance focused
- One could be politics/culture focused

EXAMPLES (using parody names):
- "AIlon Musk announces plan to upload consciousness to TeslAI, Xitter crashes from traffic"
- "Scam AIltman's AGI becomes self-aware, OpenAGI issues crisis statement"
- "Vitamin Buterin proposes Etherai Foundation runs for President"

Return XML:
<response>
  <scenarios>
    <scenario>
      <id>1</id>
      <title>Catchy dramatic title (max 60 chars)</title>
      <description>2-3 sentence setup of the absurd situation</description>
      <mainActors>
        <actorId>id1</actorId>
        <actorId>id2</actorId>
      </mainActors>
      <involvedOrganizations>
        <orgId>org-id1</orgId>
        <orgId>org-id2</orgId>
      </involvedOrganizations>
      <theme>tech|crypto|politics|culture</theme>
      <stakesLevel>high|catastrophic|world-ending</stakesLevel>
      <buildsOn>previous scenario ID or "new"</buildsOn>
      <distinctFrom>why this is different from previous scenarios</distinctFrom>
    </scenario>
  </scenarios>
</response>

CRITICAL: Do NOT output questions. Only generate the 3 scenarios.
No other text.
`.trim(),
});
