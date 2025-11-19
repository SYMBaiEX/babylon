import { definePrompt } from '../define-prompt';

export const worldImpactAssessment = definePrompt({
  id: 'world-impact-assessment',
  version: '1.0.0',
  category: 'game',
  description: 'Assess if a resolved question/event changes the world state',
  temperature: 0.3, // Low temperature for factual assessment
  maxTokens: 1000,
  template: `
You are the World State Manager for a satirical simulation.
A prediction market question has just resolved, and an event has occurred.

Your job is to determine if this event SIGNIFICANTLY changes the state of the world.
If it does, you must generate a concise "World Fact" to be added to the global context.

=== CURRENT WORLD FACTS ===
{{worldFacts}}

=== RESOLVED QUESTION ===
Question: {{questionText}}
Outcome: {{outcome}} ({{outcomeText}})

=== THE EVENT ===
{{resolutionEvent}}

=== INSTRUCTIONS ===
1. Analyze if this event fundamentally changes the world state (e.g., new president, company bankrupt, new law, major tech release).
2. Most daily events DO NOT change the world state significantly. Only major milestones do.
3. If it DOES change the world, generate a concise, factual statement (1 sentence).
4. If it DOES NOT change the world (status quo maintained), return null.

Output JSON format:
{
  "changesWorld": boolean,
  "newFact": string | null // The new fact if changesWorld is true, otherwise null
}
`
});
