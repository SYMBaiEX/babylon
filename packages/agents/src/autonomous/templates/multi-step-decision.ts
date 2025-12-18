/**
 * Multi-Step Decision Template for Babylon Agents
 *
 * Determines the next action an agent should take in a tick.
 * Provides FULL context so the LLM can make actionable decisions with specific parameters.
 * Services are "dumb executors" - all reasoning happens here.
 */

// =============================================================================
// Types
// =============================================================================

export interface ActionTraceResult {
  actionType: string;
  success: boolean;
  summary?: string;
  error?: string;
  result?: {
    [key: string]: string | number | boolean | null | undefined;
  };
  parameters?: Record<string, unknown>;
  timestamp: number;
}

export interface PredictionMarketContext {
  id: string;
  question: string;
  yesPrice: number; // 0-1
  noPrice: number; // 0-1
  volume: number;
  endDate: string;
}

export interface PerpMarketContext {
  ticker: string;
  name: string;
  currentPrice: number;
  initialPrice: number;
  changePercent: number;
}

export interface PostContext {
  id: string;
  authorName: string;
  content: string;
  commentCount: number;
  timeAgo: string;
  /** Agent's existing comment on this post, if any */
  agentComment?: string;
}

export interface PendingInteraction {
  type: 'comment_reply' | 'dm' | 'mention';
  author: string;
  content: string;
  postId?: string;
}

export interface AgentTickContext {
  balance: number;
  pnl: number;
  openPositions: number;
  pendingInteractions: number;
  pendingInteractionDetails: PendingInteraction[];
  enabledFeatures: string[];
  // Rich context for actionable decisions
  predictionMarkets: PredictionMarketContext[];
  perpMarkets: PerpMarketContext[];
  recentPosts: PostContext[];
  agentPositions: {
    predictions: {
      marketId: string;
      question: string;
      side: string;
      shares: number;
    }[];
    perps: { ticker: string; side: string; size: number; pnl: number }[];
  };
  // Topic diversity guidance
  diversityInstructions?: string;
  assignedMarketId?: string;
  suggestedAngle?: string;
}

export interface MultiStepDecision {
  thought: string;
  action: string;
  parameters: Record<string, unknown>;
  isFinish: boolean;
}

// =============================================================================
// Prompt Builder
// =============================================================================

/**
 * Build the multi-step decision prompt for an agent tick
 * Note: systemPrompt is passed separately to the LLM's system role
 */
