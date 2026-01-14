/**
 * Babylon Agent Executor
 *
 * Handles all Babylon operations via A2A message/send protocol
 * Parses user messages and executes appropriate Babylon operations
 */

import type {
  DataPart,
  Message,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
  TextPart,
} from '@a2a-js/sdk';
import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from '@a2a-js/sdk/server';
import { db, getRawDrizzle } from '@babylon/db';
import { perpMarketSnapshots } from '@babylon/db/schema';
import type { JsonValue } from '@babylon/shared';
import { generateSnowflakeId, logger } from '@babylon/shared';
import { v4 as uuidv4 } from 'uuid';
import {
  handleAppealBanWithEscrow,
  handleCreateEscrowPayment,
  handleListEscrowPayments,
  handleRefundEscrowPayment,
  handleVerifyEscrowPayment,
} from '../handlers/escrow-handlers';
import type { JsonRpcRequest } from '../types/a2a';

/**
 * Main executor implementing all Babylon game operations
 * via A2A protocol
 */
interface BabylonCommand {
  operation: string;
  params: Record<string, JsonValue>;
}

/**
 * Common response types for executor operations
 */
interface SuccessResponse {
  success: boolean;
  message?: string;
}

interface PostCreatedResponse extends SuccessResponse {
  postId: string;
  content: string;
}

interface FeedResponse {
  posts: Array<{
    id: string;
    content: string;
    authorId: string;
    timestamp: Date;
  }>;
}

interface MarketsResponse {
  markets: Array<{
    id: number | string;
    question: string;
    yesShares: number;
    noShares: number;
  }>;
}

interface UsersSearchResponse {
  users: Array<{
    id: string;
    username: string | null;
    displayName: string | null;
    reputationPoints: number;
  }>;
}

interface SystemStatsResponse {
  users: number;
  posts: number;
  markets: number;
}

interface LeaderboardResponse {
  leaderboard: Array<{
    id: string;
    username: string | null;
    displayName: string | null;
    reputationPoints: number;
  }>;
}

interface BlockMuteResponse extends SuccessResponse {
  block?: {
    id: string;
    blockerId: string;
    blockedId: string;
    reason: string | null;
    createdAt: Date;
  };
  mute?: {
    id: string;
    muterId: string;
    mutedId: string;
    reason: string | null;
    createdAt: Date;
  };
}

interface ReportResponse extends SuccessResponse {
  report: {
    id: string;
    reporterId: string;
    reportedUserId?: string | null;
    reportedPostId?: string | null;
    reportType: string;
    category: string;
    reason: string;
    evidence: string | null;
    priority: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    resolution?: string | null;
    resolvedAt?: Date | null;
    resolvedBy?: string | null;
  };
}

interface BlockedUserInfo {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
}

interface BlockEntry {
  id: string;
  blockerId: string;
  blockedId: string;
  reason: string | null;
  createdAt: Date;
  blocked?: BlockedUserInfo;
}

