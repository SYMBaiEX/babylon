/**
 * Multi-Step Executor for Autonomous Agent Ticks
 *
 * Implements an iterative decision loop where the LLM decides what action to take
 * based on current state and previous actions taken this tick.
 *
 * Key design: Services are "dumb executors" - all LLM reasoning happens HERE.
 * This eliminates double LLM calls and makes execution faster.
 */

import {
  actorState,
  and,
  comments,
  db,
  desc,
  eq,
  getDbInstance,
  gte,
  inArray,
  isNull,
  lte,
  markets,
  ne,
  perpPositions,
  positions,
  posts,
  users,
} from '@babylon/db';
import { StaticDataRegistry, WalletService } from '@babylon/engine';
import type { IAgentRuntime } from '@elizaos/core';
import { callGroqDirect } from '../llm/direct-groq';
import { getNpcGameContext } from '../plugins/babylon/providers/npc-game-context';
import { getAgentConfig } from '../shared/agent-config';
import { logger } from '../shared/logger';
import { autonomousBatchResponseService } from './AutonomousBatchResponseService';
import {
  executeDirectComment,
  executeDirectPost,
  executeDirectTrade,
} from './DirectExecutors';
import { topicDiversityService } from './TopicDiversityService';

/** Default trading balance for NPCs without actorState record */
const DEFAULT_NPC_BALANCE = 10000;

import {
  type ActionTraceResult,
  type AgentTickContext,
  buildMultiStepDecisionPrompt,
  type MultiStepDecision,
  type PerpMarketContext,
  type PostContext,
  type PredictionMarketContext,
} from './templates/multi-step-decision';

// =============================================================================
// Types
// =============================================================================

export interface MultiStepExecutorResult {
  success: boolean;
  actionsExecuted: {
    trades: number;
    posts: number;
    comments: number;
    messages: number;
  };
  iterations: number;
  trace: ActionTraceResult[];
  duration: number;
}

// =============================================================================
// Multi-Step Executor
// =============================================================================

export class MultiStepExecutor {
  private readonly maxIterations: number;

  constructor(maxIterations = 5) {
    this.maxIterations = maxIterations;
  }

  /**
   * Execute a multi-step autonomous tick for an agent
   *
   * The LLM decides what action to take at each step, seeing the results
   * of previous actions to make informed decisions.
   *
   * @param agentUserId - User ID for USER_CONTROLLED agents, or agentId for NPCs
   * @param runtime - Agent runtime
   * @param isNpc - Whether this is an NPC agent (skips User table lookup)
   */
  async execute(
    agentUserId: string,
    runtime: IAgentRuntime,
    isNpc = false
  ): Promise<MultiStepExecutorResult> {
    const startTime = Date.now();
    const trace: ActionTraceResult[] = [];

    logger.info(
      `[MultiStep] Starting multi-step execution for agent ${agentUserId}`,
      undefined,
      'MultiStepExecutor'
    );

    // Get agent info (for USER_CONTROLLED agents)
    let agent: typeof users.$inferSelect | undefined;
    if (!isNpc) {
      const [userAgent] = await db
        .select()
        .from(users)
        .where(eq(users.id, agentUserId))
        .limit(1);

      if (!userAgent) {
        throw new Error('Agent not found');
      }
      agent = userAgent;
    }

    // Get agent config (may be null for NPCs)
    const config = await getAgentConfig(agentUserId);
    const systemPrompt =
      config?.systemPrompt ?? 'You are an autonomous trading agent on Babylon.';

    // Determine enabled features - NPCs have all features enabled by default
    const enabledFeatures: string[] = [];
    if (isNpc) {
      enabledFeatures.push('trading', 'posting', 'commenting', 'DMs');
    } else {
      if (config?.autonomousTrading) enabledFeatures.push('trading');
      if (config?.autonomousPosting) enabledFeatures.push('posting');
      if (config?.autonomousCommenting) enabledFeatures.push('commenting');
      if (config?.autonomousDMs) enabledFeatures.push('DMs');
    }

    // Get NPC game context ONCE before loop (arc awareness, world events)
    // Graceful degradation: if context fetch fails, continue without it
    let npcGameContext = '';
    if (isNpc) {
      try {
        npcGameContext = await getNpcGameContext(agentUserId);
      } catch (error) {
        logger.warn(
          'Failed to get NPC game context, continuing without it',
          {
            agentUserId,
            error: error instanceof Error ? error.message : String(error),
          },
          'MultiStepExecutor'
        );
      }
    }

    // Main iteration loop
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      logger.info(
        `[MultiStep] Iteration ${iteration}/${this.maxIterations}`,
        { agentUserId, actionsCompleted: trace.length },
        'MultiStepExecutor'
      );

      // Gather fresh context (state refreshes after each action)
      const context = await this.gatherContext(
        agentUserId,
        enabledFeatures,
        isNpc
      );

      // Build decision prompt (systemPrompt passed separately to LLM system role)
      // For NPCs, get name from StaticDataRegistry; for users, use displayName
      const agentName = isNpc
        ? (StaticDataRegistry.getActor(agentUserId)?.name ?? agentUserId)
        : (agent?.displayName ?? agentUserId);
      const prompt = buildMultiStepDecisionPrompt({
        agentName,
        iterationCount: iteration,
        maxIterations: this.maxIterations,
        traceActionResults: trace,
        context,
        isNpc,
        npcGameContext,
      });

      // Get LLM decision
      const decision = await this.getDecision(
        prompt,
        runtime,
        iteration,
        systemPrompt
      );

      if (!decision) {
        logger.warn(
          `[MultiStep] Failed to parse decision at iteration ${iteration}, finishing`,
          undefined,
          'MultiStepExecutor'
        );
        break;
      }

      logger.info(
        `[MultiStep] Decision: ${decision.action || 'FINISH'}`,
        {
          thought: decision.thought.substring(0, 100),
          isFinish: decision.isFinish,
        },
        'MultiStepExecutor'
      );

      // Check if we should finish
      if (decision.isFinish || !decision.action) {
        logger.info(
          `[MultiStep] Agent decided to finish at iteration ${iteration}`,
          { thought: decision.thought },
          'MultiStepExecutor'
        );
        break;
      }

      // Execute the chosen action with parameters
      const actionResult = await this.executeAction(
        agentUserId,
        decision.action,
        decision.parameters
      );

      trace.push(actionResult);

      // Small delay between iterations (reduced since no double LLM calls)
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Aggregate results
    const result = this.aggregateResults(trace, startTime);

    logger.info(
      `[MultiStep] Completed in ${result.duration}ms with ${result.iterations} iterations`,
      {
        trades: result.actionsExecuted.trades,
        posts: result.actionsExecuted.posts,
        comments: result.actionsExecuted.comments,
        messages: result.actionsExecuted.messages,
      },
      'MultiStepExecutor'
    );

    return result;
  }

