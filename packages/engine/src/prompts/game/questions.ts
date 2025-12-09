import { definePrompt } from '../define-prompt';
import {
  PARODY_NAME_RULES,
  QUESTION_CONTINUITY_RULES,
} from '../shared-sections';

/**
 * Prompt for generating yes/no prediction market questions for each scenario.
 *
 * Creates 5 bettable yes/no questions per scenario that are provable,
 * definable, and resolve by Day 30. Questions must be concrete and
 * observable, avoiding vague emotional states or abstract concepts.
 * Includes full narrative context for question continuity.
 *
 * Returns XML with questions for each scenario.
 */
export const questions = definePrompt({
  id: 'questions',
  version: '4.0.0',
  category: 'game',
  description:
    'Generates yes/no questions with full character and narrative context',
  temperature: 0.7,
  maxTokens: 10000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

=== ALL CHARACTERS IN WORLD ===
{{characterRoster}}

=== DETAILED CHARACTER PROFILES ===
{{detailedCharacterProfiles}}

=== ORGANIZATIONS ===
{{organizationRoster}}

=== COMPLETE NARRATIVE CONTEXT ===
{{richGameContext}}

=== EXISTING QUESTIONS (Active - DON'T DUPLICATE) ===
{{activeQuestionsContext}}

=== RESOLVED QUESTIONS (Build on these outcomes) ===
{{resolvedQuestionsContext}}

=== SCENARIOS ===
{{scenariosList}}

=== ORGANIZATIONS IN PLAY ===
{{organizationContext}}

${PARODY_NAME_RULES}

${QUESTION_CONTINUITY_RULES}

=== QUESTION GENERATION REQUIREMENTS ===

For each scenario, generate 5 yes/no questions that players can bet on.

CRITICAL - DISTINCTNESS CHECK:
Before generating each question, verify it is NOT similar to:
1. Any active question listed above
2. Any resolved question (unless explicitly building on its outcome)
3. Any other question you're generating in this batch

PROVABLE & DEFINABLE:
✓ Clear, observable outcome (announcement, launch, public event, metric)
✓ Specific actors and organizations by parody names
✓ Resolves by Day 30 with concrete evidence
✓ Dramatic, entertaining, and satirical
✓ Real uncertainty (not obvious outcome)

✗ Vague emotional states ("emotions stabilize")
✗ Abstract concepts ("apocalypse" without definition)
✗ Unfalsifiable predictions

EXAMPLES OF DISTINCT QUESTIONS:
Instead of multiple "Will X announce Y?" questions, vary:
- "Will TeslAI's share price exceed $500 before Day 15?"
- "Will OpenAGI's SMH-9000 pass external audit?"
- "Will AIlon Musk and Sam AIltman have public confrontation?"
- "Will MSDNC break exclusive on leaked documents?"
- "Will The Fud intervene in the market?"

BUILDING ON RESOLVED QUESTIONS:
If "Will AIlon announce X?" resolved YES, good follow-ups:
- "Will AIlon's X launch on schedule?"
- "Will competitors respond to X announcement?"
- "Will X face regulatory scrutiny?"

Return XML with UNIQUE, DISTINCT questions:
<response>
  <questions>
    <question>
      <id>1</id>
      <scenario>1</scenario>
      <text>Will [specific, observable event] happen?</text>
      <dramaPotential>8</dramaPotential>
      <uncertainty>7</uncertainty>
      <satiricalValue>9</satiricalValue>
      <observableOutcome>What exact evidence would prove YES</observableOutcome>
      <buildsOn>ID of resolved question this builds on, or "new"</buildsOn>
      <distinctFrom>Why this is different from similar existing questions</distinctFrom>
    </question>
  </questions>
</response>

No other text.
`.trim(),
});