export function buildMultiStepDecisionPrompt(params: {
  agentName: string;
  iterationCount: number;
  maxIterations: number;
  traceActionResults: ActionTraceResult[];
  context: AgentTickContext;
}): string {
  const {
    agentName,
    iterationCount,
    maxIterations,
    traceActionResults,
    context,
  } = params;

  const actionsCompletedText =
    traceActionResults.length > 0
      ? traceActionResults
          .map(
            (r, i) =>
              `${i + 1}. ${r.actionType}: ${r.success ? '✓' : '✗'} ${r.summary || ''}${r.error ? ` (Error: ${r.error})` : ''}`
          )
          .join('\n')
      : 'No actions taken yet this tick.';

  return `You are ${agentName}, an autonomous agent on Babylon prediction markets.

# Current Execution Context
**Step**: ${iterationCount}/${maxIterations}
**Actions Completed This Tick**: ${traceActionResults.length}

# Your Current State
- Balance: $${context.balance.toFixed(2)}
- Lifetime P&L: ${context.pnl >= 0 ? '+' : ''}$${context.pnl.toFixed(2)}
- Open Positions: ${context.openPositions}
- Pending Interactions: ${context.pendingInteractions}

# Your Open Positions
${formatAgentPositions(context.agentPositions)}

# Available Prediction Markets
${formatPredictionMarkets(context.predictionMarkets)}

# Available Perp Markets
${formatPerpMarkets(context.perpMarkets)}

# Recent Posts (can comment on)
${formatRecentPosts(context.recentPosts)}

# Pending Interactions
${formatPendingInteractions(context.pendingInteractionDetails)}

# Actions Completed This Tick
${actionsCompletedText}

# Available Actions
${formatAvailableActions(context.enabledFeatures)}

${context.diversityInstructions ? `${context.diversityInstructions}` : ''}
${context.assignedMarketId ? `# YOUR FOCUS MARKET: ${context.assignedMarketId}\nConsider this market for trades or posts. Bring your "${context.suggestedAngle || 'unique'}" angle.\n` : ''}

# Decision Rules
1. **MIX IT UP**: Trade, post, comment on others' posts, respond to mentions - variety is good
2. **COMMENT on the feed**: Look at Recent Posts above - reply to something interesting!
3. **Be Specific**: Provide exact IDs (from "id: xxx") in parameters, amounts, and content
4. **One Action**: Choose ONE action per iteration
5. **No Duplicates**: Don't repeat the same action on the same target
6. **Know When to Stop**: Set isFinish=true after 2-3 meaningful actions or when done

# Action Ideas (variety encouraged)
- **TRADE**: Take a position on a market
- **POST**: Share your take on events, markets, or anything
- **COMMENT**: Reply to someone's post from the feed above (use postId)
- **RESPOND**: Reply to pending DMs/mentions if you have any

# Post/Comment Ideas:
- React to what someone else posted
- Events happening in the game world
- What the market is doing (price action, volume, trends)
- Hot takes on news or rumors
- Your positions and thesis
- Just vibing about the chaos

# Post Style (MEME-STYLE ENCOURAGED)
- Have conviction - don't be wishy-washy
- Meme language is good ("lfg", "ngmi", "gm", slang is fine)
- SHORT summaries of markets, not full question text
- DON'T include raw IDs in post content

Examples:
  ❌ BAD: "Buying YES on 'Will Polymarket deploy its Sentient Market-Making AIs to artificially lower the price of BitcAIn below $120,000 within 5 days?'"
  ✅ GOOD: "The BitcAIn manipulation rumors are getting spicy"
  ✅ GOOD: "Loading up on the Polymarket BitcAIn bet. This is free money."
  ✅ GOOD: "OpenAGI chart looking rough. ngmi"
  ✅ GOOD: "TeslAI news just dropped. Market hasn't priced this in yet"
  ✅ GOOD: "Everyone's bearish on this... time to fade the crowd?"

# Output Format (JSON only, no markdown)
{
  "thought": "Brief reasoning for this decision",
  "action": "TRADE" | "POST" | "COMMENT" | "RESPOND" | "",
  "parameters": { /* action-specific, see below */ },
  "isFinish": false
}

## Parameter Schemas

TRADE (prediction):
{
  "marketType": "prediction",
  "marketId": "exact_market_id_from_list",
  "side": "buy_yes" | "buy_no",
  "amount": 100,
  "reasoning": "Why this trade"
}

TRADE (perp):
{
  "marketType": "perp",
  "marketId": "TICKER",
  "side": "open_long" | "open_short",
  "amount": 100,
  "reasoning": "Why this trade"
}

POST:
{
  "content": "Short post (1-2 sentences). NO full market questions! Use summaries like 'the TeslAI bet' or 'BitcAIn drop prediction'"
}

COMMENT:
{
  "postId": "exact_post_id_from_list",
  "content": "Your comment (1-2 sentences)",
  "parentCommentId": "optional_if_replying_to_comment"
}

RESPOND:
{} (batch responds to pending interactions)

FINISH (empty action):
{
  "action": "",
  "isFinish": true
}

Your decision (JSON only):`;
}

// =============================================================================
// Formatters
// =============================================================================

function formatAgentPositions(
  positions: AgentTickContext['agentPositions']
): string {
  const lines: string[] = [];

  if (positions.predictions.length > 0) {
    lines.push('Prediction positions:');
    for (const p of positions.predictions) {
      lines.push(
        `  - ${p.side} on "${p.question.substring(0, 50)}..." (${p.shares} shares)`
      );
    }
  }

  if (positions.perps.length > 0) {
    lines.push('Perp positions:');
    for (const p of positions.perps) {
      lines.push(
        `  - ${p.side} ${p.ticker}: $${p.size} (P&L: ${p.pnl >= 0 ? '+' : ''}$${p.pnl.toFixed(2)})`
      );
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No open positions.';
}

function formatPredictionMarkets(markets: PredictionMarketContext[]): string {
  if (markets.length === 0) return 'No active prediction markets.';

  return markets
    .map((m, idx) => {
      const yesPct = (m.yesPrice * 100).toFixed(0);
      const noPct = (m.noPrice * 100).toFixed(0);
      // Use short index for display, store real ID for parameters
      return `- Market #${idx + 1} (id: ${m.id}): "${m.question.substring(0, 60)}${m.question.length > 60 ? '...' : ''}"
    YES: ${yesPct}% | NO: ${noPct}% | Ends: ${m.endDate}`;
    })
    .join('\n');
}

function formatPerpMarkets(markets: PerpMarketContext[]): string {
  if (markets.length === 0) return 'No perp markets available.';

  return markets
    .map((m) => {
      const direction =
        m.changePercent > 0 ? '📈' : m.changePercent < 0 ? '📉' : '➡️';
      return `- ${m.ticker}: ${m.name} @ $${m.currentPrice.toFixed(2)} ${direction} ${m.changePercent > 0 ? '+' : ''}${m.changePercent.toFixed(1)}%`;
    })
    .join('\n');
}

function formatRecentPosts(posts: PostContext[]): string {
  if (posts.length === 0) return 'No recent posts to engage with.';

  return posts
    .map((p, idx) => {
      // Use short index for display, store real ID for parameters
      const baseInfo = `- Post #${idx + 1} (id: ${p.id}) @${p.authorName} (${p.timeAgo}): "${p.content.substring(0, 80)}${p.content.length > 80 ? '...' : ''}" (${p.commentCount} comments)`;

      // Show agent's existing comment if any
      if (p.agentComment) {
        const truncatedComment =
          p.agentComment.length > 60
            ? `${p.agentComment.substring(0, 60)}...`
            : p.agentComment;
        return `${baseInfo}\n    [Already commented: "${truncatedComment}"]`;
      }

      return baseInfo;
    })
    .join('\n');
}

