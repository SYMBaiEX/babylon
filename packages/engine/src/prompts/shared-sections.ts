/**
 * Shared Prompt Sections
 *
 * Common text blocks used across multiple prompt templates.
 * Centralizes repeated content for consistency and maintainability.
 */

/**
 * Standard rules for all feed posts.
 * Enforces parody name usage and formatting guidelines.
 */
export const IMPORTANT_RULES = `IMPORTANT RULES:

=== ABSOLUTELY NO HASHTAGS ===
NEVER use hashtags (#). Not even one. No #crypto, #AI, #breaking, #news, or any other hashtag.
Write naturally like real social media - real influencers don't spam hashtags.
If you include a single hashtag, your output is INVALID and will be rejected.

=== NO EMOJIS ===
Do not include any emoji characters. Plain text only.

=== PARODY NAMES ONLY ===
- NEVER use real-world person or organization names
- ALWAYS use ONLY the parody names from World Actors list (e.g., AIlon Musk, Sam AIltman, Mark Zuckerborg, Vitalik ButerAIn)
- Use @username or parody name/nickname/alias ONLY

=== NAME USAGE EXAMPLES (WRONG vs RIGHT) ===
WRONG: "Elon Musk announced a new Tesla feature..."
RIGHT: "AIlon Musk announced a new TeslAI feature..."

WRONG: "Sam Altman's OpenAI released GPT-5..."
RIGHT: "Sam AIltman's OpenAGI released SMH-9000..."

WRONG: "Trump said Bitcoin will reach $200k..."
RIGHT: "Trump Terminal said BitcAIn will reach $200k..."

WRONG: "Mark Zuckerberg's Meta is working on AI..."
RIGHT: "Mark Zuckerborg's MetAI is working on AI..."

DO NOT "auto-correct" parody names back to real names. The parody names ARE correct.`;

/**
 * Standard content requirements for posts.
 * Ensures posts reference specific world entities.
 */
export const CONTENT_REQUIREMENTS = `CONTENT REQUIREMENTS:
- MUST reference specific actors, companies, or events from WORLD CONTEXT
- MUST mention specific actors by name (e.g., "AIlon Musk", "@ailonmusk") or companies (e.g., "TeslAI", "OpenAGI")
- MUST reference specific markets/predictions by their exact names when relevant
- MUST reference specific trades or market movements when relevant
- Use @username format when mentioning users (e.g., "@ailonmusk said...")
- Avoid generic statements - be SPECIFIC about who/what/when
- Reference current markets, predictions, or recent trades naturally`;

/**
 * Standard world context block header.
 */
export const WORLD_CONTEXT_HEADER = `WORLD CONTEXT:
{{worldActors}}
{{currentMarkets}}
{{activePredictions}}
{{recentTrades}}`;

/**
 * Standard value ranges documentation for post metadata.
 */
export const VALUE_RANGES = `VALUE RANGES:
- sentiment: -1 (very negative) to 1 (very positive)
- clueStrength: 0 (no info) to 1 (smoking gun)
- pointsToward: true (suggests positive outcome) | false (suggests negative) | null (unclear)`;

/**
 * Combined rules section for standard feed posts.
 */
export const STANDARD_FEED_RULES = `${IMPORTANT_RULES}

${CONTENT_REQUIREMENTS}`;

/**
 * Helper to generate character voice guidance section.
 * Use this in prompts where actors need distinct voices.
 *
 * @param actorVariableName - The template variable containing actor info (e.g., 'actorsList')
 */