  /**
   * Gather current context for decision making
   * Includes FULL market data so LLM can make specific decisions
   * Now includes topic diversity guidance
   */
  private async gatherContext(
    agentUserId: string,
    enabledFeatures: string[],
    isNpc: boolean
  ): Promise<AgentTickContext> {
    // Get balance and PnL
    let balance = 0;
    let pnl = 0;

    if (isNpc) {
      const [actor] = await db
        .select({ tradingBalance: actorState.tradingBalance })
        .from(actorState)
        .where(eq(actorState.id, agentUserId))
        .limit(1);

      if (!actor?.tradingBalance) {
        logger.warn(
          `NPC ${agentUserId} missing actorState - using default balance`,
          { defaultBalance: DEFAULT_NPC_BALANCE },
          'MultiStepExecutor'
        );
      }
      balance = Number(actor?.tradingBalance ?? DEFAULT_NPC_BALANCE);
      pnl = 0;
    } else {
      const walletBalance = await WalletService.getBalance(agentUserId);
      balance = walletBalance.balance;
      pnl = walletBalance.lifetimePnL;
    }

    // Get prediction markets
    const predictionMarkets = await this.getPredictionMarkets();

    // Get perp markets
    const perpMarkets = await this.getPerpMarkets();

    // Get agent's positions
    const agentPositions = await this.getAgentPositions(agentUserId);

    // Get recent posts to engage with
    const recentPosts = await this.getRecentPosts(agentUserId);

    // Get pending interactions
    const pendingInteractions =
      await autonomousBatchResponseService.gatherPendingInteractions(
        agentUserId
      );

    // Get topic diversity guidance for this agent
    const diversityInstructions =
      topicDiversityService.getDiversityInstructions(agentUserId);
    const assignment = topicDiversityService.getAgentAssignment(agentUserId);

    return {
      balance,
      pnl,
      openPositions:
        agentPositions.predictions.length + agentPositions.perps.length,
      pendingInteractions: pendingInteractions.length,
      pendingInteractionDetails: pendingInteractions.slice(0, 5).map((i) => ({
        type: i.type as 'comment_reply' | 'dm' | 'mention',
        author: i.author,
        content: i.content,
        postId: i.postId,
      })),
      enabledFeatures,
      predictionMarkets,
      perpMarkets,
      recentPosts,
      agentPositions,
      // Topic diversity
      diversityInstructions,
      assignedMarketId: assignment?.marketId,
      // NPC's actual character data for personalized guidance
      personality: assignment?.personality,
      postStyle: assignment?.postStyle,
    };
  }

