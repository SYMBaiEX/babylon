/**
 * Reality Grounding - Current World State
 * 
 * Provides current date, prices, politics, culture, and tech landscape
 * to ground LLM outputs in 2025 reality and prevent outdated predictions.
 * 
 * Last Updated: November 15, 2025
 */

/**
 * CURRENT DATE & TIME CONTEXT
 * Updated dynamically at generation time
 */
export function getCurrentDateContext(): {
  dateISO: string;
  dateFull: string;
  time: string;
  year: string;
  month: string;
  day: string;
} {
  const now = new Date();
  return {
    dateISO: now.toISOString(),
    dateFull: now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }),
    time: now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }),
    year: now.getFullYear().toString(),
    month: now.toLocaleDateString('en-US', { month: 'long' }),
    day: now.getDate().toString(),
  };
}

/**
 * CURRENT WORLD FACTS (November 2025)
 * 
 * Key facts to ground AI generation in current reality:
 * - Cryptocurrency prices
 * - Stock prices
 * - Political leadership
 * - Technology state
 * - Pop culture
 */
export const REALITY_GROUNDING = `
=== CURRENT DATE: November 16, 2025 ===

=== CRYPTOCURRENCY PRICES (Mid-November 2025) ===
- Bitcoin (BTC): ~$95,000 (recently dipped below $100K after hitting ATH near $126K earlier in 2025)
- Ethereum (ETH): ~$3,200-$3,300 (down ~33% from August peak of $4,800)
- Solana (SOL): ~$140 (down 50%+ from January 2025 peak near $295)
- Dogecoin (DOGE): ~$0.16 (16¢, retraced from highs near $0.30 earlier this year)

Key Context: 2025 has been a major crypto bull market compared to 2022-2023. Bitcoin tripled year-to-date. Major U.S. spot ETFs for BTC, ETH, SOL approved. Trump administration is pro-crypto.

=== MAJOR U.S. STOCK PRICES (November 2025) ===
- Meta (META): ~$610/share (down from ATH ~$789 in August 2025)
- NVIDIA (NVDA): ~$190/share (near record highs on AI chip demand)
- Tesla (TSLA): ~$400-$440/share (up ~90% YoY despite volatility)
- S&P 500: Strong 2025 driven by "Magnificent Seven" tech stocks and AI hype
- NASDAQ: High valuations continue on AI optimism

Key Context: Tech stocks driving markets. High interest rates (~5%) from Fed. No recession yet but credit tightening. AI boom fueling NVIDIA, Meta valuations.

=== U.S. POLITICAL LEADERSHIP (November 2025) ===
- President: Donald J. Trump (inaugurated January 20, 2025 after winning Nov 2024 election)
- Vice President: J.D. Vance (former Ohio senator)
- Congress: Republicans control both House and Senate
- Treasury Secretary: Scott Bessent (billionaire hedge fund manager)
- Fed Chair: Jerome Powell (under pressure from Trump admin)
- SEC: New leadership, crypto-friendly (Gary Gensler stepped down Jan 2025)

Key Context: Trump pardoned Jan 6 defendants on Day 1. Record-long government shutdown occurred fall 2025 over budget. Trump launched $TRUMP memecoin (crashed 90% from $75 peak to under $8). Administration is deregulatory, crypto-friendly, business-focused. Tensions with Ukraine (dramatic clash with Zelensky in Feb 2025).

=== STATE OF AI (November 2025) ===
Latest Models:
- OpenAI: GPT-5.1 (released Nov 12, 2025) with GPT-5.1 Instant and GPT-5.1 Thinking variants. GPT-6 confirmed NOT coming in 2025, expected 2026.
- Anthropic: Claude 4.5 Sonnet and Claude 4.5 Haiku (Oct 2025) - state-of-the-art coding, extended thinking mode, massive context windows
- Google: Gemini 2.5 available now, Gemini 3.0 expected by end of 2025 (CEO confirmed)
- Meta: LLaMA 4 (April 2025) - most powerful open-source LLM, up to 70B parameters

Key Context: AI is mainstream and "boring utility" phase. ChatGPT and competitors integrated everywhere (Office, Google, etc.). Generative AI for music, video common. AI coding assistants widely adopted. Europe passed AI rules; U.S. still laissez-faire under Trump.

=== TECHNOLOGY & PRODUCTS (2025) ===
- iPhone: iPhone 17 series current generation
- Social Media: X (Twitter) still central but ad revenue down. Threads exists but smaller. Truth Social niche conservative platform.
- Cloud: AWS outages happened. SaaS pricing concerns (Slack raised prices dramatically).
- Open Source: Movement toward open hardware/software (Pebble revival, open-source laptops)
- Android: Google moving toward verified-only apps (community pushback on closed ecosystem)

=== POP CULTURE (2025) ===
- Taylor Swift: Dominating music scene, 2025 world tour sold out NFL stadiums
- Marvel: Superhero fatigue, recent films underperformed
- Horror: Indie horror film broke box office records October 2025
- Sports: 2025 Super Bowl and World Series among most watched ever
- Memes: "Skibidi Toilet" on TikTok, AI-generated meme mashups, AI-aged photos ("me in 2075")
- Hollywood: Writers/actors strikes ended, content flowing again

=== ECONOMIC SITUATION (Late 2025) ===
- Unemployment: Low ~4%
- Inflation: ~3% (down from highs, Fed high-rate policy worked)
- Interest Rates: High ~5% (Fed holding/cautiously easing)
- Housing: Cooling but unaffordable, high mortgage rates
- Federal Debt: >$36 trillion and growing
- Markets: Wall Street strong (tech/crypto gains) but average consumers feel inflation pain
- Corporate: Some bankruptcies up due to tight credit

=== FOREIGN POLICY (2025) ===
- Russia-Ukraine War: Grinding stalemate. U.S. support uncertain under Trump (scaled back aid). Potential frozen conflict coming 2026.
- Israel-Hamas: Active hostilities subsided, Gaza in ruins, instability persists. U.S. fully supports Israel.
- China-Taiwan: Tensions continue, no invasion. U.S. taking transactional approach under Trump.
- NATO: Unity tested by uncertain U.S. commitment under Trump.

=== KEY 2025 EVENTS & TRENDS ===
- Trump's $TRUMP memecoin launched Jan 18, 2025 (spiked to $75, crashed to <$8). White House dinner offered to top holders.
- Crypto regulation dramatically eased. Multiple crypto ETFs approved (ETH, SOL, mixed baskets).
- Bitwise launched Solana ETF during government shutdown without formal SEC approval.
- Crime narrative: Urban crime concerns (SF shoplifting, etc.) but Trump pardoned Jan 6 participants.
- Fed independence: Trump tried to fire Fed Governor Lisa Cook. Regional Fed president retired amid pressure.
- UAW strike 2024 led to big wage gains, high labor costs in 2025.

=== GROUNDING RULES ===
When generating content:
1. Bitcoin is at $95K, NOT $30K-$50K (outdated 2023 prices)
2. Trump is president (2025), not Biden
3. AI models are GPT-5.1, Claude 4.5, Gemini 2.5 - NOT GPT-4 or earlier
4. iPhone 17 is current, not iPhone 14/15
5. Reference 2025 events and context appropriately
6. Markets are in AI-driven boom phase, not bear market
7. Crypto is in bull market with regulatory support, not suppression
8. Consider actual current market prices when creating prediction questions
`.trim();