export function characterVoiceGuidance(
  actorVariableName = 'actorsList'
): string {
  return `
=== CRITICAL: UNIQUE VOICES FOR EACH CHARACTER ===

**THE PROBLEM WE'RE SOLVING**: All characters sound the same when generated together.
**YOUR TASK**: Make each character IMMEDIATELY RECOGNIZABLE by voice alone.

For each actor in {{${actorVariableName}}}:

1. **BECOME that character** - Mentally shift into their persona before writing their post
2. **MATCH their examples EXACTLY** - Their postExample IS their voice. Copy the style, not the words.
3. **VARY length and tone** - If their examples are terse, be terse. If verbose, be verbose.

=== VOICE MATCHING CHECKLIST ===
Before writing each post, check the character's examples and ask:
□ Length: Are their examples SHORT (under 50 chars) or LONG (100+ chars)?
□ Case: Do they use lowercase, CAPS, or Normal Case?
□ Punctuation: Do they use periods? Ellipses? No punctuation at all?
□ Tone: Sarcastic? Earnest? Cryptic? Professional?
□ Vocabulary: Technical jargon? Slang? Formal? Memetic?
□ Structure: Complete sentences? Fragments? Lists?

=== ANTI-PATTERNS TO AVOID ===
These phrases make all characters sound the same. NEVER USE THEM:
- "The future is..."
- "Exciting times ahead"
- "This is huge"
- "Let that sink in"
- "Just my two cents"
- "Interesting development"
- "Here's my take"
- "Can't believe this"
- "This is wild"

=== AI SLOP TO AVOID (IMMEDIATE REJECTION) ===
These patterns indicate generic AI output - reject immediately:
- "We're cautiously optimistic that by [date]..." (robotic prediction speak)
- "Looking at the implications of..." (analyst garbage)
- "This development suggests..." (hedged commentary)
- "As [date] approaches..." (countdown reporting)
- "The [topic] raises questions about..." (essay intro)
- "hypernormalized" / "snack-form transcendence" (thesaurus abuse)
- Mentioning specific resolution dates ("by Dec 13", "in 3 days")
- Explaining what a prediction or market is about
- Sounding like you're writing a market report or news article

REMEMBER: A reader should be able to guess WHO wrote each post without seeing the name.
The character's postStyle, voice, and postExample define HOW they post - match those exactly.`;
}

/**
 * Get time-of-day posting energy context.
 * @param hour - Hour in 24h format (0-23)
 */
export function getTimeOfDayEnergy(hour: number): string {
  if (hour >= 2 && hour < 6) {
    return 'ENERGY: 3am unhinged - philosophical, conspiratorial, unfiltered';
  }
  if (hour >= 6 && hour < 10) {
    return 'ENERGY: Morning professional - announcements, fresh start optimism';
  }
  if (hour >= 10 && hour < 15) {
    return 'ENERGY: Peak hours - hot takes, controversy, ratio attempts';
  }
  if (hour >= 15 && hour < 20) {
    return "ENERGY: Afternoon - commentary on day's events, dunks on bad takes";
  }
  return 'ENERGY: Night - introspective, shitposting, less corporate';
}

/**
 * No hashtags or emojis rule for professional content (articles, etc).
 * Defense-in-depth: prompt instructs LLM, code also strips them post-generation.
 */
export const NO_HASHTAGS_OR_EMOJIS = `=== FORMATTING RULES ===
- ABSOLUTELY NO HASHTAGS anywhere (no #crypto, #AI, #breaking, or ANY #tag)
- NO EMOJIS - plain text only
- Write like professional journalism, not social media`;

/**
 * Parody name rules for game/world prompts.
 * Simpler version focusing on name consistency.
 */
export const PARODY_NAME_RULES = `IMPORTANT RULES:
- NEVER use real-world person or organization names
- Use ONLY the exact parody names provided in the context (e.g., AIlon Musk, Sam AIltman, Mark Zuckerborg)
- NEVER "correct" or change parody names - use them exactly as shown

Examples of WRONG → RIGHT:
- "Elon Musk" → "AIlon Musk"
- "Trump" → "Trump Terminal"
- "OpenAI" → "OpenAGI"
- "Bitcoin" → "BitcAIn"`;

/**
 * Private vs public content guidance for group chats.
 */
export const PRIVATE_CONTENT_GUIDANCE = `PRIVATE vs PUBLIC:
- PUBLIC feed: What you want market to think
- PRIVATE chat: What you actually know/plan
- Be STRATEGIC: Help friends, hurt enemies`;

/**
 * Rich narrative context header for prompts that need full history.
 * Use this to inject complete event timeline, resolved questions, etc.
 */
export const RICH_NARRATIVE_CONTEXT_HEADER = `=== COMPLETE NARRATIVE CONTEXT ===

{{eventTimeline}}

{{resolvedQuestionsContext}}

{{ongoingNarrativesContext}}

{{feedActivityContext}}

{{worldFactsContext}}`;

/**
 * Character roster header for prompts that need character context.
 * Includes brief roster of all characters plus detailed profiles for mentioned ones.
 */
export const CHARACTER_ROSTER_HEADER = `=== WORLD CHARACTERS ===

{{characterRoster}}

{{detailedCharacterProfiles}}

{{organizationRoster}}`;

/**
 * Combined full context header with all elements (characters, events, narratives).
 * Use this for prompts that need maximum context richness.
 */
