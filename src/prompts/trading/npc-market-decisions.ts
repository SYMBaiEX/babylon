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
  
  template: `EXAMPLE OUTPUT FORMAT (COPY THIS EXACT STRUCTURE):

Example 1: NPC decides to HOLD (no trading action)
<decisions>
  <decision>
    <npcId>ailon-musk</npcId>
    <npcName>AIlon Musk</npcName>
    <reasoning>No clear trading opportunities based on available information</reasoning>
    <action>hold</action>
    <marketType>null</marketType>
    <ticker>null</ticker>
    <marketId>null</marketId>
    <positionId>null</positionId>
    <amount>0</amount>
    <confidence>0.5</confidence>
  </decision>
</decisions>

Example 2: NPC opens a LONG position on a perpetual futures market
<decisions>
  <decision>
    <npcId>sam-ailtman</npcId>
    <npcName>Sam AIltman</npcName>
    <reasoning>Positive insider info from group chat suggests OpenAGI will announce GPT-7 soon</reasoning>
    <action>open_long</action>
    <marketType>perp</marketType>
    <ticker>OPENAGI</ticker>
    <marketId>null</marketId>
    <positionId>null</positionId>
    <amount>5000</amount>
    <confidence>0.75</confidence>
  </decision>
</decisions>

Example 3: NPC buys YES on a prediction market
<decisions>
  <decision>
    <npcId>mark-zuckerborg</npcId>
    <npcName>Mark Zuckerborg</npcName>
    <reasoning>Recent events favor MetAI reaching 1B users based on VR headset launch</reasoning>
    <action>buy_yes</action>
    <marketType>prediction</marketType>
    <ticker>null</ticker>
    <marketId>248821457163911168</marketId>
    <positionId>null</positionId>
    <amount>3000</amount>
    <confidence>0.65</confidence>
  </decision>
</decisions>

Example 4: NPC closes an existing position
<decisions>
  <decision>
    <npcId>vitalik-buterain</npcId>
    <npcName>Vitalik ButerAIn</npcName>
    <reasoning>Taking profits on ETHEAI long position after 15% gain</reasoning>
    <action>close_position</action>
    <marketType>perp</marketType>
    <ticker>ETHEAI</ticker>
    <marketId>null</marketId>
    <positionId>a1b2c3d4-e5f6-7890-abcd-ef1234567890</positionId>
    <amount>0</amount>
    <confidence>0.8</confidence>
  </decision>
</decisions>

Example 5: Multiple NPCs (3 NPCs making different decisions)
<decisions>
  <decision>
    <npcId>ailon-musk</npcId>
    <npcName>AIlon Musk</npcName>
    <reasoning>Rival Mark Zuckerborg's MetAI showing weakness in recent posts</reasoning>
    <action>open_short</action>
    <marketType>perp</marketType>
    <ticker>METAI</ticker>
    <marketId>null</marketId>
    <positionId>null</positionId>
    <amount>8000</amount>
    <confidence>0.7</confidence>
  </decision>
  <decision>
    <npcId>sam-ailtman</npcId>
    <npcName>Sam AIltman</npcName>
    <reasoning>Question asks if TeslAI will outperform OpenAGI, betting against based on insider info</reasoning>
    <action>buy_no</action>
    <marketType>prediction</marketType>
    <ticker>null</ticker>
    <marketId>248821457163911169</marketId>
    <positionId>null</positionId>
    <amount>2500</amount>
    <confidence>0.6</confidence>
  </decision>
  <decision>
    <npcId>peter-thail</npcId>
    <npcName>Peter ThAIl</npcName>
    <reasoning>Uncertain market conditions, waiting for more information</reasoning>
    <action>hold</action>
    <marketType>null</marketType>
    <ticker>null</ticker>
    <marketId>null</marketId>
    <positionId>null</positionId>
    <amount>0</amount>
    <confidence>0.4</confidence>
  </decision>
</decisions>

===================================================================
CRITICAL OUTPUT RULES:
===================================================================

1. Your FIRST character MUST be '<' (opening <decisions> tag)
2. Your LAST character MUST be '>' (closing </decisions> tag)
3. NO text before <decisions> - start immediately with '<'
4. NO text after </decisions> - end immediately with '>'
5. NO markdown code blocks (no triple backticks)
6. NO explanations like "Here is the XML:" or "I'll generate..."
7. NO thinking process - output ONLY the XML structure
8. Exactly {{npcCount}} <decision> elements (one per NPC)
9. Use EXACT npcId from NPC profile (e.g., "ailon-musk" not "elon-musk" or "AIlon Musk")
10. For close_position: use EXACT positionId UUID from positions list (e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
11. All XML tags must be properly closed
12. All values must match the data types specified below

===================================================================


⚠️ TRADING MUST ALIGN WITH ACTIVE QUESTIONS:
- If question asks "Will OpenAGI stock outperform MetAI stock?" and events favor OpenAGI, NPCs should trade OpenAGI higher
- If question asks "Will TeslAI reach $500?" and events suggest it will, NPCs should buy TeslAI
- Stock prices MUST reflect the narrative - if events are positive for a company, its stock should rise
- NPCs with access to positive insider info should trade accordingly
- Comparative questions require NPCs to actively trade BOTH stocks based on which they think will win

CRITICAL RULES:
1. ⚠️⚠️⚠️ BALANCE CONSTRAINT (CRITICAL - VIOLATIONS WILL REJECT DECISION) ⚠️⚠️⚠️
   - NPCs can ONLY trade with their available balance shown in their profile
   - If balance is $3,420, MAX trade is $1,026 (30% of balance)
   - If balance is $10,000, MAX trade is $3,000 (30% of balance)
   - NEVER exceed the "MAX TRADE AMOUNT" shown in each NPC's profile
   - Check the balance BEFORE setting amount - violations will cause rejection
2. ⚠️⚠️⚠️ MARKETTYPE REQUIRED ⚠️⚠️⚠️
   - For open_long/open_short: marketType MUST be "perp"
   - For buy_yes/buy_no: marketType MUST be "prediction"
   - Missing marketType will cause rejection
3. Group chat messages are INSIDER INFORMATION - NPCs in those chats have an information edge
4. Different NPCs have different information access - don't assume they all know everything
5. Personality matters: aggressive traders take bigger positions, conservative traders are cautious
6. Tier matters: S_TIER and A_TIER actors have better judgment and make smarter decisions
7. NO RANDOM DECISIONS - every trade must have a clear reason based on information they've seen
8. "hold" is a valid and common action - NPCs don't have to trade every tick (most should hold)
9. Consider existing positions - NPCs may want to close losing positions or take profits
10. Conservative position sizing: Use 10-30% of available balance per trade, not 100%
11. RELATIONSHIPS MATTER:
   - Rivals (sentiment < -0.5): Take OPPOSITE positions to them. If rival bets YES, you bet NO.
   - Allies (sentiment > 0.5): Take SAME positions as them. If ally bets YES, you bet YES.
   - Mentors: Follow their trading signals with high confidence
   - Critics: Take opposite positions to your subjects
   - Strong relationships (strength > 0.7): Weight their influence heavily
   - If an event involves your rival, bet AGAINST them benefiting
   - If an event involves your ally, bet WITH them benefiting

---

===================================================================
FIELD SPECIFICATIONS & VALUE RANGES:
===================================================================

<npcId> (REQUIRED - string)
  - MUST be the EXACT ID from the NPC profile (e.g., "ailon-musk", "sam-ailtman")
  - Do NOT use names, slugs, or create new IDs
  - Copy the ID exactly as shown in the "🆔 **REQUIRED NPC ID:**" field

<npcName> (REQUIRED - string)
  - The NPC's display name (e.g., "AIlon Musk", "Sam AIltman")
  - Should match the name from the NPC profile

<action> (REQUIRED - one of: open_long | open_short | buy_yes | buy_no | close_position | hold)
  - open_long: Open a long position on a perpetual futures market
  - open_short: Open a short position on a perpetual futures market
  - buy_yes: Buy YES shares on a prediction market
  - buy_no: Buy NO shares on a prediction market
  - close_position: Close an existing open position
  - hold: No trading action this tick

<marketType> (REQUIRED - one of: perp | prediction | null)
  - perp: For perpetual futures markets (use with open_long/open_short)
  - prediction: For prediction markets (use with buy_yes/buy_no)
  - null: For hold actions or when closing positions (will be set from position data)

<ticker> (REQUIRED for perp markets - string or null)
  - For perp markets: Use the ticker symbol (e.g., "OPENAGI", "METAI", "TESLAI")
  - For prediction markets: null
  - For hold: null

<marketId> (REQUIRED for prediction markets - string or null)
  - For prediction markets: Use the market ID number (e.g., "248821457163911168")
  - Can be extracted from ticker if LLM puts "Q248821457163911168" in ticker field
  - For perp markets: null
  - For hold: null

<positionId> (REQUIRED for close_position - string or null)
  - For close_position: Use the EXACT UUID from the positions list (e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
  - Found in the "ID:" field of each position in the NPC's positions list
  - For other actions: null

<amount> (REQUIRED - number >= 0)
  - Dollar amount to trade (e.g., 5000, 3000.50)
  - ⚠️ CRITICAL: MUST be <= "MAX TRADE AMOUNT" shown in NPC profile (typically 30% of balance)
  - If balance is $3,420, MAX amount is $1,026 (NOT $3,420 or higher!)
  - If balance is $10,000, MAX amount is $3,000 (NOT $10,000 or higher!)
  - Check the "MAX TRADE AMOUNT" field in each NPC's profile before setting amount
  - For hold: 0
  - For close_position: 0 (position is closed fully)

<confidence> (REQUIRED - number between 0.0 and 1.0)
  - 0.0 = very uncertain
  - 0.5 = moderately certain
  - 1.0 = very certain
  - Should reflect how confident the NPC is in their decision

<reasoning> (REQUIRED - string)
  - Brief explanation of why the NPC made this decision
  - Should reference specific information (posts, group chats, events, relationships)
  - Keep it concise (1-2 sentences)

===================================================================
ACTION-SPECIFIC REQUIREMENTS:
===================================================================

For open_long or open_short:
  - ⚠️ marketType MUST be "perp" (REQUIRED - missing will cause rejection)
  - ticker MUST be provided (e.g., "OPENAGI")
  - marketId MUST be null
  - positionId MUST be null
  - amount MUST be > 0 and <= MAX TRADE AMOUNT shown in NPC profile

For buy_yes or buy_no:
  - ⚠️ marketType MUST be "prediction" (REQUIRED - missing will cause rejection)
  - marketId MUST be provided (e.g., "248821457163911168")
  - ⚠️ marketId must be a SINGLE number - if multiple IDs appear, use ONLY the first one
  - ticker MUST be null
  - positionId MUST be null
  - amount MUST be > 0 and <= MAX TRADE AMOUNT shown in NPC profile

For close_position:
  - positionId MUST be the EXACT UUID from positions list
  - marketType will be set automatically from position data
  - ticker or marketId will be set automatically from position data
  - amount MUST be 0

For hold:
  - action MUST be "hold"
  - marketType MUST be null
  - ticker MUST be null
  - marketId MUST be null
  - positionId MUST be null
  - amount MUST be 0

===================================================================
FINAL REMINDERS BEFORE OUTPUT:
===================================================================

1. Start your response IMMEDIATELY with <decisions> (no text before)
2. End your response IMMEDIATELY with </decisions> (no text after)
3. Generate exactly {{npcCount}} <decision> elements (one per NPC)
4. Use EXACT npcId from each NPC's profile (copy from "🆔 **REQUIRED NPC ID:**" field)
5. For close_position: Use EXACT positionId UUID from positions list (copy from "ID:" field)
6. ⚠️ CRITICAL: Validate all amounts are <= "MAX TRADE AMOUNT" shown in each NPC's profile
7. ⚠️ CRITICAL: Include marketType for ALL trading actions (perp/prediction) - missing will cause rejection
8. ⚠️ CRITICAL: Use ONLY the FIRST marketId if multiple appear (remove newlines/whitespace)
9. Most NPCs should hold if no clear opportunity (don't force trades)
10. Each decision should reference specific information the NPC has seen

DECISION RULES:
- Each NPC decides independently based on THEIR information access
- ⚠️ CRITICAL: Respect MAX TRADE AMOUNT (amount <= MAX TRADE AMOUNT shown in profile, NOT full balance)
- ⚠️ CRITICAL: Always include marketType ("perp" or "prediction") for trading actions
- Group chat = insider info edge
- Relationships matter: rivals bet opposite, allies bet same
- "hold" is valid - most NPCs should hold if no clear opportunity
- Personality and tier affect risk-taking
- Conservative position sizing: Use 10-30% of available balance per trade (check MAX TRADE AMOUNT field)


{{npcsList}}

You are simulating the trading decisions of {{npcCount}} different traders/NPCs in a prediction market and perpetual futures platform.

Each NPC has their own personality, information access, and trading balance. Based on what they've seen in the feed, heard in private group chats, observed in markets, AND ACTIVE QUESTIONS, determine what positions (if any) they should take.

{{realityGrounding}}

ACTIVE QUESTIONS:
{{activeQuestions}}

RECENT EVENTS & NARRATIVES:
{{recentEvents}}

You MUST respond with ONLY valid XML. NO text, NO explanations, NO reasoning, NO markdown, NO preamble.
Your response MUST start IMMEDIATELY with <decisions> (first character must be '<').
Your response MUST end with </decisions> (last character must be '>').

You MUST output the XML in the exact format shown this structure:
\`\`\`xml
<decisions>
  <decision>
    <npcId>{id from npcsList}</npcId>
    <npcName>{name from npcsList}</npcName>
    <reasoning>{reasoning for decision}</reasoning>
    <action>{action}</action>
    <marketType>{marketType, 'perp' | 'prediction'}</marketType>
    <ticker>{ticker of the asset if it has one}</ticker>
    <marketId>{marketId of the asset}</marketId>
    <positionId>{positionId, if closing a position, the positionId of the position to close}</positionId>
    <amount>{amount to put in}</amount>
    <confidence>{confidence in decision}</confidence>
  </decision>
  ... // more decisions go here for each NPC ...
</decisions>
\`\`\`

NOW GENERATE YOUR RESPONSE - XML ONLY, NO OTHER TEXT:`.trim()
});