  /**
   * Get active prediction markets with pricing
   */
  private async getPredictionMarkets(): Promise<PredictionMarketContext[]> {
    const activeMarkets = await db
      .select()
      .from(markets)
      .where(and(eq(markets.resolved, false), gte(markets.endDate, new Date())))
      .orderBy(desc(markets.createdAt))
      .limit(8);

    return activeMarkets.map((m) => {
      const yesShares = Number(m.yesShares || 1);
      const noShares = Number(m.noShares || 1);
      const total = yesShares + noShares;

      return {
        id: m.id,
        question: m.question,
        yesPrice: yesShares / total,
        noPrice: noShares / total,
        volume: total,
        endDate: m.endDate?.toISOString().split('T')[0] ?? 'Unknown',
      };
    });
  }

  /**
   * Get perp markets with current prices
   */
  private async getPerpMarkets(): Promise<PerpMarketContext[]> {
    const orgStates = await getDbInstance().getOrganizationsByPrice();

    return orgStates
      .slice(0, 8)
      .map((state) => {
        const staticOrg = StaticDataRegistry.getOrganization(state.id);
        if (!staticOrg || staticOrg.type !== 'company') return null;

        const currentPrice =
          state.currentPrice ?? staticOrg.initialPrice ?? 100;
        const initialPrice = staticOrg.initialPrice ?? 100;
        const changePercent =
          ((currentPrice - initialPrice) / initialPrice) * 100;

        return {
          ticker: staticOrg.ticker,
          name: staticOrg.name,
          currentPrice,
          initialPrice,
          changePercent,
        };
      })
      .filter((m): m is PerpMarketContext => m !== null);
  }

  /**
   * Get agent's current positions
   */
  private async getAgentPositions(agentUserId: string): Promise<{
    predictions: {
      marketId: string;
      question: string;
      side: string;
      shares: number;
    }[];
    perps: { ticker: string; side: string; size: number; pnl: number }[];
  }> {
    // Prediction positions
    const predPositions = await db
      .select({
        marketId: positions.marketId,
        side: positions.side,
        shares: positions.shares,
      })
      .from(positions)
      .where(
        and(eq(positions.userId, agentUserId), eq(positions.status, 'active'))
      )
      .limit(10);

    // Get market questions for positions
    const marketIds = predPositions
      .map((p) => p.marketId)
      .filter(Boolean) as string[];
    const marketQuestions = new Map<string, string>();
    if (marketIds.length > 0) {
      const marketData = await db
        .select({ id: markets.id, question: markets.question })
        .from(markets);
      for (const m of marketData) {
        if (marketIds.includes(m.id)) {
          marketQuestions.set(m.id, m.question);
        }
      }
    }

    const predictions = predPositions
      .filter((p) => p.marketId)
      .map((p) => ({
        marketId: p.marketId as string,
        question: marketQuestions.get(p.marketId as string) ?? 'Unknown',
        side: p.side ? 'YES' : 'NO',
        shares: Number(p.shares || 0),
      }));

    // Perp positions
    const perpPositionsList = await db
      .select({
        ticker: perpPositions.ticker,
        side: perpPositions.side,
        size: perpPositions.size,
        unrealizedPnL: perpPositions.unrealizedPnL,
      })
      .from(perpPositions)
      .where(
        and(
          eq(perpPositions.userId, agentUserId),
          isNull(perpPositions.closedAt)
        )
      )
      .limit(10);

    const perps = perpPositionsList.map((p) => ({
      ticker: p.ticker,
      side: p.side,
      size: Number(p.size || 0),
      pnl: Number(p.unrealizedPnL || 0),
    }));

    return { predictions, perps };
  }

