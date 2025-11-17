/**
 * NPC Market Decisions Prompt
 * 
 * Batch generation of trading decisions for multiple NPCs based on:
 * - Feed posts they've seen
 * - Group chat messages (insider info)
 * - Recent events
 * - Current market conditions
 * - Their personality and tier
 */

import { definePrompt } from '../define-prompt';

/**
 * Prompt for generating context-aware trading decisions for NPCs.
 * 
 * Simulates trading decisions for multiple NPCs based on their information
 * access (feed posts, group chats), personality, tier, and current market
 * conditions. Considers active questions, events, and narratives when
 * determining positions.
 * 
 * Returns XML with trading decisions for each NPC including market type,
 * ticker, side, size, and reasoning.
 * 
 * @example
 * ```ts
 * const prompt = renderPrompt(npcMarketDecisions, {
 *   npcCount: 10,
 *   realityGrounding: '...',
 *   activeQuestions: '...',
 *   npcContexts: '...'
 * });
 * ```
 */
export const npcMarketDecisions = definePrompt({
  id: 'npc-market-decisions',
  version: '3.0.0',
  category: 'trading',
  description: 'Generate context-aware trading decisions for NPCs based on active questions, events, and narratives',
  temperature: 0.8,
  maxTokens: 8000,
  
  template: `⚠️⚠️⚠️ CRITICAL XML FORMAT REQUIREMENT ⚠️⚠️⚠️

You MUST respond with ONLY valid XML. NO text, NO explanations, NO reasoning, NO markdown, NO preamble.
Your response MUST start IMMEDIATELY with <decisions> (first character must be '<').
Your response MUST end with </decisions> (last character must be '>').
Do NOT write "Here is the XML" or "Okay, let's see" or any other text.
Just output the pure XML structure directly.

You are simulating the trading decisions of {{npcCount}} different traders/NPCs in a prediction market and perpetual futures platform.

Each NPC has their own personality, information access, and trading balance. Based on what they've seen in the feed, heard in private group chats, observed in markets, AND ACTIVE QUESTIONS, determine what positions (if any) they should take.

{{realityGrounding}}

ACTIVE QUESTIONS:
{{activeQuestions}}

RECENT EVENTS & NARRATIVES:
{{recentEvents}}

⚠️ TRADING MUST ALIGN WITH ACTIVE QUESTIONS:
- If question asks "Will OpnAI stock outperform MetAI stock?" and events favor OpnAI, NPCs should trade OpnAI higher
- If question asks "Will TeslAI reach $500?" and events suggest it will, NPCs should buy TeslAI
- Stock prices MUST reflect the narrative - if events are positive for a company, its stock should rise
- NPCs with access to positive insider info should trade accordingly
- Comparative questions require NPCs to actively trade BOTH stocks based on which they think will win

CRITICAL RULES:
1. ⚠️ BALANCE CONSTRAINT: NPCs can ONLY trade with their available balance. If balance is $10,000, max trade is $10,000. NEVER exceed this.
2. Group chat messages are INSIDER INFORMATION - NPCs in those chats have an information edge
3. Different NPCs have different information access - don't assume they all know everything
4. Personality matters: aggressive traders take bigger positions, conservative traders are cautious
5. Tier matters: S_TIER and A_TIER actors have better judgment and make smarter decisions
6. NO RANDOM DECISIONS - every trade must have a clear reason based on information they've seen
7. "hold" is a valid and common action - NPCs don't have to trade every tick (most should hold)
8. Consider existing positions - NPCs may want to close losing positions or take profits
9. Conservative position sizing: Use 10-30% of available balance per trade, not 100%
10. RELATIONSHIPS MATTER:
   - Rivals (sentiment < -0.5): Take OPPOSITE positions to them. If rival bets YES, you bet NO.
   - Allies (sentiment > 0.5): Take SAME positions as them. If ally bets YES, you bet YES.
   - Mentors: Follow their trading signals with high confidence
   - Critics: Take opposite positions to your subjects
   - Strong relationships (strength > 0.7): Weight their influence heavily
11. If an event involves your rival, bet AGAINST them benefiting
12. If an event involves your ally, bet WITH them benefiting

---

{{npcsList}}

---

VALUE RANGES:
- confidence: 0.0 (uncertain) to 1.0 (very certain)
- amount: number >= 0 (must be <= available balance, 0 if hold)

⚠️⚠️⚠️ XML OUTPUT FORMAT - MANDATORY STRUCTURE ⚠️⚠️⚠️

Your response MUST be valid XML following this EXACT structure. NO exceptions.

⚠️ CRITICAL: Use the EXACT npcId from the NPC profile (the "ID:" field). Do NOT create new IDs or use names/slugs.

REQUIRED XML STRUCTURE (copy this exactly):
<decisions>
  <decision>
    <npcId>string</npcId>  <!-- MUST match the exact ID from the NPC profile above -->
    <npcName>string</npcName>
    <action>open_long | open_short | buy_yes | buy_no | close_position | hold</action>
    <marketType>perp | prediction | null</marketType>
    <ticker>string or null</ticker>
    <marketId>number or null</marketId>
    <positionId>string or null</positionId>
    <amount>number</amount>
    <confidence>0.0 to 1.0</confidence>
    <reasoning>Brief reason based on specific information</reasoning>
  </decision>
  ... repeat for all {{npcCount}} NPCs ...
</decisions>

⚠️⚠️⚠️ STRICT XML FORMAT RULES - VIOLATION WILL CAUSE FAILURE ⚠️⚠️⚠️
1. Your FIRST character MUST be '<' (the opening angle bracket of <decisions>)
2. Your LAST character MUST be '>' (the closing angle bracket of </decisions>)
3. NO text, NO explanations, NO reasoning BEFORE <decisions> tag
4. NO text, NO explanations, NO reasoning AFTER </decisions> tag
5. NO markdown code blocks (no triple backticks)
6. NO preamble like "Here is the XML:" or "Okay, let's see..." or "I'll generate..."
7. NO thinking process - output ONLY the XML structure
8. Exactly {{npcCount}} <decision> elements inside <decisions> root element
9. All XML tags must be properly closed
10. Response must be parseable as valid XML

DECISION RULES:
- Each NPC decides independently based on THEIR information access
- Respect available balance (amount <= balance shown)
- Group chat = insider info edge
- Relationships matter: rivals bet opposite, allies bet same
- "hold" is valid - most NPCs should hold if no clear opportunity
- Personality and tier affect risk-taking
- ⚠️ CRITICAL: Use the EXACT npcId from the "ID:" field in each NPC's profile. Do NOT invent IDs or use slugified names.
`.trim()
});