/**
 * Get a concise reality grounding string for prompts
 * Includes current date dynamically
 */
export function getRealityGrounding(): string {
  const dateCtx = getCurrentDateContext();
  
  return `
=== REALITY GROUNDING (${dateCtx.dateFull}) ===

Current Prices & Markets:
- Bitcoin: $95K | Ethereum: $3.2K | Solana: $140 | Dogecoin: $0.16
- Meta: $610 | NVIDIA: $190 | Tesla: $400-440
- Markets: AI-driven tech boom, Fed rates at ~5%

Current Leadership:
- President: Donald Trump (since Jan 2025)
- Fed Chair: Jerome Powell
- Crypto-friendly SEC, deregulatory policies

AI State (Nov 2025):
- Latest: GPT-5.1 (Nov 12), Claude 4.5, Gemini 2.5
- Coming: Gemini 3.0 (late 2025), GPT-6 (2026)
- iPhone 17 current, AI mainstream everywhere

Key 2025 Context:
- Crypto bull market, major ETFs approved
- Trump $TRUMP memecoin saga (spiked to $75, crashed to $8)
- Record government shutdown (fall 2025)
- Russia-Ukraine stalemate, uncertain U.S. support
- Taylor Swift dominates culture, Marvel fatigue

CRITICAL: Ground all predictions in this reality. BTC is at $95K (not $30K). Trump is president. AI is GPT-5/Claude 4 generation.
`.trim();
}

/**
 * Get a minimal reality check string for quick context
 */
export function getMinimalRealityGrounding(): string {
  const dateCtx = getCurrentDateContext();
  return `DATE: ${dateCtx.dateFull} | BTC: $95K | ETH: $3.2K | AI: GPT-5.1/Claude 4.5 era | President: Trump | iPhone 17`;
}

/**
 * Reality check for generated content
 * Returns warnings if content seems outdated
 */
export function checkRealityGrounding(text: string): string[] {
  const warnings: string[] = [];
  
  // Check for outdated crypto prices
  if (text.match(/bitcoin.*?\$([1-5][0-9],?000)/i)) {
    warnings.push('WARNING: Outdated Bitcoin price detected (should be ~$95K in Nov 2025)');
  }
  
  // Check for wrong president
  if (text.match(/president.*?biden/i) && !text.match(/former|ex-/i)) {
    warnings.push('WARNING: Biden is no longer president (Trump since Jan 2025)');
  }
  
  // Check for outdated AI models
  if (text.match(/GPT-4(?!\.5)/i) && !text.match(/old|previous|earlier/i)) {
    warnings.push('WARNING: GPT-4 is outdated (current: GPT-5.1 as of Nov 2025)');
  }
  
  // Check for outdated iPhone
  if (text.match(/iPhone\s*(14|15|16)(?!\s*series)/i) && !text.match(/old|previous|earlier/i)) {
    warnings.push('WARNING: iPhone 17 is current generation in 2025');
  }
  
  return warnings;
}