  /**
   * Get recent posts to potentially engage with
   * Includes agent's existing comments so the LLM knows what it already said
   */
  private async getRecentPosts(agentUserId: string): Promise<PostContext[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();

    const recentPostsRaw = await db
      .select({
        id: posts.id,
        content: posts.content,
        authorId: posts.authorId,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(
        and(
          ne(posts.authorId, agentUserId),
          isNull(posts.deletedAt),
          gte(posts.timestamp, oneDayAgo),
          lte(posts.timestamp, now)
        )
      )
      .orderBy(desc(posts.createdAt))
      .limit(8);

    // Get author names
    const authorIds = [...new Set(recentPostsRaw.map((p) => p.authorId))];
    const authorNames = new Map<string, string>();

    for (const authorId of authorIds) {
      // Check static registry first
      const actor = StaticDataRegistry.getActor(authorId);
      if (actor) {
        authorNames.set(authorId, actor.name);
        continue;
      }
      const org = StaticDataRegistry.getOrganization(authorId);
      if (org) {
        authorNames.set(authorId, org.name);
        continue;
      }
    }

    // Fetch remaining from DB
    const missingIds = authorIds.filter((id) => !authorNames.has(id));
    if (missingIds.length > 0) {
      const dbUsers = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          username: users.username,
        })
        .from(users);
      for (const u of dbUsers) {
        if (missingIds.includes(u.id)) {
          authorNames.set(u.id, u.displayName || u.username || 'User');
        }
      }
    }

    // Fetch agent's existing comments on these posts (top-level only)
    const postIds = recentPostsRaw.map((p) => p.id);
    const agentComments = new Map<string, string>();

    if (postIds.length > 0) {
      const existingComments = await db
        .select({
          postId: comments.postId,
          content: comments.content,
        })
        .from(comments)
        .where(
          and(
            inArray(comments.postId, postIds),
            eq(comments.authorId, agentUserId),
            isNull(comments.parentCommentId), // Top-level comments only
            isNull(comments.deletedAt)
          )
        );

      for (const comment of existingComments) {
        if (comment.postId) {
          agentComments.set(comment.postId, comment.content);
        }
      }
    }

    return recentPostsRaw.map((p) => ({
      id: p.id,
      authorName: authorNames.get(p.authorId) || 'User',
      content: p.content,
      commentCount: 0, // Simplified - could add actual count if needed
      timeAgo: getTimeAgo(p.createdAt),
      agentComment: agentComments.get(p.id),
    }));
  }

  /**
   * Get LLM decision with retry logic
   */
  private async getDecision(
    prompt: string,
    runtime: IAgentRuntime,
    _iteration: number,
    systemPrompt?: string
  ): Promise<MultiStepDecision | null> {
    const maxRetries = 3;

    // Use agent's system prompt + JSON instruction
    const system = systemPrompt
      ? `${systemPrompt}\n\nIMPORTANT: Output valid JSON only. No markdown, no explanations.`
      : 'You are a decision-making agent. Output valid JSON only. No markdown, no explanations.';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await callGroqDirect({
        prompt,
        system,
        runtime,
        temperature: attempt > 1 ? 0.5 : 0.7,
        maxTokens: 1000,
        actionType: 'multi_step_decision',
        purpose: 'action',
      });

      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(
          `[MultiStep] No JSON found in response (attempt ${attempt})`,
          { responsePreview: response.substring(0, 200) },
          'MultiStepExecutor'
        );
        continue;
      }