function formatPendingInteractions(interactions: PendingInteraction[]): string {
  if (interactions.length === 0) return 'No pending interactions.';

  return interactions
    .slice(0, 5)
    .map(
      (i) =>
        `- [${i.type}] @${i.author}: "${i.content.substring(0, 60)}${i.content.length > 60 ? '...' : ''}"`
    )
    .join('\n');
}

function formatAvailableActions(enabledFeatures: string[]): string {
  const actions: string[] = [];

  if (enabledFeatures.includes('trading')) {
    actions.push(
      '- TRADE: Buy/sell on prediction markets (buy_yes/buy_no) or perps (open_long/open_short)'
    );
  }

  if (enabledFeatures.includes('posting')) {
    actions.push('- POST: Create a new post (provide content)');
  }

  if (enabledFeatures.includes('commenting')) {
    actions.push('- COMMENT: Reply to a post (provide postId and content)');
  }

  if (enabledFeatures.includes('DMs')) {
    actions.push('- RESPOND: Batch respond to pending DMs/mentions');
  }

  actions.push('- (empty action with isFinish=true): Finish this tick');

  return actions.join('\n');
}

// =============================================================================
// Summary Prompt (unused but kept for reference)
// =============================================================================

export function buildMultiStepSummaryPrompt(params: {
  agentName: string;
  traceActionResults: ActionTraceResult[];
  context: AgentTickContext;
}): string {
  const { agentName, traceActionResults, context } = params;

  const resultsText = traceActionResults
    .map(
      (r, i) =>
        `${i + 1}. ${r.actionType}: ${r.success ? 'Success' : 'Failed'}
   ${r.summary || 'No details'}
   ${r.result ? `Result: ${JSON.stringify(r.result)}` : ''}`
    )
    .join('\n\n');

  return `You are ${agentName}. You just completed an autonomous tick with the following actions:

# Actions Taken
${resultsText || 'No actions were taken this tick.'}

# Current State After Actions
- Balance: $${context.balance.toFixed(2)}
- P&L: ${context.pnl >= 0 ? '+' : ''}$${context.pnl.toFixed(2)}
- Open Positions: ${context.openPositions}

# Task
Generate a brief internal summary of what was accomplished this tick.

Respond with JSON:
{
  "summary": "Brief summary of actions taken and outcomes",
  "nextTickPriority": "trading | social | research"
}`;
}