interface BlocksListResponse {
  blocks: BlockEntry[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

interface MutedUserInfo {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
}

interface MuteEntry {
  id: string;
  muterId: string;
  mutedId: string;
  reason: string | null;
  createdAt: Date;
  muted?: MutedUserInfo;
}

interface MutesListResponse {
  mutes: MuteEntry[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

interface BlockStatusResponse {
  isBlocked: boolean;
  block: {
    id: string;
    createdAt: Date;
    reason: string | null;
  } | null;
}

interface MuteStatusResponse {
  isMuted: boolean;
  mute: {
    id: string;
    createdAt: Date;
    reason: string | null;
  } | null;
}

interface TrendingTagsResponse {
  tags: Array<{
    name: string;
    displayName: string;
    category: string;
    postCount: number;
  }>;
}

interface PostsByTagResponse {
  posts: Array<{
    id: string;
    content: string;
    authorId: string;
    timestamp: Date;
  }>;
}

type ExecutorOperationResult =
  | PostCreatedResponse
  | FeedResponse
  | MarketsResponse
  | UsersSearchResponse
  | SystemStatsResponse
  | LeaderboardResponse
  | TrendingTagsResponse
  | PostsByTagResponse
  | BlockMuteResponse
  | ReportResponse
  | BlocksListResponse
  | MutesListResponse
  | BlockStatusResponse
  | MuteStatusResponse
  | JsonValue;

export class BabylonAgentExecutor implements AgentExecutor {
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const { taskId, contextId, userMessage, task } = requestContext;

    // Extract message text
    const textParts = userMessage.parts.filter(
      (p): p is TextPart => p.kind === 'text'
    );
    const messageText = textParts.map((p) => p.text).join(' ');

    logger.info('Babylon processing A2A message', { taskId, messageText });

    // Create initial task if needed
    if (!task) {
      const initialTask: Task = {
        kind: 'task',
        id: taskId,
        contextId: contextId || uuidv4(),
        status: {
          state: 'submitted',
          timestamp: new Date().toISOString(),
        },
        history: [userMessage],
      };
      eventBus.publish(initialTask);
    }

    // Update to working state
    const workingUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId: contextId || uuidv4(),
      status: {
        state: 'working',
        timestamp: new Date().toISOString(),
      },
      final: false,
    };
    eventBus.publish(workingUpdate);

    const command = this.parseCommand(userMessage);
    const result = await this.executeOperation(command, requestContext);

    // Create artifact with result
    const artifactUpdate: TaskArtifactUpdateEvent = {
      kind: 'artifact-update',
      taskId,
      contextId: contextId || uuidv4(),
      artifact: {
        artifactId: uuidv4(),
        name: 'result.json',
        parts: [
          {
            kind: 'data',
            data: (result ?? {}) as { [k: string]: JsonValue },
          },
        ],
      },
    };
    eventBus.publish(artifactUpdate);

    // Mark completed
    const completedUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId: contextId || uuidv4(),
      status: {
        state: 'completed',
        timestamp: new Date().toISOString(),
      },
      final: true,
    };
    eventBus.publish(completedUpdate);
    eventBus.finished();
  }

  private async executeOperation(
    command: BabylonCommand,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    switch (command.operation) {
      // Portfolio operations
      case 'portfolio.get_balance':
        return this.getBalance(command.params, context);
      case 'portfolio.get_positions':
        return this.getPositions(command.params, context);
      case 'portfolio.get_user_wallet':
        return this.getUserWallet(command.params, context);
      case 'social.create_post':
        return this.createPost(command.params, context);
      case 'social.get_feed':
        return this.getFeed(command.params);
      case 'social.like_post':
        return this.likePost(command.params, context);
      case 'markets.list_prediction':
        return this.listPredictionMarkets(command.params);
      case 'markets.list_perpetuals':
        return this.listPerpetualMarkets(command.params);
      case 'users.search':
        return this.searchUsers(command.params);
      case 'users.get_profile':
        return this.getUserProfile(command.params);
      case 'stats.system':
        return this.getSystemStats();
      case 'stats.leaderboard':
        return this.getLeaderboard(command.params);
      case 'stats.trending_tags':
        return this.getTrendingTags(command.params);
      case 'stats.posts_by_tag':
        return this.getPostsByTag(command.params);
      case 'stats.get_organizations':
        return this.getOrganizations(command.params);
      // Messaging operations
      case 'messaging.get_chats':
        return this.getChatsHandler(command.params, context);
      case 'messaging.get_unread_count':
        return this.getUnreadCountHandler(command.params, context);
      case 'messaging.get_notifications':
        return this.getNotificationsHandler(command.params, context);
      case 'moderation.create_escrow_payment':
        return this.createEscrowPayment(command.params, context);
      case 'moderation.verify_escrow_payment':
        return this.verifyEscrowPayment(command.params, context);
      case 'moderation.refund_escrow_payment':
        return this.refundEscrowPayment(command.params, context);
      case 'moderation.list_escrow_payments':
        return this.listEscrowPayments(command.params, context);
      case 'moderation.appeal_ban_with_escrow':
        return this.appealBanWithEscrow(command.params, context);
      // Basic moderation operations
      case 'moderation.block_user':
        return this.blockUser(command.params, context);
      case 'moderation.unblock_user':
        return this.unblockUser(command.params, context);
      case 'moderation.mute_user':
        return this.muteUser(command.params, context);
      case 'moderation.unmute_user':
        return this.unmuteUser(command.params, context);
      case 'moderation.report_user':
        return this.reportUser(command.params, context);
      case 'moderation.report_post':
        return this.reportPost(command.params, context);
      case 'moderation.get_blocks':
        return this.getBlocks(command.params, context);
      case 'moderation.get_mutes':
        return this.getMutes(command.params, context);
      case 'moderation.check_block_status':
        return this.checkBlockStatus(command.params, context);
      case 'moderation.check_mute_status':
        return this.checkMuteStatus(command.params, context);
      default:
        throw new Error(`Unsupported operation: ${command.operation}`);
    }
  }

  private parseCommand(message: Message): BabylonCommand {
    const dataPart = message.parts.find(
      (part): part is DataPart => part.kind === 'data'
    );

    if (dataPart && dataPart.data && typeof dataPart.data === 'object') {
      const data = dataPart.data as Record<string, JsonValue>;
      const operation = data.operation;
      const params = data.params;
      if (typeof operation !== 'string') {
        throw new Error('Data part must include an "operation" string');
      }
      return {
        operation,
        params: this.ensureRecord(params),
      };
    }

    const textPayload = message.parts
      .filter((part): part is TextPart => part.kind === 'text')
      .map((part) => part.text)
      .join(' ')
      .trim();

    if (textPayload.length > 0) {
      const parsed = JSON.parse(textPayload);
      if (typeof parsed.operation === 'string') {
        return {
          operation: parsed.operation,
          params: this.ensureRecord(parsed.params),
        };
      }
    }

    throw new Error(
      'Structured command required. Provide a data part with { "operation": "...", "params": {...} }'
    );
  }

  private ensureRecord(value: unknown): Record<string, JsonValue> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, JsonValue>;
    }
    return {};
  }

  private async createPost(
    params: Record<string, JsonValue>,
    context: RequestContext
  ) {
    const content =
      typeof params.content === 'string' ? params.content.trim() : '';
    if (!content) {
      throw new Error('content is required');
    }

    const post = await db.post.create({
      data: {
        id: await generateSnowflakeId(),
        content,
        authorId: context.contextId || context.taskId,
        timestamp: new Date(),
      },
    });
    return { success: true, postId: post.id, content: post.content };
  }

  private async getFeed(params: Record<string, JsonValue>) {
    const limit = this.parsePositiveInt(params.limit, 20, 100);
    const posts = await db.post.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        content: true,
        authorId: true,
        timestamp: true,
      },
    });
    return {
      posts: posts.map((p) => ({
        id: p.id,
        content: p.content,
        authorId: p.authorId,
        timestamp: p.timestamp,
      })),
    };
  }

  private async likePost(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<SuccessResponse> {
    const postId = typeof params.postId === 'string' ? params.postId : '';
    if (!postId) {
      throw new Error('postId is required');
    }

    // Check if post exists
    const post = await db.post.findFirst({
      where: { id: postId, deletedAt: null },
    });

    if (!post) {
      throw new Error('Post not found');
    }

    // Use userId from params first (actual agent user ID), fall back to context
    const userId =
      typeof params.userId === 'string' && params.userId
        ? params.userId
        : context.contextId || context.taskId;

    // Check if already liked
    const existingLike = await db.reaction.findFirst({
      where: {
        postId,
        userId,
        type: 'like',
      },
    });

    if (existingLike) {
      return { success: true, message: 'Already liked' };
    }

    // Create the like
    await db.reaction.create({
      data: {
        id: await generateSnowflakeId(),
        postId,
        userId,
        type: 'like',
      },
    });

    return { success: true, message: 'Post liked' };
  }

  private async listPredictionMarkets(params: Record<string, JsonValue>) {
    const limit = this.parsePositiveInt(params.limit, 20, 50);
    const markets = await db.market.findMany({
      take: limit,
      where: { resolved: false },
      orderBy: { createdAt: 'desc' },
    });
    return {
      markets: markets.map((m) => ({
        id: m.id,
        question: m.question,
        yesShares: Number(m.yesShares),
        noShares: Number(m.noShares),
      })),
    };
  }

  private async listPerpetualMarkets(params: Record<string, JsonValue>) {
    const limit = this.parsePositiveInt(params.limit, 20, 50);

    try {
      const drizzle = getRawDrizzle();
      const snapshots = await drizzle
        .select({
          ticker: perpMarketSnapshots.ticker,
          name: perpMarketSnapshots.name,
          organizationId: perpMarketSnapshots.organizationId,
          currentPrice: perpMarketSnapshots.currentPrice,
          change24h: perpMarketSnapshots.change24h,
          changePercent24h: perpMarketSnapshots.changePercent24h,
          volume24h: perpMarketSnapshots.volume24h,
          openInterest: perpMarketSnapshots.openInterest,
          fundingRate: perpMarketSnapshots.fundingRate,
        })
        .from(perpMarketSnapshots)
        .limit(limit);

      return {
        perpetuals: snapshots.map((s) => ({
          name: s.name || s.ticker,
          ticker: s.ticker,
          currentPrice: Number(s.currentPrice) || 0,
          priceChange24h: Number(s.change24h) || 0,
          volume24h: Number(s.volume24h) || 0,
          openInterest: Number(s.openInterest) || 0,
          fundingRate:
            typeof s.fundingRate === 'object' && s.fundingRate !== null
              ? (s.fundingRate as { rate?: number }).rate || 0
              : 0,
        })),
      };
    } catch (error) {
      logger.warn('Failed to fetch perpMarketSnapshots, returning empty', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { perpetuals: [] };
    }
  }

  private async getUserProfile(params: Record<string, JsonValue>) {
    const userId = typeof params.userId === 'string' ? params.userId : '';
    if (!userId) {
      return { profile: null };
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        profileImageUrl: true,
        reputationPoints: true,
        virtualBalance: true,
        isAgent: true,
      },
    });

    if (!user) {
      return { profile: null };
    }

    return {
      profile: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        profileImageUrl: user.profileImageUrl,
        reputationPoints: user.reputationPoints,
        balance: Number(user.virtualBalance) || 0,
        isAgent: user.isAgent,
      },
    };
  }

  private async getOrganizations(params: Record<string, JsonValue>) {
    const limit = this.parsePositiveInt(params.limit, 20, 100);
    // Get organization states
    const orgStates = await db.organizationState.findMany({
      take: limit,
      orderBy: { currentPrice: 'desc' },
      select: {
        id: true,
        currentPrice: true,
      },
    });
    return {
      organizations: orgStates.map((o) => ({
        id: o.id,
        name: o.id,
        ticker: o.id,
        currentPrice: Number(o.currentPrice) || 0,
      })),
    };
  }

  private async getChatsHandler(
    _params: Record<string, JsonValue>,
    _context: RequestContext
  ) {
    // Return empty chats - actual chat data requires more complex queries
    return { chats: [] };
  }

  private async getUnreadCountHandler(
    _params: Record<string, JsonValue>,
    _context: RequestContext
  ) {
    // Return 0 unread count as default
    return { unreadCount: 0 };
  }

  private async getNotificationsHandler(
    _params: Record<string, JsonValue>,
    _context: RequestContext
  ) {
    // Return empty notifications as default
    return { notifications: [] };
  }

  private async searchUsers(params: Record<string, JsonValue>) {
    const query = typeof params.query === 'string' ? params.query.trim() : '';
    if (!query) {
      throw new Error('query is required');
    }

    const limit = this.parsePositiveInt(params.limit, 20, 50);
    const users = await db.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: {
        id: true,
        username: true,
        displayName: true,
        reputationPoints: true,
      },
    });
    return { users };
  }

  private async getSystemStats() {
    const [userCount, postCount, marketCount] = await Promise.all([
      db.user.count(),
      db.post.count(),
      db.market.count(),
    ]);
    return { users: userCount, posts: postCount, markets: marketCount };
  }

  private async getLeaderboard(params: Record<string, JsonValue>) {
    const limit = this.parsePositiveInt(params.limit, 10, 50);
    const users = await db.user.findMany({
      take: limit,
      orderBy: { reputationPoints: 'desc' },
      select: {
        id: true,
        username: true,
        displayName: true,
        reputationPoints: true,
      },
    });
    return { leaderboard: users };
  }

  private async getTrendingTags(
    params: Record<string, JsonValue>
  ): Promise<TrendingTagsResponse> {
    const limit = this.parsePositiveInt(params.limit, 10, 50);

    // Get trending tags with their tag info via query
    const trendingTagsList = await db.trendingTag.findMany({
      take: limit,
      orderBy: { score: 'desc' },
    });

    // Get tag IDs
    const tagIds = trendingTagsList.map((tt) => tt.tagId);

    // Fetch actual tag info
    const tags =
      tagIds.length > 0
        ? await db.tag.findMany({
            where: { id: { in: tagIds } },
          })
        : [];

    // Create a map for quick lookup
    const tagMap = new Map(tags.map((t) => [t.id, t]));

    return {
      tags: trendingTagsList.map((tt) => {
        const tag = tagMap.get(tt.tagId);
        return {
          name: tag?.name ?? '',
          displayName: tag?.displayName ?? tag?.name ?? '',
          category: tag?.category ?? 'general',
          postCount: tt.postCount,
        };
      }),
    };
  }

  private async getPostsByTag(
    params: Record<string, JsonValue>
  ): Promise<PostsByTagResponse> {
    const tagName = typeof params.tag === 'string' ? params.tag.trim() : '';
    if (!tagName) {
      throw new Error('tag is required');
    }

    const limit = this.parsePositiveInt(params.limit, 20, 50);
    const offset = this.parsePositiveInt(params.offset, 0, 1000);

    // Find the tag by name
    const tag = await db.tag.findFirst({
      where: { name: tagName },
    });

    if (!tag) {
      return { posts: [] };
    }

    // Find posts with this tag via PostTag join table
    const postTagEntries = await db.postTag.findMany({
      where: { tagId: tag.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const postIds = postTagEntries.map((pt) => pt.postId);

    if (postIds.length === 0) {
      return { posts: [] };
    }

    // Fetch the actual posts
    const posts = await db.post.findMany({
      where: {
        id: { in: postIds },
        deletedAt: null,
        type: 'post',
      },
      orderBy: { timestamp: 'desc' },
    });

    return {
      posts: posts.map((p) => ({
        id: p.id,
        content: p.content,
        authorId: p.authorId,
        timestamp: p.timestamp,
      })),
    };
  }

  private parsePositiveInt(
    value: unknown,
    fallback: number,
    max: number
  ): number {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(parsed, max);
  }

  // Portfolio operations
  private async getBalance(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    // Try to get userId from params, then from x-agent-id header (via contextId), then taskId
    const userId =
      typeof params.userId === 'string' && params.userId
        ? params.userId
        : context.contextId || context.taskId;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        virtualBalance: true,
        reputationPoints: true,
      },
    });

    // Return default values if user not found (graceful degradation for onboarding)
    if (!user) {
      logger.debug('User not found for getBalance, returning defaults', {
        userId,
      });
      return {
        balance: 0,
        reputationPoints: 0,
      };
    }

    return {
      balance: Number(user.virtualBalance) || 0,
      reputationPoints: user.reputationPoints || 0,
    };
  }

  private async getPositions(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const userId =
      typeof params.userId === 'string' && params.userId
        ? params.userId
        : context.contextId || context.taskId;

    // Check if user exists first (for graceful handling)
    const userExists = await db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    // Return empty positions if user not found (graceful degradation for onboarding)
    if (!userExists) {
      logger.debug('User not found for getPositions, returning empty', {
        userId,
      });
      return {
        marketPositions: [],
        perpPositions: [],
        totalPnL: 0,
      };
    }

    // Get prediction market positions
    const marketPositionsRaw = await db.position.findMany({
      where: {
        userId,
        shares: { gt: '0' },
        status: 'active',
      },
    });

    const marketIds = [
      ...new Set(marketPositionsRaw.map((p) => p.marketId).filter(Boolean)),
    ];
    const markets =
      marketIds.length > 0
        ? await db.market.findMany({
            where: { id: { in: marketIds } },
            select: {
              id: true,
              question: true,
              resolved: true,
              yesShares: true,
              noShares: true,
            },
          })
        : [];
    const marketMap = new Map(markets.map((m) => [m.id, m]));

    const perpPositionsRaw = await db.perpPosition.findMany({
      where: {
        userId,
        closedAt: null,
      },
    });

    const orgIds = [
      ...new Set(perpPositionsRaw.map((p) => p.organizationId).filter(Boolean)),
    ];
    const orgStates =
      orgIds.length > 0
        ? await db.organizationState.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, currentPrice: true },
          })
        : [];
    const orgStateMap = new Map(orgStates.map((o) => [o.id, o]));

    const marketPositions = marketPositionsRaw.map((p) => {
      const market = marketMap.get(p.marketId);
      const side: 'YES' | 'NO' = p.outcome === true ? 'YES' : 'NO';

      // CPMM price: yesPrice = noShares / total, noPrice = yesShares / total
      const yesShares = Number(market?.yesShares ?? 0);
      const noShares = Number(market?.noShares ?? 0);
      const totalShares = yesShares + noShares;
      const currentPrice =
        totalShares > 0
          ? side === 'YES'
            ? noShares / totalShares
            : yesShares / totalShares
          : 0.5;

      const avgPrice = Number(p.avgPrice);
      const shares = Number(p.shares);
      const unrealizedPnL = (currentPrice - avgPrice) * shares;

      return {
        id: p.id,
        marketId: String(p.marketId),
        question: market?.question || 'Unknown',
        side,
        shares,
        avgPrice,
        currentPrice,
        unrealizedPnL,
      };
    });

    const perpPositions = perpPositionsRaw.map((p) => {
      const orgState = orgStateMap.get(p.organizationId);
      const currentPrice = Number(orgState?.currentPrice ?? p.entryPrice);
      return {
        id: p.id,
        ticker: p.ticker,
        side: p.side as 'long' | 'short',
        size: Number(p.size),
        entryPrice: Number(p.entryPrice),
        currentPrice,
        leverage: Number(p.leverage),
        unrealizedPnL: Number(p.unrealizedPnL) || 0,
      };
    });

    const marketPnL = marketPositions.reduce(
      (sum, p) => sum + p.unrealizedPnL,
      0
    );
    const perpPnL = perpPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);

    return {
      marketPositions,
      perpPositions,
      totalPnL: marketPnL + perpPnL,
    };
  }

  private async getUserWallet(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const userId =
      typeof params.userId === 'string' && params.userId
        ? params.userId
        : context.contextId || context.taskId;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        walletAddress: true,
        virtualBalance: true,
        reputationPoints: true,
      },
    });

    // Return default values if user not found (graceful degradation for onboarding)
    if (!user) {
      logger.debug('User not found for getUserWallet, returning defaults', {
        userId,
      });
      return {
        userId,
        walletAddress: null,
        balance: 0,
        reputationPoints: 0,
      };
    }

    return {
      userId: user.id,
      walletAddress: user.walletAddress,
      balance: Number(user.virtualBalance) || 0,
      reputationPoints: user.reputationPoints || 0,
    };
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    logger.info('Task cancellation', { taskId });

    const cancelUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId: '',
      status: {
        state: 'canceled',
        timestamp: new Date().toISOString(),
      },
      final: true,
    };
    eventBus.publish(cancelUpdate);
    eventBus.finished();
  }

  // Escrow operations
  private async createEscrowPayment(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const requestParams: Record<string, JsonValue> = {
      recipientId: String(params.recipientId ?? ''),
      amountUSD: Number(params.amountUSD ?? 0),
      recipientWalletAddress: String(params.recipientWalletAddress ?? ''),
    };
    if (params.reason) {
      requestParams.reason = String(params.reason);
    }
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'a2a.createEscrowPayment',
      params: requestParams,
      id: 1,
    };
    const response = await handleCreateEscrowPayment(agentId, request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return (response.result as JsonValue) ?? { success: true };
  }

  private async verifyEscrowPayment(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const request = {
      jsonrpc: '2.0' as const,
      method: 'a2a.verifyEscrowPayment',
      params: {
        escrowId: String(params.escrowId || ''),
        txHash: String(params.txHash || ''),
        fromAddress: String(params.fromAddress || ''),
        toAddress: String(params.toAddress || ''),
        amount: String(params.amount || ''),
      },
      id: 1,
    };
    const response = await handleVerifyEscrowPayment(agentId, request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return (response.result as JsonValue) ?? { success: true };
  }

  private async refundEscrowPayment(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const requestParams: Record<string, JsonValue> = {
      escrowId: String(params.escrowId ?? ''),
      refundTxHash: String(params.refundTxHash ?? ''),
    };
    if (params.reason) {
      requestParams.reason = String(params.reason);
    }
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'a2a.refundEscrowPayment',
      params: requestParams,
      id: 1,
    };
    const response = await handleRefundEscrowPayment(agentId, request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return (response.result as JsonValue) ?? { success: true };
  }

  private async listEscrowPayments(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const requestParams: Record<string, JsonValue> = {};
    if (params.recipientId)
      requestParams.recipientId = String(params.recipientId);
    if (params.adminId) requestParams.adminId = String(params.adminId);
    if (params.status) requestParams.status = String(params.status);
    if (params.limit) requestParams.limit = Number(params.limit);
    if (params.offset) requestParams.offset = Number(params.offset);
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'a2a.listEscrowPayments',
      params: requestParams,
      id: 1,
    };
    const response = await handleListEscrowPayments(agentId, request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return (response.result as JsonValue) ?? { success: true };
  }

  private async appealBanWithEscrow(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const request = {
      jsonrpc: '2.0' as const,
      method: 'a2a.appealBanWithEscrow',
      params: {
        reason: String(params.reason || ''),
        escrowPaymentTxHash: String(params.escrowPaymentTxHash || ''),
      },
      id: 1,
    };
    const response = await handleAppealBanWithEscrow(agentId, request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return (response.result as JsonValue) ?? { success: true };
  }

  // Basic Moderation Operations

  private async blockUser(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const targetUserId = String(params.userId ?? '');
    const reason = params.reason ? String(params.reason) : null;

    // Check if target user exists
    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, displayName: true },
    });

    if (!targetUser) {
      throw new Error(`User ${targetUserId} not found`);
    }

    // Check if already blocked
    const existingBlock = await db.userBlock.findFirst({
      where: {
        blockerId: agentId,
        blockedId: targetUserId,
      },
    });

    if (existingBlock) {
      return { success: false, message: 'User is already blocked' };
    }

    // Create block
    const block = await db.userBlock.create({
      data: {
        id: await generateSnowflakeId(),
        blockerId: agentId,
        blockedId: targetUserId,
        reason: reason || null,
      },
    });

    // Unfollow if following (bidirectional - delete both directions)
    await Promise.all([
      db.follow.deleteMany({
        where: {
          followerId: agentId,
          followingId: targetUserId,
        },
      }),
      db.follow.deleteMany({
        where: {
          followerId: targetUserId,
          followingId: agentId,
        },
      }),
    ]);

    return { success: true, message: 'User blocked successfully', block };
  }

  private async unblockUser(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const targetUserId = String(params.userId ?? '');

    const deleted = await db.userBlock.deleteMany({
      where: {
        blockerId: agentId,
        blockedId: targetUserId,
      },
    });

    if (deleted.count === 0) {
      return { success: false, message: 'User is not blocked' };
    }

    return { success: true, message: 'User unblocked successfully' };
  }

  private async muteUser(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const targetUserId = String(params.userId ?? '');
    const reason = params.reason ? String(params.reason) : null;

    // Check if target user exists
    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new Error(`User ${targetUserId} not found`);
    }

    // Check if already muted
    const existingMute = await db.userMute.findFirst({
      where: {
        muterId: agentId,
        mutedId: targetUserId,
      },
    });

    if (existingMute) {
      return { success: false, message: 'User is already muted' };
    }

    // Create mute
    const mute = await db.userMute.create({
      data: {
        id: await generateSnowflakeId(),
        muterId: agentId,
        mutedId: targetUserId,
        reason: reason || null,
      },
    });

    return { success: true, message: 'User muted successfully', mute };
  }

  private async unmuteUser(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const targetUserId = String(params.userId ?? '');

    const deleted = await db.userMute.deleteMany({
      where: {
        muterId: agentId,
        mutedId: targetUserId,
      },
    });

    if (deleted.count === 0) {
      return { success: false, message: 'User is not muted' };
    }

    return { success: true, message: 'User unmuted successfully' };
  }

  private async reportUser(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const targetUserId = String(params.userId ?? '');
    const category = String(params.category ?? 'other');
    const reason = String(params.reason ?? '');
    const evidence = params.evidence ? String(params.evidence) : null;

    // Check if target user exists
    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new Error(`User ${targetUserId} not found`);
    }

    // Determine priority based on category
    let priority = 'normal';
    if (['hate_speech', 'violence', 'self_harm'].includes(category)) {
      priority = 'high';
    } else if (category === 'spam') {
      priority = 'low';
    }

    // Create report
    const report = await db.report.create({
      data: {
        id: await generateSnowflakeId(),
        reporterId: agentId,
        reportedUserId: targetUserId,
        reportType: 'user',
        category,
        reason,
        evidence: evidence || null,
        priority,
        status: 'pending',
        updatedAt: new Date(),
      },
    });

    return { success: true, message: 'Report submitted successfully', report };
  }

  private async reportPost(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const postId = String(params.postId ?? '');
    const category = String(params.category ?? 'other');
    const reason = String(params.reason ?? '');
    const evidence = params.evidence ? String(params.evidence) : null;

    // Check if post exists
    const post = await db.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });

    if (!post) {
      throw new Error(`Post ${postId} not found`);
    }

    // Determine priority based on category
    let priority = 'normal';
    if (['hate_speech', 'violence', 'self_harm'].includes(category)) {
      priority = 'high';
    } else if (category === 'spam') {
      priority = 'low';
    }

    // Create report
    const report = await db.report.create({
      data: {
        id: await generateSnowflakeId(),
        reporterId: agentId,
        reportedPostId: postId,
        reportType: 'post',
        category,
        reason,
        evidence: evidence || null,
        priority,
        status: 'pending',
        updatedAt: new Date(),
      },
    });

    return { success: true, message: 'Report submitted successfully', report };
  }

  private async getBlocks(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const limit = params.limit ? Number(params.limit) : 20;
    const offset = params.offset ? Number(params.offset) : 0;

    const [blocks, total] = await Promise.all([
      db.userBlock.findMany({
        where: { blockerId: agentId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          blocked: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profileImageUrl: true,
            },
          },
        },
      }),
      db.userBlock.count({
        where: { blockerId: agentId },
      }),
    ]);

    return {
      blocks,
      pagination: {
        limit,
        offset,
        total,
      },
    };
  }

  private async getMutes(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const limit = params.limit ? Number(params.limit) : 20;
    const offset = params.offset ? Number(params.offset) : 0;

    const [mutes, total] = await Promise.all([
      db.userMute.findMany({
        where: { muterId: agentId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          muted: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profileImageUrl: true,
            },
          },
        },
      }),
      db.userMute.count({
        where: { muterId: agentId },
      }),
    ]);

    return {
      mutes,
      pagination: {
        limit,
        offset,
        total,
      },
    };
  }

  private async checkBlockStatus(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const targetUserId = String(params.userId ?? '');

    const block = await db.userBlock.findFirst({
      where: {
        blockerId: agentId,
        blockedId: targetUserId,
      },
      select: {
        id: true,
        createdAt: true,
        reason: true,
      },
    });

    return {
      isBlocked: !!block,
      block,
    };
  }

  private async checkMuteStatus(
    params: Record<string, JsonValue>,
    context: RequestContext
  ): Promise<ExecutorOperationResult> {
    const agentId = context.contextId || context.taskId;
    const targetUserId = String(params.userId ?? '');

    const mute = await db.userMute.findFirst({
      where: {
        muterId: agentId,
        mutedId: targetUserId,
      },
      select: {
        id: true,
        createdAt: true,
        reason: true,
      },
    });

    return {
      isMuted: !!mute,
      mute,
    };
  }
}