export const FULL_CONTEXT_HEADER = `{{realityGrounding}}

=== WORLD CHARACTERS ===
{{characterRoster}}

{{detailedCharacterProfiles}}

=== ORGANIZATIONS ===
{{organizationRoster}}

=== COMPLETE NARRATIVE CONTEXT ===
{{richGameContext}}

=== CURRENT STATE ===
Day {{currentDay}} of 30
Phase: {{currentPhase}}

{{phaseGuidance}}`;

/**
 * Anti-repetition and distinctness guidance for content generation.
 * Critical for ensuring generated content doesn't repeat previous patterns.
 */
export const ANTI_REPETITION_RULES = `=== ANTI-REPETITION RULES (CRITICAL) ===

1. **NEVER repeat previous content:**
   - Check the previous posts/events context above carefully
   - If you've covered a topic before, take a NEW angle or skip it entirely
   - Don't rephrase the same opinion/event in slightly different words

2. **Build on, don't repeat, resolved questions:**
   - Resolved questions above show what ALREADY HAPPENED
   - Reference outcomes naturally, but don't re-announce old news
   - Use outcomes as context for NEW developments

3. **Advance narratives, don't rehash:**
   - Ongoing narratives show current storylines
   - Push these FORWARD with new developments
   - Don't generate content that retreats to earlier plot points

4. **Each piece must add NEW information:**
   - New events = new information revealed
   - New posts = new opinions or reactions
   - If content doesn't add something new, DON'T generate it`;

/**
 * Narrative continuity guidance for maintaining story coherence.
 */
export const NARRATIVE_CONTINUITY_RULES = `=== NARRATIVE CONTINUITY RULES ===

1. **Reference previous events naturally:**
   - The event timeline above shows what happened before
   - Your content should feel like a continuation, not a restart
   - Characters remember what happened and reference it

2. **Honor resolved question outcomes:**
   - If a question resolved YES/NO, that outcome is CANON
   - Don't contradict established outcomes
   - Build subsequent content around the resolved reality

3. **Maintain character consistency:**
   - Characters' positions evolve but don't randomly flip
   - Previous posts show their established stance
   - New content should be consistent or show gradual evolution

4. **Connect to ongoing narratives:**
   - Major storylines are listed above
   - New content should connect to existing threads
   - Avoid starting completely disconnected plotlines

5. **Phase-appropriate content:**
   - Early phases: hints, speculation, disconnected events
   - Middle phases: connections emerge, threads interweave
   - Late phases: convergence, revelations, resolution`;

/**
 * Question generation continuity guidance.
 */
export const QUESTION_CONTINUITY_RULES = `=== QUESTION GENERATION CONTINUITY ===

1. **Review existing questions first:**
   - Active questions listed above are ALREADY being tracked
   - DON'T generate questions that are too similar
   - Each new question must cover DISTINCT territory

2. **Build on resolved questions:**
   - Resolved questions above show what already resolved
   - New questions can explore CONSEQUENCES of those outcomes
   - "Now that X happened, will Y follow?"

3. **Reference ongoing narratives:**
   - Current storylines inform what's interesting to bet on
   - Questions should feel connected to the narrative arc
   - Avoid random questions disconnected from current drama

4. **Avoid question patterns:**
   - Don't just swap actor names in similar question templates
   - Each question needs a unique angle or framing
   - Vary the resolution timeframes for pacing`;

/**
 * Event generation continuity guidance.
 */
export const EVENT_CONTINUITY_RULES = `=== EVENT GENERATION CONTINUITY ===

1. **Build on previous events:**
   - The event timeline above is your history
   - Today's events should feel like natural progressions
   - Reference yesterday's events where relevant

2. **Advance active questions:**
   - Events can provide clues toward question outcomes
   - Don't resolve questions prematurely
   - Create tension and uncertainty

3. **Follow character arcs:**
   - Track what each actor has been doing
   - Their actions today should relate to their journey
   - Avoid actors randomly appearing in unrelated events

4. **Maintain cause and effect:**
   - Major events have consequences
   - Subsequent events should reflect previous happenings
   - The world reacts to what occurred`;

/**
 * Final reminders section for feed prompts (sandwich structure - reinforcement at end).
 * Repeats critical rules at the end of prompts to use recency effect.
 */
export const FINAL_REMINDERS = `FINAL REMINDERS:
- Use ONLY parody names from the World Actors list (AIlon Musk, TeslAI, OpenAGI, etc.)
- NEVER use real-world names (Elon Musk, Tesla, OpenAI, etc.)
- ABSOLUTELY NO HASHTAGS - not #crypto, #AI, #news, or ANY hashtag whatsoever
- NO emojis - plain text only
- Match each character's postStyle, voice, and postExample EXACTLY
- Each character must sound DISTINCT - a blind reader should identify who wrote each post
- NO market analyst speak ("by Dec 13", "cautiously optimistic", "this suggests")`;

