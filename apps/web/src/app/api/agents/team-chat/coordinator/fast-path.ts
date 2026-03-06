/**
 * Fast-Path Router for Coordinator (OPT-6)
 *
 * Classifies simple user messages to skip the LLM decision loop.
 * Extracted from route.ts for testability.
 */

/**
 * Verbs that indicate the user wants an agent to ACT, not just fetch info.
 * If any of these appear in the message, we must NOT fast-path — the LLM
 * decision loop is needed to handle dispatch logic.
 */
const AGENT_ACTION_VERBS =
  /\b(buy|sell|trade|open|close|post|comment|tell|ask|dispatch|send|create|make|write|reply|share|execute|place|submit|transfer)\b/i;

/** Greeting patterns — canned response, 0 LLM calls */
const GREETING_PATTERN =
  /^\s*(hey|hi|hello|howdy|sup|what'?s\s*up|yo|gm|good\s*morning|good\s*evening|good\s*afternoon)\s*[!?.]*\s*$/i;

export interface FastPathMatch {
  action: string;
  parameters: Record<string, unknown>;
}

/**
 * Attempt to classify a user message as a simple read-only query that can
 * skip the LLM decision loop entirely. Returns:
 * - `'greeting'` for simple greetings (canned response, 0 LLM calls)
 * - `FastPathMatch` for read-only data queries (skip decision, still do summary)
 * - `null` if the message needs the full LLM decision loop
 *
 * Safety: NEVER returns a match when AGENT_ACTION_VERBS are detected, since
 * those require dispatch routing which only the LLM can decide.
 */
export function tryFastPath(
  content: string
): FastPathMatch | 'greeting' | null {
  // Never fast-path if content contains agent action verbs (mixed intent)
  if (AGENT_ACTION_VERBS.test(content)) return null;

  // Greetings — full match only (no trailing question/complex sentence)
  if (GREETING_PATTERN.test(content)) return 'greeting';

  // CHECK_USER_PNL — portfolio/balance queries
  if (
    /\b(portfolio|balance|pnl|p\s*&\s*l|profit|loss|positions?|holdings?|my\s+account)\b/i.test(
      content
    )
  ) {
    return { action: 'CHECK_USER_PNL', parameters: {} };
  }

  // CHECK_RECENT_MARKET_TRADES — trading activity queries
  // Must come before CHECK_PERPS since "market trades/activity" overlaps "markets?"
  if (
    /\b(recent\s+trades?|market\s+(activity|trades?)|trading\s+(activity|history)|latest\s+trades?)\b/i.test(
      content
    )
  ) {
    return { action: 'CHECK_RECENT_MARKET_TRADES', parameters: {} };
  }

  // CHECK_PREDICTIONS — prediction market queries
  // Must come before CHECK_PERPS since "prediction markets" overlaps "markets?"
  if (
    /\b(predictions?|prediction\s+markets?|betting|bets?|events?\s+market)\b/i.test(
      content
    )
  ) {
    return { action: 'CHECK_PREDICTIONS', parameters: {} };
  }

  // CHECK_PERPS — market/price queries, with optional ticker extraction
  // Broad matcher — runs after more specific market-related patterns above
  if (
    /\b(price|prices|perps?|perpetuals?|stocks?|tickers?|markets?)\b/i.test(
      content
    )
  ) {
    const tickerMatch = content.match(
      /\b(TSLAI|NVDAI|AIPPL|AMSAI|GOAI|METAI|NFLAI)\b/i
    );
    const params: Record<string, unknown> = {};
    if (tickerMatch?.[1]) params.ticker = tickerMatch[1].toUpperCase();
    return { action: 'CHECK_PERPS', parameters: params };
  }

  // CHECK_FEED_POSTS — feed/social queries
  if (
    /\b(feed|posts?|trending|timeline|social|what'?s\s+happening)\b/i.test(
      content
    )
  ) {
    return { action: 'CHECK_FEED_POSTS', parameters: {} };
  }

  // CHECK_TEAM_CHAT — conversation history queries
  if (
    /\b(chat\s+history|conversation|chat\s+log|previous\s+messages?|what\s+did\s+.+\s+say)\b/i.test(
      content
    )
  ) {
    return { action: 'CHECK_TEAM_CHAT', parameters: {} };
  }

  return null;
}
