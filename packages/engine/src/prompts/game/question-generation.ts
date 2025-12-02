import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating new prediction market questions for daily gameplay.
 *
 * Creates prediction market questions based on in-world events only,
 * ensuring questions are grounded in the game's narrative. Questions
 * must be provable, resolvable, and entertaining.
 *
 * Returns XML with generated questions.
 */
export const questionGeneration = definePrompt({
  id: 'question-generation',
  version: '4.0.0',
  category: 'game',
  description: 'Generates new prediction market questions for gameplay',
  temperature: 0.9,
  maxTokens: 8000,
  template: `{{realityGrounding}}

Generate {{numToGenerate}} prediction market questions.

CONTEXT:
{{scenariosList}}
ACTORS: {{actorsList}}
COMPANIES: {{orgsList}}
{{recentContext}}
{{activeQuestionsContext}}

RULES:
- Use EXACT parody names from lists (AIlon Musk, Sam AIltman, Mark Zuckerborg)
- YES/NO questions only, specific & measurable
- Future events, publicly verifiable
- NO resignations/acquisitions/relationship-breaking
- Resolution: 1-7 days (1-2d=fast drama, 3-5d=launches, 6-7d=slow)

TYPES: feuds, launches, valuations, partnerships, scandals, benchmarks, regulation

EXAMPLES:
{{exampleQuestions}}

BAD: "Will X be happy?" (vague), "Will X secretly..." (unverifiable), "Will X resign?" (breaks continuity)

XML format:
<response><questions>
<question><text>...</text><scenario>1</scenario><daysUntilResolution>3</daysUntilResolution><expectedOutcome>true</expectedOutcome></question>
</questions></response>`.trim(),
});