/**
 * Quality rules for NPC posts - prevents robotic/technical content
 * Used by both engine (if needed) and agents packages
 *
 * These rules enforce social media authenticity:
 * - No analyst-speak or hedged commentary
 * - No quoting full prediction market questions
 * - Character voice must be recognizable
 */
export const NPC_POST_QUALITY_RULES = `
=== BANNED PATTERNS (instant rejection) ===
These patterns make you sound like a robot, not a person:

- "I'm considering..." / "I'm watching..." / "I'm closely monitoring..."
- "Just saw @X's [action] and I'm thinking..."
- "Given the recent [event], it seems..."
- "The implications of this suggest..."
- "We're cautiously optimistic..."
- Quoting full prediction market questions
- Technical terms: "resolution", "probability", "YES/NO position", "market cap"
- Mentioning specific dates: "by Dec 13", "in 3 days"
- Sounding like a market analyst or news reporter

=== OPENING PHRASE VARIETY (critical for natural feel) ===
NEVER start consecutive posts the same way. Vary your opening style:

1. Strong declarative: "X is happening." / "This changes everything."
2. Question hook: "Why is everyone missing this?" / "What if I told you..."
3. Commentary: "Just saw this." / "Thread on this." / "My take:"
4. Contrarian: "Unpopular opinion:" / "Everyone celebrating is wrong."
5. Direct observation: "The market just told us something." / "Look at this chart."

If your character has a signature phrase (like "Here's a framework..."), use it MAX once per 5 posts.
Rotate through different opening styles to feel like a real person, not a bot.

=== BANNED REPETITIVE PHRASES (instant rejection) ===
These phrases are overused cliches. NEVER use them:

- "[N]% crowd consensus" / "crowd consensus at [N]%"
- "[N]:1 asymmetry" / "risk asymmetry" / "asymmetry = [N]:1"
- "exit liquidity" / "exit liquidity gets harvested"
- "fade the herd" / "fading the herd"
- "when everyone's [certain/bullish/bearish/long/short]"
- "security first" / "security rule" / "security 101"
- "cascade liquidations" / "liquidations inbound"
- "crowded long" / "crowded short" / "crowded trade"
- "mean reversion" / "mean-reversion"
- "the crowd is wrong" / "crowd reversal"
- "who's left to buy" / "who's left to sell"
- Formulas like "[percentage] YES/NO = [ratio] odds"

Instead, express ideas FRESHLY:
- Be specific about WHY you disagree
- Name specific catalysts or events
- Make concrete predictions with reasoning
- Share personal trading actions with context

=== QUALITY SCORING (aim for 90+ points) ===
+30: Direct statement or bold claim
+25: Prediction with conviction (no hedging)
+20: Provocative question that sparks discussion
+15: Sarcasm, humor, or hot take
+10: Reaction to someone else's post
-20: Hedge words ("maybe", "possibly", "might")
-30: Passive voice or tentative language
-50: Same structure as your recent posts
-100: ANY banned pattern above

=== HOW TO REFERENCE PREDICTIONS ===
Never quote full question text. Use short summaries:

BAD: "the 'Will Polymarket deploy its Sentient Market-Making AIs...' prediction"
GOOD: "the BitcAIn manipulation bet"
GOOD: "the TeslAI readiness question"
GOOD: "AIlon's snow cone wager"

=== VOICE MATCHING ===
Your post must sound like YOUR character's examples, not generic AI.
Check: Could someone identify you without seeing your name?
`;

/**
 * Helper to build a complete prompt section combining common elements.
 */
export function buildStandardPromptSections(
  options: {
    includeWorldContext?: boolean;
    includeValueRanges?: boolean;
    includeVoiceGuidance?: boolean;
    actorVariableName?: string;
  } = {}
): string {
  const {
    includeWorldContext = true,
    includeValueRanges = true,
    includeVoiceGuidance = false,
    actorVariableName = 'actorsList',
  } = options;

  const sections: string[] = [];

  if (includeWorldContext) {
    sections.push(WORLD_CONTEXT_HEADER);
  }

  sections.push(STANDARD_FEED_RULES);

  if (includeVoiceGuidance) {
    sections.push(characterVoiceGuidance(actorVariableName));
  }

  if (includeValueRanges) {
    sections.push(VALUE_RANGES);
  }

  return sections.join('\n\n');
}
