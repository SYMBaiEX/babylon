/**
 * Direct Executors for Multi-Step Agent Actions
 *
 * These are "dumb" executors that take specific parameters and execute directly
 * without making their own LLM calls. The multi-step decision loop handles all
 * LLM reasoning - these just execute the decided actions.
 */

import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import {
  actorState,
  and,
  asSystem,
  asUser,
  comments,
  db,
  eq,
  markets,
  positions,
  posts,
  sql,
} from '@babylon/db';
import {
  type GeneratedTag,
  generateTagsFromPost,
  PredictionPricing,
  StaticDataRegistry,
  storeTagsForPost,
  WalletService,
} from '@babylon/engine';
import { agentPnLService } from '../services/AgentPnLService';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';

// =============================================================================
// Types
// =============================================================================

export interface DirectTradeParams {
  agentUserId: string;
  marketType: 'prediction' | 'perp';
  marketId: string; // Market ID for prediction, ticker for perp
  side: 'buy_yes' | 'buy_no' | 'open_long' | 'open_short';
  amount: number;
  reasoning?: string;
}

export interface DirectTradeResult {
  success: boolean;
  marketId?: string;
  ticker?: string;
  side?: string;
  shares?: number;
  error?: string;
}

export interface DirectPostParams {
  agentUserId: string;
  content: string;
}

export interface DirectPostResult {
  success: boolean;
  postId?: string;
  error?: string;
}

export interface DirectCommentParams {
  agentUserId: string;
  postId: string;
  content: string;
  parentCommentId?: string;
}

export interface DirectCommentResult {
  success: boolean;
  commentId?: string;
  error?: string;
}

// =============================================================================
// Direct Trade Executor
// =============================================================================

/**
 * Execute a trade directly without LLM decision-making.
 * Just executes the given parameters.
 */
export async function executeDirectTrade(
  params: DirectTradeParams
): Promise<DirectTradeResult> {
  const { agentUserId, marketType, marketId, side, amount, reasoning } = params;

  // Check if this is an NPC
  const npcActor = StaticDataRegistry.getActor(agentUserId);
  const isNpc = !!npcActor;

  // Get agent's managed by for recording (for USER_CONTROLLED agents)
  const agentManagedBy = agentUserId;

  logger.info(
    `[DirectExecutor] Executing ${marketType} trade: ${side} $${amount} on ${marketId}`,
    { agentUserId, isNpc },
    'DirectExecutors'
  );

  if (marketType === 'prediction') {
    return executePredictionTrade({
      agentUserId,
      marketId,
      side: side as 'buy_yes' | 'buy_no',
      amount,
      reasoning,
      isNpc,
      agentManagedBy,
    });
  }
  return executePerpTrade({
    agentUserId,
    ticker: marketId,
    side: side as 'open_long' | 'open_short',
    amount,
    reasoning,
    isNpc,
    agentManagedBy,
  });
}

