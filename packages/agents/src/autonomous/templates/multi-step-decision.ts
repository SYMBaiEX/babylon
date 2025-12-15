/**
 * Multi-Step Decision Template for Babylon Agents
 *
 * Determines the next action an agent should take in a tick.
 * Adapted from Otaku's multi-step pattern for Babylon's prediction market context.
 */

/**
 * Build the multi-step decision prompt for an agent tick
 */
export function buildMultiStepDecisionPrompt(params: {
  agentName: string;
  systemPrompt: string;
  iterationCount: number;
  maxIterations: number;
  traceActionResults: ActionTraceResult[];
  context: AgentTickContext;
}): string {
  const {
    agentName,
    systemPrompt,
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
              `${i + 1}. ${r.actionType}: ${r.success ? '✓ Success' : '✗ Failed'}${r.summary ? ` - ${r.summary}` : ''}${r.error ? ` (Error: ${r.error})` : ''}`
          )
          .join('\n')
      : 'No actions taken yet this tick.';

  return `${systemPrompt}

You are ${agentName}, an autonomous agent on Babylon prediction market.

# Current Execution Context
**Current Step**: ${iterationCount} of ${maxIterations} maximum iterations
**Actions Completed This Tick**: ${traceActionResults.length}
${traceActionResults.length > 0 ? `You have ALREADY taken ${traceActionResults.length} action(s) this tick. Review them before deciding.` : 'This is your FIRST decision - no actions taken yet.'}

# Your Current State
- Balance: $${context.balance.toFixed(2)}
- Lifetime P&L: ${context.pnl >= 0 ? '+' : ''}$${context.pnl.toFixed(2)}
- Open Positions: ${context.openPositions}
- Pending Interactions: ${context.pendingInteractions}

# Available Actions
${formatAvailableActions(context.enabledFeatures)}

# Market Opportunities
${formatMarketOpportunities(context.opportunities)}

# Pending Interactions
${formatPendingInteractions(context.pendingInteractionDetails)}

# Actions Completed This Tick
${actionsCompletedText}

# Decision Process
1. **Understand Current State**: What have you already done? What's most important now?
2. **Evaluate Redundancy vs Complementarity**:
   - ❌ AVOID: Repeating the SAME action with SAME parameters
   - ❌ AVOID: Multiple trades on the same market
   - ✅ ENCOURAGE: Different actions that provide different value
   - ✅ ENCOURAGE: Related actions that build on each other (e.g., respond to comment then post insight)
3. **Choose Next Action**: Based on what adds the MOST value right now
4. **Know When to Stop**: Set isFinish=true when you've done enough for this tick

# Decision Rules
1. **Step Awareness**: You are on step ${iterationCount}/${maxIterations}. Check what you've already done.
2. **Request Type**:
   - Trading: Execute trades when you see clear opportunities
   - Social: Respond to interactions, create content when valuable
   - Research: Analyze markets before trading if uncertain
3. **When to Finish** (isFinish: true):
   - You've taken 2-3 meaningful actions
   - No more valuable opportunities
   - You're about to repeat an identical action
   - Low balance and should preserve capital

# Output Format
Respond with ONLY this JSON structure:
{
  "thought": "Step ${iterationCount}/${maxIterations}. Actions taken: ${traceActionResults.length}. [Your reasoning about what to do next and why]",
  "action": "ACTION_NAME or empty string if finishing",
  "parameters": { /* action-specific parameters */ },
  "isFinish": true | false
}

Available action names: ${context.enabledFeatures.map((f) => getActionName(f)).join(', ')}, or "" to finish

Your decision (JSON only):`;
}

/**
 * Build the summary prompt after multi-step execution completes
 */
