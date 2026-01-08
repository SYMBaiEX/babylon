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
  aliasedTable,
  and,
  asSystem,
  asUser,
  chatParticipants,
  chats,
  comments,
  db,
  dmAcceptances,
  eq,
  gte,
  isNull,
  markets,
  messages,
  positions,
  posts,
  reactions,
  shares,
  sql,
  users,
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
import { topicDiversityService } from './TopicDiversityService';
import { resolvePerpTicker } from './utils/resolvePerpTicker';

const SHARE_LIKE_MAX_INTEGER = 10;
const SHARE_LIKE_RATIO_THRESHOLD = 0.01;

// =============================================================================
// Types
// =============================================================================

export interface DirectTradeParams {
  agentUserId: string;
  marketType: 'prediction' | 'perp';
  marketId: string; // Market ID for prediction, ticker/name/id for perp
  side: 'buy_yes' | 'buy_no' | 'open_long' | 'open_short';
  amount: number;
  reasoning?: string;
  /**
   * Skip resolving the perp ticker when the caller already passed the canonical ticker.
   * Useful for services that call resolvePerpTicker upstream.
   */
  skipPerpResolution?: boolean;
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

export interface DirectMessageParams {
  agentUserId: string;
  chatId?: string;
  recipientId?: string;
  content: string;
}

export interface DirectMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface DirectLikeParams {
  agentUserId: string;
  postId: string;
}

export interface DirectLikeResult {
  success: boolean;
  liked?: boolean;
  error?: string;
}

export interface DirectRepostParams {
  agentUserId: string;
  postId: string;
  comment?: string;
}

export interface DirectRepostResult {
  success: boolean;
  repostId?: string;
  quotePostId?: string;
  error?: string;
}

// =============================================================================
// Direct Trade Executor
// =============================================================================

/**
 * Execute a trade directly without LLM decision-making.
 * Validates balance - cannot trade more than you have.
 */
export async function executeDirectTrade(
  params: DirectTradeParams
): Promise<DirectTradeResult> {
  const { agentUserId, marketType, marketId, side, reasoning } = params;
  let { amount } = params;

  // Check if this is an NPC
  const npcActor = StaticDataRegistry.getActor(agentUserId);
  const isNpc = !!npcActor;

  // Get current balance
  let balance = 0;
  if (isNpc) {
    const [actor] = await db
      .select({ tradingBalance: actorState.tradingBalance })
      .from(actorState)
      .where(eq(actorState.id, agentUserId))
      .limit(1);
    balance = Number(actor?.tradingBalance ?? 0);
  } else {
    const walletBalance = await WalletService.getBalance(agentUserId);
    balance = walletBalance.balance;
  }

  const looksLikeShareCount =
    Number.isInteger(amount) &&
    amount >= 1 &&
    amount <= SHARE_LIKE_MAX_INTEGER &&
    balance > 0 &&
    amount / balance < SHARE_LIKE_RATIO_THRESHOLD;
  if (looksLikeShareCount) {
    logger.warn(
      `[DirectExecutor] Trade amount $${amount.toFixed(
        2
      )} looks like a share count relative to $${balance.toFixed(
        2
      )} balance. Expected Babylon Points.`,
      { agentUserId, marketType, side, balance },
      'DirectExecutors'
    );
  }

  // Cannot trade more than balance
  if (amount > balance) {
    logger.warn(
      `[DirectExecutor] Trade capped to balance: $${amount} -> $${balance}`,
      { agentUserId, isNpc },
      'DirectExecutors'
    );
    amount = balance;
  }

  // Reject if insufficient funds
  if (amount < 1) {
    return {
      success: false,
      error: `Insufficient balance: $${balance.toFixed(2)}`,
    };
  }

  // Get agent's managed by for recording (for USER_CONTROLLED agents)
  const agentManagedBy = agentUserId;

  logger.info(
    `[DirectExecutor] Executing ${marketType} trade: ${side} $${amount} on ${marketId}`,
    { agentUserId, isNpc, balance },
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

  const perpTicker = params.skipPerpResolution
    ? marketId
    : resolvePerpTicker(marketId)?.ticker;

  if (!perpTicker) {
    return { success: false, error: `Perp market not found: ${marketId}` };
  }

  return executePerpTrade({
    agentUserId,
    ticker: perpTicker,
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

    // Debit amount from balance (atomic check to prevent negative balance)
    if (isNpc) {
      const debitResult = await txDb
        .update(actorState)
        .set({
          tradingBalance: sql`${actorState.tradingBalance} - ${amount}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(actorState.id, agentUserId),
            gte(sql<number>`${actorState.tradingBalance}::numeric`, amount)
          )
        )
        .returning({ id: actorState.id });

      // Check if debit succeeded (empty array means insufficient funds or actor not found)
      if (debitResult.length === 0) {
        throw new Error(`Insufficient NPC balance for trade: $${amount}`);
      }
    } else {
      const sharesRounded = Math.round(calculation.sharesBought * 100) / 100;
      await WalletService.debit(
        agentUserId,
        amount,
        'pred_buy',
        `Bought ${sharesRounded} ${isBuyYes ? 'YES' : 'NO'} shares: ${market.question}`,
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

  const sharesRounded = Math.round(result.calculation.sharesBought * 100) / 100;

  logger.info(
    `[DirectExecutor] Prediction trade executed: ${isBuyYes ? 'YES' : 'NO'} on ${market.question.substring(0, 50)}`,
    { shares: sharesRounded },
    'DirectExecutors'
  );

  return {
    success: true,
    marketId: market.id,
    side: isBuyYes ? 'YES' : 'NO',
    shares: sharesRounded,
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
  const {
    agentUserId,
    ticker,
    side,
    amount,
    reasoning,
    isNpc,
    agentManagedBy,
  } = params;

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
            // Atomic debit with balance check to prevent negative balance
            const result = await db
              .update(actorState)
              .set({
                tradingBalance: sql`${actorState.tradingBalance} - ${amt}`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(actorState.id, uid),
                  gte(sql<number>`${actorState.tradingBalance}::numeric`, amt)
                )
              )
              .returning({ id: actorState.id });

            if (result.length === 0) {
              throw new Error(
                `Insufficient NPC balance for perp trade: $${amt}`
              );
            }
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
                updatedAt: new Date(),
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
            WalletService.credit(
              uid,
              amt,
              reason,
              description ?? '',
              relatedId
            ),
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
 * Validates content for diversity before creating.
 */
export async function executeDirectPost(
  params: DirectPostParams
): Promise<DirectPostResult> {
  const { agentUserId, content } = params;

  if (!content || content.trim().length < 5) {
    return { success: false, error: 'Content too short' };
  }

  const cleanContent = content.trim();

  // DIVERSITY CHECK: Validate content before creating post
  const diversityIssues = topicDiversityService.validateContent(
    agentUserId,
    cleanContent
  );

  if (diversityIssues.length > 0) {
    logger.warn(
      `[DirectExecutor] Post rejected for diversity issues`,
      {
        agentUserId,
        issues: diversityIssues,
        contentPreview: cleanContent.substring(0, 100),
      },
      'DirectExecutors'
    );

    return {
      success: false,
      error: `Content rejected: ${diversityIssues[0]}`,
    };
  }

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

  // Record topic coverage for future diversity checks
  topicDiversityService.recordTopicCoverage(agentUserId, cleanContent);

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
 * Includes deduplication check to prevent agents from:
 * - Making multiple top-level comments on the same post
 * - Making multiple replies to the same parent comment
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

  // DEDUPLICATION CHECK: Prevent duplicate comments
  if (parentCommentId) {
    // Replying to a specific comment - check if agent already replied to this comment
    const [existingReply] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(
        and(
          eq(comments.postId, postId),
          eq(comments.authorId, agentUserId),
          eq(comments.parentCommentId, parentCommentId)
        )
      )
      .limit(1);

    if (existingReply) {
      logger.info(
        `[DirectExecutor] Agent already replied to comment ${parentCommentId} - skipping duplicate`,
        { agentUserId, postId, existingReplyId: existingReply.id },
        'DirectExecutors'
      );
      return {
        success: false,
        error: `Already replied to this comment`,
      };
    }

    // Verify parent comment exists
    const [parentComment] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.id, parentCommentId))
      .limit(1);

    if (!parentComment) {
      return {
        success: false,
        error: `Parent comment not found: ${parentCommentId}`,
      };
    }
  } else {
    // Top-level comment - check if agent already commented on this post
    const [existingComment] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(
        and(
          eq(comments.postId, postId),
          eq(comments.authorId, agentUserId),
          isNull(comments.parentCommentId)
        )
      )
      .limit(1);

    if (existingComment) {
      logger.info(
        `[DirectExecutor] Agent already made top-level comment on post ${postId} - skipping duplicate`,
        { agentUserId, existingCommentId: existingComment.id },
        'DirectExecutors'
      );
      return {
        success: false,
        error: `Already commented on this post`,
      };
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

// =============================================================================
// Direct Message Executor
// =============================================================================

/**
 * Send a message directly without LLM decision-making.
 * Just creates the message with the given content.
 */
export async function executeDirectMessage(
  params: DirectMessageParams
): Promise<DirectMessageResult> {
  const { agentUserId, chatId: providedChatId, recipientId, content } = params;

  const cleanContent = content?.trim() ?? '';
  if (cleanContent.length < 3) {
    return { success: false, error: 'Content too short' };
  }
  let chatId = providedChatId;

  // If chatId not provided, resolve it from recipientId
  if (!chatId && recipientId) {
    // Check if recipient exists
    const [recipient] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, recipientId))
      .limit(1);

    if (!recipient) {
      // Try searching actorState for NPCs
      const [npc] = await db
        .select({ id: actorState.id })
        .from(actorState)
        .where(eq(actorState.id, recipientId))
        .limit(1);

      if (!npc) {
        return { success: false, error: `Recipient not found: ${recipientId}` };
      }
    }

    // Find existing DM chat using a single query with self-join
    // Join chatParticipants (for agent) -> chats -> chatParticipants alias (for recipient)
    const recipientParticipants = aliasedTable(chatParticipants, 'cp2');

    const existingChat = await db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .innerJoin(chats, eq(chatParticipants.chatId, chats.id))
      .innerJoin(
        recipientParticipants,
        eq(chatParticipants.chatId, recipientParticipants.chatId)
      )
      .where(
        and(
          eq(chatParticipants.userId, agentUserId),
          eq(chats.isGroup, false),
          eq(recipientParticipants.userId, recipientId)
        )
      )
      .limit(1);

    if (existingChat.length > 0 && existingChat[0]) {
      chatId = existingChat[0].chatId;
    }

    // If still no chatId, create new DM
    if (!chatId) {
      chatId = await generateSnowflakeId();
      const now = new Date();

      try {
        await db.transaction(async (tx) => {
          await tx.insert(chats).values({
            id: chatId!,
            isGroup: false,
            createdAt: now,
            updatedAt: now,
          });

          // Add both participants
          await tx.insert(chatParticipants).values([
            {
              id: await generateSnowflakeId(),
              chatId: chatId!,
              userId: agentUserId,
              joinedAt: now,
              isActive: true,
            },
            {
              id: await generateSnowflakeId(),
              chatId: chatId!,
              userId: recipientId,
              joinedAt: now,
              isActive: true,
            },
          ]);

          // Create DMAcceptance record with 'accepted' status
          // Agent-initiated DMs bypass the acceptance flow since agents are automated
          await tx.insert(dmAcceptances).values({
            id: await generateSnowflakeId(),
            chatId: chatId!,
            userId: recipientId, // The recipient
            otherUserId: agentUserId, // The agent initiating
            status: 'accepted', // Auto-accepted for agent-initiated DMs
            createdAt: now,
            acceptedAt: now, // Mark as accepted immediately
          });
        });

        logger.info(
          `[DirectExecutor] Created new DM chat ${chatId} between ${agentUserId} and ${recipientId}`,
          undefined,
          'DirectExecutors'
        );
      } catch (error) {
        // Handle race condition - if chat was created by another process, try to find it
        if (error instanceof Error && error.message.includes('duplicate key')) {
          logger.warn(
            `[DirectExecutor] Race condition detected, retrying chat lookup`,
            { agentUserId, recipientId },
            'DirectExecutors'
          );
          // Retry with the same optimized single query
          const retryRecipientParticipants = aliasedTable(
            chatParticipants,
            'cp2_retry'
          );

          const retryMatch = await db
            .select({ chatId: chatParticipants.chatId })
            .from(chatParticipants)
            .innerJoin(chats, eq(chatParticipants.chatId, chats.id))
            .innerJoin(
              retryRecipientParticipants,
              eq(chatParticipants.chatId, retryRecipientParticipants.chatId)
            )
            .where(
              and(
                eq(chatParticipants.userId, agentUserId),
                eq(chats.isGroup, false),
                eq(retryRecipientParticipants.userId, recipientId)
              )
            )
            .limit(1);

          if (retryMatch.length > 0 && retryMatch[0]) {
            chatId = retryMatch[0].chatId;
          } else {
            throw error; // Re-throw if we still can't find the chat
          }
        } else {
          throw error;
        }
      }
    }
  }

  if (!chatId) {
    return {
      success: false,
      error: 'Chat ID required or could not be resolved',
    };
  }

  // Verify chat exists (if provided directly)
  if (providedChatId) {
    const [chat] = await db
      .select({ id: chats.id })
      .from(chats)
      .where(eq(chats.id, chatId))
      .limit(1);

    if (!chat) {
      return { success: false, error: `Chat not found: ${chatId}` };
    }
  }

  logger.info(
    `[DirectExecutor] Creating message in chat ${chatId}`,
    { contentPreview: cleanContent.substring(0, 50) },
    'DirectExecutors'
  );

  const messageId = await generateSnowflakeId();
  const now = new Date();

  await db.insert(messages).values({
    id: messageId,
    chatId,
    senderId: agentUserId,
    content: cleanContent,
    createdAt: now,
  });

  logger.info(
    `[DirectExecutor] Message created: ${messageId}`,
    undefined,
    'DirectExecutors'
  );

  return {
    success: true,
    messageId,
  };
}

// =============================================================================
// Direct Like Executor
// =============================================================================

/**
 * Like a post directly without LLM decision-making.
 * Includes deduplication to prevent double-liking.
 */
export async function executeDirectLike(
  params: DirectLikeParams
): Promise<DirectLikeResult> {
  const { agentUserId, postId } = params;

  // Verify post exists
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    return { success: false, error: `Post not found: ${postId}` };
  }

  // Check if already liked
  const [existingLike] = await db
    .select({ id: reactions.id })
    .from(reactions)
    .where(
      and(
        eq(reactions.postId, postId),
        eq(reactions.userId, agentUserId),
        eq(reactions.type, 'like')
      )
    )
    .limit(1);

  if (existingLike) {
    logger.debug(
      `[DirectExecutor] Agent already liked post ${postId}`,
      { agentUserId },
      'DirectExecutors'
    );
    return { success: true, liked: true };
  }

  logger.info(
    `[DirectExecutor] Liking post ${postId}`,
    { agentUserId },
    'DirectExecutors'
  );

  try {
    const reactionId = await generateSnowflakeId();

    // Use onConflictDoNothing to handle race conditions and prevent duplicate likes
    // This relies on a unique index on (userId, postId, type) for the reactions table
    await db
      .insert(reactions)
      .values({
        id: reactionId,
        postId,
        userId: agentUserId,
        type: 'like',
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    logger.info(
      `[DirectExecutor] Post liked: ${postId}`,
      undefined,
      'DirectExecutors'
    );

    return {
      success: true,
      liked: true,
    };
  } catch (error) {
    // Handle unique constraint violation (concurrent like)
    if ((error as Error).message?.includes('unique constraint')) {
      return { success: true, liked: true };
    }
    throw error;
  }
}

// =============================================================================
// Direct Repost Executor
// =============================================================================

/**
 * Repost/share a post directly without LLM decision-making.
 * Creates a share record and optionally a quote post.
 */
export async function executeDirectRepost(
  params: DirectRepostParams
): Promise<DirectRepostResult> {
  const { agentUserId, postId, comment } = params;

  // Verify post exists
  const [post] = await db
    .select({ id: posts.id, authorId: posts.authorId, content: posts.content })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    return { success: false, error: `Post not found: ${postId}` };
  }

  // Don't let agents repost their own content
  if (post.authorId === agentUserId) {
    return { success: false, error: 'Cannot repost own content' };
  }

  // Check if already shared
  const [existingShare] = await db
    .select({ id: shares.id })
    .from(shares)
    .where(and(eq(shares.postId, postId), eq(shares.userId, agentUserId)))
    .limit(1);

  if (existingShare) {
    logger.debug(
      `[DirectExecutor] Agent already reposted ${postId}`,
      { agentUserId },
      'DirectExecutors'
    );
    return { success: true, repostId: existingShare.id };
  }

  logger.info(
    `[DirectExecutor] Reposting post ${postId}`,
    { agentUserId, hasComment: !!comment },
    'DirectExecutors'
  );

  const now = new Date();

  try {
    // Pre-generate IDs before transaction
    const shareId = await generateSnowflakeId();
    const hasQuote = comment && comment.trim().length >= 3;
    const quotePostId = hasQuote ? await generateSnowflakeId() : undefined;

    // Use transaction to ensure atomicity of share and quote post
    await db.transaction(async (tx) => {
      // Create share record
      await tx.insert(shares).values({
        id: shareId,
        userId: agentUserId,
        postId,
        createdAt: now,
      });

      // If there's a quote comment, create a quote post (min 3 chars like comments)
      if (hasQuote && quotePostId) {
        await tx.insert(posts).values({
          id: quotePostId,
          content: comment!.trim(),
          authorId: agentUserId,
          originalPostId: postId,
          type: 'repost',
          timestamp: now,
          createdAt: now,
        });
      }
    });

    logger.info(
      `[DirectExecutor] Post reposted: ${postId} -> share ${shareId}${quotePostId ? ` with quote ${quotePostId}` : ''}`,
      undefined,
      'DirectExecutors'
    );

    return {
      success: true,
      repostId: shareId,
      quotePostId,
    };
  } catch (error) {
    // Handle unique constraint violation (concurrent repost)
    // Check error code for PostgreSQL (23505) or Prisma (P2002)
    const errorCode = (error as { code?: string }).code;
    const isUniqueConstraint =
      errorCode === '23505' ||
      errorCode === 'P2002' ||
      (error as Error).message?.includes('unique constraint');

    if (isUniqueConstraint) {
      const [share] = await db
        .select({ id: shares.id })
        .from(shares)
        .where(and(eq(shares.postId, postId), eq(shares.userId, agentUserId)))
        .limit(1);

      if (!share?.id) {
        throw new Error(
          'Share not found after unique constraint violation - concurrent repost race condition'
        );
      }

      return { success: true, repostId: share.id };
    }
    throw error;
  }
}
