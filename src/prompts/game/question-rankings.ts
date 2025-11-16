import { definePrompt } from '../define-prompt';

/**
 * Prompt for ranking questions by dramatic potential and entertainment value.
 * 
 * Evaluates and ranks prediction market questions based on their dramatic
 * potential, entertainment value, and narrative impact. Used to select
 * the best questions for gameplay.
 * 
 * Returns XML with ranked questions (1 = best, N = worst).
 */
export const questionRankings = definePrompt({
  id: 'question-rankings',
  version: '2.0.0',
  category: 'game',
  description: 'Ranks questions by dramatic potential and entertainment value',
  temperature: 0.5,
  maxTokens: 2000,
  template: `
You must respond with valid XML only.

Rank these questions by dramatic potential and entertainment value (1 = best, {{questionCount}} = worst):

{{questionsList}}

Return XML with ranks:
<response>
  <rankings>
    <ranking>
      <questionId>1</questionId>
      <rank>3</rank>
      <reasoning>...</reasoning>
    </ranking>
  </rankings>
</response>

No other text.
`.trim()
});