async function executePredictionTrade(params: {
  agentUserId: string;
  marketId: string;
  side: 'buy_yes' | 'buy_no';
  amount: number;
  reasoning?: string;
  isNpc: boolean;
  agentManagedBy: string;
}): Promise<DirectTradeResult> {
  const {
    agentUserId,
    marketId,
    side,
    amount,
    reasoning,
    isNpc,
    agentManagedBy,
  } = params;

  // Find the market
  const [market] = await db
    .select()
    .from(markets)
    .where(eq(markets.id, marketId))
    .limit(1);

  if (!market) {
    return { success: false, error: `Market not found: ${marketId}` };
  }

  const isBuyYes = side === 'buy_yes';

  const tradeOperation = async (
    txDb: Parameters<Parameters<typeof asUser>[1]>[0]
  ) => {
    // Calculate shares and pricing (0.1% fee rate)
    const TRADING_FEE_RATE = 0.001;
    const calculation = PredictionPricing.calculateBuyWithFees(
      Number(market.yesShares),
      Number(market.noShares),
      isBuyYes ? 'yes' : 'no',
      amount,
      TRADING_FEE_RATE
    );

    // Debit amount from balance
    if (isNpc) {
      await txDb
        .update(actorState)
        .set({
          tradingBalance: sql`${actorState.tradingBalance} - ${amount}`,
        })
        .where(eq(actorState.id, agentUserId));
    } else {
      await WalletService.debit(
        agentUserId,
        amount,
        'pred_buy',
        `Bought ${calculation.sharesBought} ${isBuyYes ? 'YES' : 'NO'} shares: ${market.question}`,
        market.id
      );
    }

    // Update market shares
    await txDb
      .update(markets)
      .set({
        yesShares: isBuyYes
          ? sql`${markets.yesShares} + ${calculation.sharesBought}`
          : String(calculation.newYesShares),
        noShares: isBuyYes
          ? String(calculation.newNoShares)
          : sql`${markets.noShares} + ${calculation.sharesBought}`,
      })
      .where(eq(markets.id, market.id));

    // Create or update position
    const existingPositionResult = await txDb
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.userId, agentUserId),
          eq(positions.marketId, market.id)
        )
      )
      .limit(1);
    const existingPosition = existingPositionResult[0];

    if (existingPosition) {
      await txDb
        .update(positions)
        .set({
          shares: sql`${positions.shares} + ${calculation.sharesBought}`,
          amount: sql`${positions.amount} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(positions.id, existingPosition.id));
    } else {
      await txDb.insert(positions).values({
        id: await generateSnowflakeId(),
        userId: agentUserId,
        marketId: market.id,
        side: isBuyYes,
        shares: String(calculation.sharesBought),
        avgPrice: String(calculation.avgPrice),
        amount: String(amount),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return { calculation };
  };

  // Execute with appropriate context
  const result = isNpc
    ? await asSystem(tradeOperation, 'npc_prediction_trade')
    : await asUser({ userId: agentUserId }, tradeOperation);

  // Record in AgentTrade
  await agentPnLService.recordTrade({
    agentId: agentUserId,
    userId: agentManagedBy,
    marketType: 'prediction',
    marketId: market.id,
    action: 'open',
    side: isBuyYes ? 'yes' : 'no',
    amount,
    price: result.calculation.avgPrice,
    reasoning,
  });

  logger.info(
    `[DirectExecutor] Prediction trade executed: ${isBuyYes ? 'YES' : 'NO'} on ${market.question.substring(0, 50)}`,
    { shares: result.calculation.sharesBought },
    'DirectExecutors'
  );

  return {
    success: true,
    marketId: market.id,
    side: isBuyYes ? 'YES' : 'NO',
    shares: result.calculation.sharesBought,
  };
}

async function executePerpTrade(params: {
  agentUserId: string;
  ticker: string;
  side: 'open_long' | 'open_short';
  amount: number;
  reasoning?: string;
  isNpc: boolean;
  agentManagedBy: string;
}): Promise<DirectTradeResult> {
  const { agentUserId, ticker, side, amount, reasoning, isNpc, agentManagedBy } =
    params;

  const perpSide = side === 'open_long' ? 'long' : 'short';

  // Get org for price (search through all orgs by ticker)
  const allOrgs = StaticDataRegistry.getAllOrganizations();
  const org = allOrgs.find((o) => o.ticker === ticker);
  const currentPrice = org?.initialPrice ?? 100;

  const perpTradeOperation = async () => {
    // Create wallet adapter
    const walletAdapter = isNpc
      ? {
          debit: async ({
            userId: uid,
            amount: amt,
          }: {
            userId: string;
            amount: number;
            reason: string;
            description?: string;
            relatedId?: string;
          }) => {
            await db
              .update(actorState)
              .set({
                tradingBalance: sql`${actorState.tradingBalance} - ${amt}`,
              })
              .where(eq(actorState.id, uid));
          },
          credit: async ({
            userId: uid,
            amount: amt,
          }: {
            userId: string;
            amount: number;
            reason: string;
            description?: string;
            relatedId?: string;
          }) => {
            await db
              .update(actorState)
              .set({
                tradingBalance: sql`${actorState.tradingBalance} + ${amt}`,
              })
              .where(eq(actorState.id, uid));
          },
          recordPnL: async (_args: {
            userId: string;
            pnl: number;
            reason: string;
            relatedId?: string;
          }) => {
            // NPCs don't track PnL
          },
          getBalance: async (uid: string) => {
            const [actor] = await db
              .select({ tradingBalance: actorState.tradingBalance })
              .from(actorState)
              .where(eq(actorState.id, uid))
              .limit(1);
            return {
              balance: Number(actor?.tradingBalance ?? 10000),
              totalDeposited: 0,
              totalWithdrawn: 0,
              lifetimePnL: 0,
            };
          },
        }
      : {
          debit: ({
            userId: uid,
            amount: amt,
            reason,
            description,
            relatedId,
          }: {
            userId: string;
            amount: number;
            reason: string;
            description?: string;
            relatedId?: string;
          }) =>
            WalletService.debit(uid, amt, reason, description ?? '', relatedId),
          credit: ({
            userId: uid,
            amount: amt,
            reason,
            description,
            relatedId,
          }: {
            userId: string;
            amount: number;
            reason: string;
            description?: string;
            relatedId?: string;
          }) =>
            WalletService.credit(uid, amt, reason, description ?? '', relatedId),
          recordPnL: async ({
            userId: uid,
            pnl,
            reason,
            relatedId,
          }: {
            userId: string;
            pnl: number;
            reason: string;
            relatedId?: string;
          }) => {
            await WalletService.recordPnL(uid, pnl, reason, relatedId);
          },
          getBalance: (uid: string) => WalletService.getBalance(uid),
        };

    const service = new PerpMarketService({
      db: new PerpDbAdapter(),
      wallet: walletAdapter,
      fees: {
        tradingFeeRate: 0.001,
        platformShare: 0.5,
        referrerShare: 0.5,
        minFeeAmount: 0.01,
      },
    });

    await service.openPosition({
      userId: agentUserId,
      ticker,
      side: perpSide,
      size: amount,
      leverage: 1,
    });
  };

  // Execute with appropriate context
  if (isNpc) {
    await asSystem(perpTradeOperation, 'npc_perp_trade');
  } else {
    await asUser({ userId: agentUserId }, perpTradeOperation);
  }

  // Record trade
  await agentPnLService.recordTrade({
    agentId: agentUserId,
    userId: agentManagedBy,
    marketType: 'perp',
    ticker,
    action: 'open',
    side: perpSide,
    amount,
    price: currentPrice,
    reasoning,
  });

  logger.info(
    `[DirectExecutor] Perp trade executed: ${perpSide} $${amount} on ${ticker}`,
    undefined,
    'DirectExecutors'
  );

  return {
    success: true,
    ticker,
    side: perpSide,
  };
}

// =============================================================================
// Direct Post Executor
// =============================================================================

/**
 * Create a post directly without LLM decision-making.
 * Just creates the post with the given content.
 */
export async function executeDirectPost(
  params: DirectPostParams
): Promise<DirectPostResult> {
  const { agentUserId, content } = params;

  if (!content || content.trim().length < 5) {
    return { success: false, error: 'Content too short' };
  }

  const cleanContent = content.trim();

  // Check if this is an NPC
  const npcActor = StaticDataRegistry.getActor(agentUserId);
  const isNpc = !!npcActor;

  logger.info(
    `[DirectExecutor] Creating post for ${isNpc ? 'NPC' : 'user'} ${agentUserId}`,
    { contentPreview: cleanContent.substring(0, 50) },
    'DirectExecutors'
  );

  // Create the post
  const postId = await generateSnowflakeId();
  const now = new Date();

  await db.insert(posts).values({
    id: postId,
    content: cleanContent,
    authorId: agentUserId,
    timestamp: now,
    createdAt: now,
  });

  // Generate and store tags
  const tags: GeneratedTag[] = await generateTagsFromPost(cleanContent);
  if (tags.length > 0) {
    await storeTagsForPost(postId, tags);
  }

  logger.info(
    `[DirectExecutor] Post created: ${postId}`,
    { tags: tags.length },
    'DirectExecutors'
  );

  return {
    success: true,
    postId,
  };
}

// =============================================================================
// Direct Comment Executor
// =============================================================================

/**
 * Create a comment directly without LLM decision-making.
 * Just creates the comment with the given content.
 */
export async function executeDirectComment(
  params: DirectCommentParams
): Promise<DirectCommentResult> {
  const { agentUserId, postId, content, parentCommentId } = params;

  if (!content || content.trim().length < 3) {
    return { success: false, error: 'Content too short' };
  }

  const cleanContent = content.trim();

  // Verify post exists
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    return { success: false, error: `Post not found: ${postId}` };
  }

  // Verify parent comment if provided
  if (parentCommentId) {
    const [parentComment] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.id, parentCommentId))
      .limit(1);

    if (!parentComment) {
      return { success: false, error: `Parent comment not found: ${parentCommentId}` };
    }
  }

  logger.info(
    `[DirectExecutor] Creating comment on post ${postId}`,
    { parentCommentId, contentPreview: cleanContent.substring(0, 50) },
    'DirectExecutors'
  );

  const commentId = await generateSnowflakeId();
  const now = new Date();

  await db.insert(comments).values({
    id: commentId,
    content: cleanContent,
    postId,
    authorId: agentUserId,
    parentCommentId: parentCommentId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  logger.info(
    `[DirectExecutor] Comment created: ${commentId}`,
    undefined,
    'DirectExecutors'
  );

  return {
    success: true,
    commentId,
  };
}