export function buildMultiStepSummaryPrompt(params: {
  agentName: string;
  systemPrompt: string;
  traceActionResults: ActionTraceResult[];
  context: AgentTickContext;
}): string {
  const { agentName, systemPrompt, traceActionResults, context } = params;

  const resultsText = traceActionResults
    .map(
      (r, i) =>
        `${i + 1}. ${r.actionType}: ${r.success ? 'Success' : 'Failed'}
   ${r.summary || 'No details'}
   ${r.result ? `Result: ${JSON.stringify(r.result)}` : ''}`
    )
    .join('\n\n');

  return `${systemPrompt}

You are ${agentName}. You just completed an autonomous tick with the following actions:

# Actions Taken
${resultsText || 'No actions were taken this tick.'}

# Current State After Actions
- Balance: $${context.balance.toFixed(2)}
- P&L: ${context.pnl >= 0 ? '+' : ''}$${context.pnl.toFixed(2)}
- Open Positions: ${context.openPositions}

# Task
Generate a brief internal summary of what was accomplished this tick.
This is for logging purposes, not user-facing.

Respond with JSON:
{
  "summary": "Brief summary of actions taken and outcomes",
  "nextTickPriority": "What should be prioritized next tick (trading/social/research)"
}`;
}

// =============================================================================
// Types
// =============================================================================

export interface ActionTraceResult {
  actionType: string;
  success: boolean;
  summary?: string;
  error?: string;
  result?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  timestamp: number;
}

export interface AgentTickContext {
  balance: number;
  pnl: number;
  openPositions: number;
  pendingInteractions: number;
  pendingInteractionDetails: PendingInteraction[];
  enabledFeatures: string[];
  opportunities: MarketOpportunity[];
}

export interface PendingInteraction {
  type: 'comment_reply' | 'dm' | 'mention';
  author: string;
  content: string;
  postId?: string;
}

export interface MarketOpportunity {
  type: 'prediction' | 'perp';
  id: string;
  name: string;
  description: string;
  confidence: number;
}

export interface MultiStepDecision {
  thought: string;
  action: string;
  parameters: Record<string, unknown>;
  isFinish: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function formatAvailableActions(enabledFeatures: string[]): string {
  const actions: string[] = [];

  if (enabledFeatures.includes('trading')) {
    actions.push(`- TRADE: Buy/sell on prediction markets or open/close perp positions
    Parameters: { type: "prediction"|"perp", market: "id or name", action: "buy_yes"|"buy_no"|"open_long"|"open_short"|"close", amount: number }`);
  }

  if (enabledFeatures.includes('posting')) {
    actions.push(`- POST: Create a new post sharing insights or analysis
    Parameters: { content: "your post content" }`);
  }

  if (enabledFeatures.includes('commenting')) {
    actions.push(`- COMMENT: Reply to a post or comment
    Parameters: { targetId: "post or comment id", content: "your reply" }`);
  }

  if (enabledFeatures.includes('DMs')) {
    actions.push(`- DM: Send a direct message
    Parameters: { userId: "recipient id", content: "your message" }`);
  }

  actions.push(`- WAIT: Do nothing this iteration (use when no good opportunities)
    Parameters: {}`);

  return actions.join('\n\n');
}

function formatMarketOpportunities(opportunities: MarketOpportunity[]): string {
  if (opportunities.length === 0) {
    return 'No notable opportunities detected.';
  }

  return opportunities
    .slice(0, 5)
    .map(
      (o) =>
        `- [${o.type.toUpperCase()}] ${o.name}: ${o.description} (Confidence: ${(o.confidence * 100).toFixed(0)}%)`
    )
    .join('\n');
}

function formatPendingInteractions(interactions: PendingInteraction[]): string {
  if (interactions.length === 0) {
    return 'No pending interactions.';
  }

  return interactions
    .slice(0, 5)
    .map(
      (i) =>
        `- [${i.type}] @${i.author}: "${i.content.substring(0, 80)}${i.content.length > 80 ? '...' : ''}"`
    )
    .join('\n');
}

function getActionName(feature: string): string {
  switch (feature) {
    case 'trading':
      return 'TRADE';
    case 'posting':
      return 'POST';
    case 'commenting':
      return 'COMMENT';
    case 'DMs':
      return 'DM';
    default:
      return feature.toUpperCase();
  }
}
