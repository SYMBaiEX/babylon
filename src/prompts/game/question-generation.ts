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
  version: '3.0.0',
  category: 'game',
  description: 'Generates new prediction market questions for daily gameplay with in-world events only',
  temperature: 0.9,
  maxTokens: 8000,
  template: `
You must respond with valid XML only.

You are generating prediction market questions for a satirical game.

{{realityGrounding}}

CONTEXT:
{{scenariosList}}

KEY ACTORS:
{{actorsList}}

KEY COMPANIES:
{{orgsList}}

{{recentContext}}
{{activeQuestionsContext}}

TASK:
Generate {{numToGenerate}} NEW prediction market questions that:

IMPORTANT RULES:
- Use ONLY the exact actor names from KEY ACTORS list above
- Use ONLY the exact company names from KEY COMPANIES list above
- NEVER use real-world person or organization names
- ALWAYS use the parody names of the characters and companies (AIlon Musk, Sam AIltman, Mark Zuckerborg, Vitalik ButerAIn, etc.)
- NEVER "correct" or change parody names - use them exactly as shown in the lists
- Reference actors and companies by their exact names from the provided lists

REQUIREMENTS:
✅ Must be about FUTURE events (not past events)
✅ Must be clear YES/NO questions with unambiguous resolution criteria
✅ Must be specific and measurable (include dates, numbers, or clear outcomes)
✅ Must be satirical and entertaining (exaggerated tech-bro drama)
✅ Should involve the main actors or companies from the lists above
✅ Should build on recent events and ongoing storylines (if any)
✅ Should NOT duplicate existing active questions
✅ Can be about: product launches, public feuds, tech demos, partnerships, scandals, market activity

❌ AVOID vague questions like "Will [ACTOR] be successful?" (not measurable)
❌ AVOID questions that can't be verified like "Will [ACTOR] secretly do X?" (unverifiable)
✅ PREFER specific, public, verifiable outcomes with clear resolution

QUESTION TYPES (in-world events only):

1️⃣ Public Drama & Social Media Feuds
2️⃣ Product & Feature Launches
3️⃣ Company Valuations & In-Game Trading
4️⃣ Partnerships & Collaborations
5️⃣ Scandals & Investigations (NPCs keep their jobs!)
6️⃣ Technical Achievements & Benchmarks
7️⃣ Policy & Regulation

EXAMPLES OF GOOD QUESTIONS:
{{exampleQuestions}}

BAD QUESTION EXAMPLES:
❌ "Will AIlon Musk be happy?" (vague, not measurable)
❌ "Will OpenAGI secretly develop AGI?" (can't verify secret actions)
❌ "Will Sam AIltman resign from OpenAGI?" (breaks character continuity!)
❌ "Will TeslAI be acquired by MetAI?" (forces company changes!)

CRITICAL: All questions must allow NPCs to maintain their current roles and company affiliations. NO forced resignations, acquisitions, or relationship-breaking events.

RESOLUTION TIME:
Each question should resolve between 1-7 days from now:
- 1-2 days: Fast-moving drama (feuds, announcements)
- 3-5 days: Medium developments (product launches, investigations)
- 6-7 days: Slower outcomes (market movements, long-term deals)

OUTPUT FORMAT:
Respond with ONLY this XML structure:
<response>
  <questions>
    <question>
      <text>Will Mark Zuckerborg demo MetAI's new VR legs by Friday?</text>
      <scenario>1</scenario>
      <daysUntilResolution>3</daysUntilResolution>
      <expectedOutcome>true</expectedOutcome>
    </question>
    <question>
      <text>Will AIlon Musk publicly challenge Sam AIltman to a coding duel?</text>
      <scenario>2</scenario>
      <daysUntilResolution>2</daysUntilResolution>
      <expectedOutcome>false</expectedOutcome>
    </question>
  </questions>
</response>

FINAL REMINDERS:
- Use EXACT parody names from KEY ACTORS and KEY COMPANIES lists above
- Make questions specific, measurable, and verifiable
- Keep NPCs in their current roles (no resignations/acquisitions)
- Focus on in-world game events and satirical tech drama
- Include clear timeframes (by Friday, this week, by month-end, etc.)

Generate {{numToGenerate}} questions now.
No other text.
`.trim()
});