      try {
        const parsed = JSON.parse(jsonMatch[0]) as MultiStepDecision;

        // Validate required fields
        if (typeof parsed.isFinish !== 'boolean') {
          parsed.isFinish = false;
        }
        if (!parsed.action) {
          parsed.action = '';
        }
        if (!parsed.parameters) {
          parsed.parameters = {};
        }
        if (!parsed.thought) {
          parsed.thought = '';
        }

        return parsed;
      } catch {
        logger.warn(
          `[MultiStep] Failed to parse JSON (attempt ${attempt})`,
          { json: jsonMatch[0].substring(0, 200) },
          'MultiStepExecutor'
        );
      }
    }

    return null;
  }

  /**
   * Execute a single action using DIRECT executors (no LLM calls)
   */
  private async executeAction(
    agentUserId: string,
    action: string,
    parameters: Record<string, unknown>
  ): Promise<ActionTraceResult> {
    const normalizedAction = action.toUpperCase();

    logger.info(
      `[MultiStep] Executing action: ${normalizedAction}`,
      { parameters },
      'MultiStepExecutor'
    );

    switch (normalizedAction) {
      case 'TRADE': {
        const marketType = parameters.marketType as 'prediction' | 'perp';
        const marketId = parameters.marketId as string;
        const side = parameters.side as
          | 'buy_yes'
          | 'buy_no'
          | 'open_long'
          | 'open_short';
        const amount = Number(parameters.amount || 100);
        const reasoning = parameters.reasoning as string | undefined;

        if (!marketId || !side) {
          return {
            actionType: 'TRADE',
            success: false,
            summary: 'Missing required parameters (marketId, side)',
            error: 'Invalid parameters',
            parameters,
            timestamp: Date.now(),
          };
        }

        const tradeResult = await executeDirectTrade({
          agentUserId,
          marketType: marketType || 'prediction',
          marketId,
          side,
          amount,
          reasoning,
        });

        return {
          actionType: 'TRADE',
          success: tradeResult.success,
          summary: tradeResult.success
            ? `Traded ${side} $${amount} on ${tradeResult.marketId || tradeResult.ticker}`
            : `Trade failed: ${tradeResult.error}`,
          result: {
            success: tradeResult.success,
            marketId: tradeResult.marketId,
            ticker: tradeResult.ticker,
            side: tradeResult.side,
            shares: tradeResult.shares,
            error: tradeResult.error,
          },
          parameters,
          timestamp: Date.now(),
        };
      }

      case 'POST': {
        const content = parameters.content as string;

        if (!content) {
          return {
            actionType: 'POST',
            success: false,
            summary: 'Missing content parameter',
            error: 'No content provided',
            parameters,
            timestamp: Date.now(),
          };
        }

        const postResult = await executeDirectPost({
          agentUserId,
          content,
        });

        return {
          actionType: 'POST',
          success: postResult.success,
          summary: postResult.success
            ? `Created post ${postResult.postId}`
            : `Post failed: ${postResult.error}`,
          result: {
            success: postResult.success,
            postId: postResult.postId,
            error: postResult.error,
          },
          parameters,
          timestamp: Date.now(),
        };
      }

      case 'COMMENT': {
        const postId = parameters.postId as string;
        const content = parameters.content as string;
        const parentCommentId = parameters.parentCommentId as
          | string
          | undefined;

        if (!postId || !content) {
          return {
            actionType: 'COMMENT',
            success: false,
            summary: 'Missing required parameters (postId, content)',
            error: 'Invalid parameters',
            parameters,
            timestamp: Date.now(),
          };
        }

        const commentResult = await executeDirectComment({
          agentUserId,
          postId,
          content,
          parentCommentId,
        });

        return {
          actionType: 'COMMENT',
          success: commentResult.success,
          summary: commentResult.success
            ? `Created comment ${commentResult.commentId}`
            : `Comment failed: ${commentResult.error}`,
          result: {
            success: commentResult.success,
            commentId: commentResult.commentId,
            error: commentResult.error,
          },
          parameters,
          timestamp: Date.now(),
        };
      }

      case 'RESPOND': {
        // RESPOND still uses the batch service which has its own LLM
        // for deciding WHICH interactions to respond to
        // This is acceptable as it's a different kind of decision
        const responses = await autonomousBatchResponseService.processBatch(
          agentUserId,
          {} as IAgentRuntime // Runtime not needed for batch response
        );

        return {
          actionType: 'RESPOND',
          success: responses > 0,
          summary: `Responded to ${responses} interaction(s)`,
          result: { responsesCreated: responses },
          parameters,
          timestamp: Date.now(),
        };
      }

      case 'WAIT':
      case '': {
        return {
          actionType: 'WAIT',
          success: true,
          summary: 'Agent decided to wait',
          parameters,
          timestamp: Date.now(),
        };
      }

      default: {
        logger.warn(
          `[MultiStep] Unknown action: ${normalizedAction}`,
          undefined,
          'MultiStepExecutor'
        );
        return {
          actionType: normalizedAction,
          success: false,
          summary: `Unknown action: ${normalizedAction}`,
          error: `Action "${normalizedAction}" is not recognized`,
          parameters,
          timestamp: Date.now(),
        };
      }
    }
  }

  /**
   * Aggregate trace results into final output
   */
  private aggregateResults(
    trace: ActionTraceResult[],
    startTime: number
  ): MultiStepExecutorResult {
    const counts = {
      trades: 0,
      posts: 0,
      comments: 0,
      messages: 0,
    };

    for (const result of trace) {
      if (!result.success) continue;

      switch (result.actionType) {
        case 'TRADE':
          counts.trades++;
          break;
        case 'POST':
          counts.posts++;
          break;
        case 'COMMENT':
          counts.comments++;
          break;
        case 'RESPOND':
          counts.comments += (result.result?.responsesCreated as number) || 1;
          break;
        case 'DM':
          counts.messages++;
          break;
      }
    }

    const hasSuccessfulActions = trace.some(
      (r) => r.success && r.actionType !== 'WAIT'
    );

    return {
      success: hasSuccessfulActions,
      actionsExecuted: counts,
      iterations: trace.length,
      trace,
      duration: Date.now() - startTime,
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function getTimeAgo(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Export singleton instance
export const multiStepExecutor = new MultiStepExecutor();
