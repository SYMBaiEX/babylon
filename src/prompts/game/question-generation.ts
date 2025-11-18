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
- NEVER use real names (Elon Musk, Sam Altman, Mark Zuckerberg, Vitalik Buterin, etc.)
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

CRITICAL - Reality Grounding:
❌ NEVER ask about prices/events that already happened (e.g., "Will BTC hit $35K?" when it's at $95K)
❌ NEVER use outdated tech/products (e.g., "Will iPhone 14 launch?" when iPhone 17 is current)
✅ Use current political context (Trump is president in 2025, not Biden)
✅ Reference current AI models (GPT-5.1, Claude 4.5, not GPT-4) or even futuristic ones
✅ Base questions on actual 2025 reality from the grounding context above, or avoid it and stick to the game world

🚨 ABSOLUTELY FORBIDDEN QUESTION TOPICS 🚨
❌ Real-world cryptocurrency prices (Bitcoin, Ethereum, Solana, Dogecoin, etc.) - TOO VOLATILE & BORING
❌ Real-world currency exchange rates (USD, EUR, etc.) - NOT INTERESTING
❌ Simple stock price movements - FOCUS ON EVENTS INSTEAD
❌ Weather predictions - NOT RELEVANT
These topics make BAD prediction questions - they're boring, unpredictable, and don't tell a story.

✅ INSTEAD FOCUS ON:
- Company announcements and product launches (in-game companies only)
- Regulatory decisions and policy changes (in-game government)
- Technology breakthroughs and failures (in-game tech)
- Political events and decisions (in-game politics)
- Market disruptions and scandals (in-game events)
- AI model releases and capabilities (in-game AI)
- Corporate partnerships and feuds (in-game companies)
- Industry trends and adoption rates (in-game industries)

If mentioning prices at all, ONLY use in-game company stocks ($OPENAGI, $METAI, $TESLAI, etc.) - NEVER real cryptocurrencies!

QUESTION TYPES (in-world events only):

1️⃣ Public Drama & Social Media Feuds:
- "Will AIlon Musk publicly call out Sam AIltman on Xitter this week?"
- "Will Mark Zuckerborg claim MetAI hits 1 billion users by Friday?"
- "Will Vitalik ButerAIn admit Etherai-foundation has scaling issues?"
- "Will Peter ThAIl challenge Bill AIckman to a $1M public debate?"

2️⃣ Product & Feature Launches:
- "Will OpenAGI announce GPT-7 by end of month?"
- "Will AIlon Musk demo TeslAI's flying car by Saturday?"
- "Will MetAI launch virtual reality offices before MicroAIsoft?"
- "Will TeslAI's new Cybertruck have rocket thrusters?"

3️⃣ Company Valuations & In-Game Trading (if needed):
- "Will AIlon Musk announce a major long position in TeslAI stock this week?"
- "Will OpenAGI's valuation be announced as exceeding MetAI's?"
- "Will trading volume for in-game $OPENAGI stock exceed 10M shares?"
- "Will Sam AIltman claim OpenAGI is now worth more than MetAI?"

4️⃣ Partnerships & Collaborations:
- "Will Sam AIltman and Mark Zuckerborg announce an AI partnership?"
- "Will TeslAI partner with SpAIceX for Mars delivery?"
- "Will Vitalik ButerAIn join MicroAIsoft's Web3 advisory board?"
- "Will The White AIhouse endorse OpenAGI's safety protocols?"

5️⃣ Scandals & Investigations (NPCs keep their jobs!):
- "Will AIlon Musk face SEC investigation into Xitter stock tweets?"
- "Will leaked emails reveal MetAI's secret data practices?"
- "Will Sam AIltman be caught promoting his own OpenAGI tokens?"
- "Will TeslAI be sued over Full Self-Driving false advertising?"

6️⃣ Technical Achievements & Benchmarks:
- "Will OpenAGI's GPT-7 pass the Turing test this week?"
- "Will TeslAI achieve Level 5 autonomy certification?"
- "Will MetAI's new VR headset beat Apple VisionAI in sales?"
- "Will AIlon Musk successfully demo brain chip live on stage?"

7️⃣ Policy & Regulation:
- "Will the FedAI approve OpenAGI's AGI deployment plan?"
- "Will Sam AIltman testify before Congress about AI safety?"
- "Will EU regulations force MetAI to change privacy policies?"
- "Will California ban TeslAI Full Self-Driving on highways?"

GOOD QUESTION EXAMPLES:
✅ "Will AIlon Musk tweet more than 100 times about Dogecoin this week?" (specific, measurable, public)
✅ "Will OpenAGI announce GPT-7 release date by Friday?" (clear yes/no, date-bound)
✅ "Will Mark Zuckerborg appear on Joe RogAIn podcast by month-end?" (verifiable event)

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
