/**
 * Private Cached Server-Side Data Fetchers for User-Specific Data
 *
 * These functions use 'use cache: private' for personalized content
 * that depends on cookies, headers, or user context.
 */
import { db, follows, followStatuses, posts, users, balanceTransactions, chats, groupChatMemberships, chatParticipants, messages, eq, and, inArray, desc, lte, count } from '@/db';
import { logger } from '@/lib/logger';
import { getReadyPerpsEngine } from '@/lib/perps-service';
import { ParticipationService } from '@/lib/services/participation-service';
import { ReputationService } from '@/lib/services/reputation-service';
import { WalletService } from '@/lib/services/wallet-service';

import { cacheMonitoring } from './cache-monitoring';
import { cacheLife, cacheTag } from './cache-polyfill';

/**
 * Get user positions (perpetuals and predictions)
 * Uses 'use cache: private' for user-specific caching
 * Cache tag: 'positions' for granular invalidation
 * Cache life: 30 seconds - positions change frequently during trading
 */
export async function getCachedUserPositions(userId: string) {
  'use cache: private';

  const cacheKey = `positions:${userId}`;
  const startTime = Date.now();

  cacheTag('positions', `positions:${userId}`);
  // Cache life: 30 seconds - positions change frequently during trading
  cacheLife({ expire: 30 });

  try {
    // Get perpetual positions
    const perpsEngine = await getReadyPerpsEngine();
    const perpPositions = perpsEngine.getUserPositions(userId);

    // Get prediction market positions
    const { positions, markets } = await import('@/db/schema/markets');
    
    const predictionPositions = await db.select({
      id: positions.id,
      userId: positions.userId,
      marketId: positions.marketId,
      side: positions.side,
      shares: positions.shares,
      avgPrice: positions.avgPrice,
    })
      .from(positions)
      .where(eq(positions.userId, userId));

    // Get market details for positions
    const marketIds = predictionPositions.map(p => p.marketId);
    const marketsData = marketIds.length > 0
      ? await db.select({
          id: markets.id,
          question: markets.question,
          endDate: markets.endDate,
          resolved: markets.resolved,
          resolution: markets.resolution,
          yesShares: markets.yesShares,
          noShares: markets.noShares,
        })
        .from(markets)
        .where(inArray(markets.id, marketIds))
      : [];
    
    const marketMap = new Map(marketsData.map(m => [m.id, m]));

    const perpStats = {
      totalPositions: perpPositions.length,
      totalPnL: perpPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0),
      totalFunding: perpPositions.reduce((sum, p) => sum + p.fundingPaid, 0),
    };

    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordHit(cacheKey, responseTime);

    return {
      success: true,
      perpetuals: {
        positions: perpPositions.map((p: typeof perpPositions[number]) => ({
          id: p.id,
          ticker: p.ticker,
          side: p.side,
          entryPrice: p.entryPrice,
          currentPrice: p.currentPrice,
          size: p.size,
          leverage: p.leverage,
          unrealizedPnL: p.unrealizedPnL,
          unrealizedPnLPercent: p.unrealizedPnLPercent,
          liquidationPrice: p.liquidationPrice,
          fundingPaid: p.fundingPaid,
          openedAt: p.openedAt,
        })),
        stats: perpStats,
      },
      predictions: {
        positions: predictionPositions.map((p) => {
          const market = marketMap.get(p.marketId);
          const yesShares = market ? Number(market.yesShares) : 0;
          const noShares = market ? Number(market.noShares) : 0;
          const totalShares = yesShares + noShares;
          
          return {
            id: p.id,
            marketId: p.marketId,
            question: market?.question || '',
            side: p.side ? 'YES' : 'NO',
            shares: Number(p.shares),
            avgPrice: Number(p.avgPrice),
            currentPrice: p.side
              ? (totalShares > 0 ? yesShares / totalShares : 0.5)
              : (totalShares > 0 ? noShares / totalShares : 0.5),
            resolved: market?.resolved || false,
            resolution: market?.resolution,
          };
        }),
        stats: {
          totalPositions: predictionPositions.length,
        },
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordMiss(cacheKey, responseTime);

    logger.error(
      'Error fetching cached user positions:',
      error,
      'getCachedUserPositions'
    );
    return {
      success: false,
      perpetuals: {
        positions: [],
        stats: { totalPositions: 0, totalPnL: 0, totalFunding: 0 },
      },
      predictions: { positions: [], stats: { totalPositions: 0 } },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get following feed posts (user-specific)
 * Uses 'use cache: private' for personalized feed caching
 * Cache tag: 'posts:following' for granular invalidation
 * Cache life: 30 seconds - following feed updates frequently
 */
export async function getCachedFollowingFeed(
  userId: string,
  limit: number = 100,
  offset: number = 0
) {
  'use cache: private';

  const cacheKey = `posts:following:${userId}:${limit}:${offset}`;
  const startTime = Date.now();

  cacheTag('posts:following', `posts:following:${userId}`);
  // Cache life: 30 seconds - following feed updates frequently
  cacheLife({ expire: 30 });

  try {
    // Get list of followed users
    const userFollows = await db.select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    // Get list of followed actors
    const actorFollows = await db.select({ npcId: followStatuses.npcId })
      .from(followStatuses)
      .where(
        and(
          eq(followStatuses.userId, userId),
          eq(followStatuses.isActive, true)
        )
      );

    const followedUserIds = userFollows.map((f) => f.followingId);
    const followedActorIds = actorFollows.map((f) => f.npcId);
    const allFollowedIds = [...followedUserIds, ...followedActorIds];

    if (allFollowedIds.length === 0) {
      return {
        success: true,
        posts: [],
        total: 0,
        limit,
        offset,
        source: 'following',
      };
    }

    // Get posts from followed users/actors (up to current time)
    const now = new Date();
    const postsResult = await db.select({
      id: posts.id,
      content: posts.content,
      authorId: posts.authorId,
      timestamp: posts.timestamp,
      createdAt: posts.createdAt,
    })
      .from(posts)
      .where(
        and(
          inArray(posts.authorId, allFollowedIds),
          lte(posts.timestamp, now)
        )
      )
      .orderBy(desc(posts.timestamp))
      .limit(limit)
      .offset(offset);

    // Fetch user details separately since Post doesn't have author relation
    const authorIds = [...new Set(postsResult.map((p) => p.authorId))];
    const authors = authorIds.length > 0
      ? await db.select({
          id: users.id,
          displayName: users.displayName,
          username: users.username,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(inArray(users.id, authorIds))
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, a]));

    type AuthorType = typeof authors[number];
    const result = {
      success: true,
      posts: postsResult.map((post) => {
        const author = authorMap.get(post.authorId) as AuthorType | undefined;
        return {
          id: post.id,
          content: post.content,
          author: post.authorId,
          authorId: post.authorId,
          authorDetails: author
            ? {
                displayName: author.displayName,
                username: author.username,
                profileImageUrl: author.profileImageUrl,
              }
            : null,
          timestamp: post.timestamp.toISOString(),
          createdAt: post.createdAt.toISOString(),
        };
      }),
      total: postsResult.length,
      limit,
      offset,
      source: 'following',
    };

    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordHit(cacheKey, responseTime);

    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordMiss(cacheKey, responseTime);

    logger.error(
      'Error fetching cached following feed:',
      error,
      'getCachedFollowingFeed'
    );
    return {
      success: false,
      posts: [],
      total: 0,
      limit,
      offset,
      source: 'following',
    };
  }
}

/**
 * Get user balance (user-specific)
 * Uses 'use cache: private' for personalized balance caching
 * Cache tag: 'balance' for granular invalidation
 * Cache life: 15 seconds - balance changes after trades
 */
export async function getCachedUserBalance(userId: string) {
  'use cache: private';

  const cacheKey = `balance:${userId}`;
  const startTime = Date.now();

  cacheTag('balance', `balance:${userId}`);
  // Cache life: 15 seconds - balance changes after trades
  cacheLife({ expire: 15 });

  try {
    const balanceInfo = await WalletService.getBalance(userId);

    const result = {
      success: true,
      balance: balanceInfo.balance,
      totalDeposited: balanceInfo.totalDeposited,
      totalWithdrawn: balanceInfo.totalWithdrawn,
      lifetimePnL: balanceInfo.lifetimePnL,
    };

    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordHit(cacheKey, responseTime);

    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordMiss(cacheKey, responseTime);

    logger.error(
      'Error fetching cached user balance:',
      error,
      'getCachedUserBalance'
    );
    return {
      success: false,
      balance: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
      lifetimePnL: 0,
    };
  }
}

/**
 * Get user profile (shared, but user-specific data)
 * Uses 'use cache: remote' for dynamic context caching
 * Cache tag: 'profile' for granular invalidation
 * Cache life: 5 minutes (300 seconds) - profiles change infrequently
 */
export async function getCachedUserProfile(userId: string) {
  'use cache: remote';

  const cacheKey = `profile:${userId}`;
  const startTime = Date.now();

  cacheTag('profile', `profile:${userId}`);
  // Cache life: 5 minutes - profiles change infrequently
  cacheLife({ expire: 300 });

  try {
    // Import necessary tables
    const { positions } = await import('@/db/schema/markets');
    const { comments, reactions } = await import('@/db/schema/posts');
    
    const dbUserResult = await db.select({
      id: users.id,
      walletAddress: users.walletAddress,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      profileImageUrl: users.profileImageUrl,
      isActor: users.isActor,
      profileComplete: users.profileComplete,
      hasUsername: users.hasUsername,
      hasBio: users.hasBio,
      hasProfileImage: users.hasProfileImage,
      onChainRegistered: users.onChainRegistered,
      nftTokenId: users.nftTokenId,
      virtualBalance: users.virtualBalance,
      lifetimePnL: users.lifetimePnL,
      createdAt: users.createdAt,
    })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const dbUser = dbUserResult[0];

    if (!dbUser) {
      const responseTime = Date.now() - startTime;
      cacheMonitoring.recordMiss(cacheKey, responseTime);

      return {
        success: false,
        user: null,
      };
    }

    // Get counts
    const positionCount = await db.select({ count: count() }).from(positions).where(eq(positions.userId, userId));
    const commentCount = await db.select({ count: count() }).from(comments).where(eq(comments.authorId, userId));
    const reactionCount = await db.select({ count: count() }).from(reactions).where(eq(reactions.userId, userId));
    const followerCount = await db.select({ count: count() }).from(follows).where(eq(follows.followingId, userId));
    const followingCount = await db.select({ count: count() }).from(follows).where(eq(follows.followerId, userId));

    const result = {
      success: true,
      user: {
        id: dbUser.id,
        walletAddress: dbUser.walletAddress,
        username: dbUser.username,
        displayName: dbUser.displayName,
        bio: dbUser.bio,
        profileImageUrl: dbUser.profileImageUrl,
        isActor: dbUser.isActor,
        profileComplete: dbUser.profileComplete,
        hasUsername: dbUser.hasUsername,
        hasBio: dbUser.hasBio,
        hasProfileImage: dbUser.hasProfileImage,
        onChainRegistered: dbUser.onChainRegistered,
        nftTokenId: dbUser.nftTokenId,
        virtualBalance: Number(dbUser.virtualBalance),
        lifetimePnL: Number(dbUser.lifetimePnL),
        createdAt: dbUser.createdAt.toISOString(),
        stats: {
          positions: positionCount[0]?.count || 0,
          comments: commentCount[0]?.count || 0,
          reactions: reactionCount[0]?.count || 0,
          followers: followerCount[0]?.count || 0,
          following: followingCount[0]?.count || 0,
        },
      },
    };

    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordHit(cacheKey, responseTime);

    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordMiss(cacheKey, responseTime);

    logger.error(
      'Error fetching cached user profile:',
      error,
      'getCachedUserProfile'
    );
    return {
      success: false,
      user: null,
    };
  }
}

/**
 * Get user chats (user-specific)
 * Uses 'use cache: private' for personalized chat caching
 * Cache tag: 'chats:user' for granular invalidation
 * Cache life: 30 seconds - chat lists update frequently
 */
export async function getCachedUserChats(userId: string) {
  'use cache: private';

  const cacheKey = `chats:user:${userId}`;
  const startTime = Date.now();

  cacheTag('chats:user', `chats:user:${userId}`);
  // Cache life: 30 seconds - chat lists update frequently
  cacheLife({ expire: 30 });

  try {
    // Get user's group chat memberships
    const memberships = await db.select()
      .from(groupChatMemberships)
      .where(
        and(
          eq(groupChatMemberships.userId, userId),
          eq(groupChatMemberships.isActive, true)
        )
      )
      .orderBy(desc(groupChatMemberships.lastMessageAt));

    // Get chat details for group chats
    const groupChatIds = memberships.map((m) => m.chatId);
    const groupChatDetails = groupChatIds.length > 0
      ? await db.select()
        .from(chats)
        .where(inArray(chats.id, groupChatIds))
      : [];

    const chatDetailsMap = new Map(groupChatDetails.map((c) => [c.id, c]));

    // Get DM chats the user participates in
    const dmParticipants = await db.select()
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, userId));

    const dmChatIds = dmParticipants.map((p) => p.chatId);
    const dmChatsDetails = dmChatIds.length > 0
      ? await db.select()
        .from(chats)
        .where(
          and(
            inArray(chats.id, dmChatIds),
            eq(chats.isGroup, false)
          )
        )
      : [];

    // Get last messages and participant counts for DM chats
    const dmChatsWithDetails = await Promise.all(
      dmChatsDetails.map(async (chat) => {
        const lastMessageResult = await db.select()
          .from(messages)
          .where(eq(messages.chatId, chat.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);
        
        const participantCountResult = await db.select({ count: count() })
          .from(chatParticipants)
          .where(eq(chatParticipants.chatId, chat.id));
        
        return {
          ...chat,
          lastMessage: lastMessageResult[0] || null,
          participantCount: participantCountResult[0]?.count || 0,
        };
      })
    );

    // Format group chats
    type GroupChatType = {
      id: string;
      name: string;
      isGroup: boolean;
      lastMessage: typeof messages.$inferSelect | null;
      messageCount: number;
      qualityScore: number | null;
      lastMessageAt: Date | null;
      updatedAt: Date;
    };
    
    const groupChatsFormatted: GroupChatType[] = [];
    for (const membership of memberships) {
      const chat = chatDetailsMap.get(membership.chatId);
      if (!chat) continue;
      
      // Get last message for this chat
      const lastMessageResult = await db.select()
        .from(messages)
        .where(eq(messages.chatId, membership.chatId))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      
      groupChatsFormatted.push({
        id: membership.chatId,
        name: chat.name || 'Unnamed Group',
        isGroup: true,
        lastMessage: lastMessageResult[0] || null,
        messageCount: membership.messageCount,
        qualityScore: membership.qualityScore,
        lastMessageAt: membership.lastMessageAt,
        updatedAt: chat.updatedAt,
      });
    }

    // Format DM chats
    const directChats = dmChatsWithDetails.map((chat) => ({
      id: chat.id,
      name: chat.name || 'Direct Message',
      isGroup: false,
      lastMessage: chat.lastMessage,
      participants: chat.participantCount,
      updatedAt: chat.updatedAt,
    }));

    const result = {
      success: true,
      groupChats: groupChatsFormatted,
      directChats,
      total: groupChatsFormatted.length + directChats.length,
    };

    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordHit(cacheKey, responseTime);

    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordMiss(cacheKey, responseTime);

    logger.error(
      'Error fetching cached user chats:',
      error,
      'getCachedUserChats'
    );
    return {
      success: false,
      groupChats: [],
      directChats: [],
      total: 0,
    };
  }
}

/**
 * Get user reputation (user-specific)
 * Uses 'use cache: private' for personalized reputation caching
 * Cache tag: 'reputation' for granular invalidation
 * Cache life: 2 minutes (120 seconds) - reputation changes less frequently
 */
export async function getCachedUserReputation(userId: string) {
  'use cache: private';

  const cacheKey = `reputation:${userId}`;
  const startTime = Date.now();

  cacheTag('reputation', `reputation:${userId}`);
  // Cache life: 2 minutes - reputation changes less frequently
  cacheLife({ expire: 120 });

  try {
    // Import tables
    const { positions, markets } = await import('@/db/schema/markets');
    
    // Get on-chain reputation
    const onChainReputation =
      await ReputationService.getOnChainReputation(userId);

    // Get off-chain participation stats
    const participationStats = await ParticipationService.getStats(userId);

    // Calculate enhanced reputation score
    let participationBonus = 0;
    let participationScore = 0;

    if (participationStats) {
      participationScore = participationStats.totalActivity;
      participationBonus = Math.min(20, Math.floor(participationScore / 100));
    }

    const baseReputation = onChainReputation ?? 70;
    const enhancedReputation = Math.min(
      100,
      baseReputation + participationBonus
    );

    // Get recent activity
    const recentActivity = await db.select({
      id: balanceTransactions.id,
      description: balanceTransactions.description,
      amount: balanceTransactions.amount,
      createdAt: balanceTransactions.createdAt,
    })
      .from(balanceTransactions)
      .where(
        and(
          eq(balanceTransactions.userId, userId),
          sql`${balanceTransactions.description} LIKE '%market resolution%'`
        )
      )
      .orderBy(desc(balanceTransactions.createdAt))
      .limit(10);

    // Get user positions with market details
    const userPositions = await db.select({
      id: positions.id,
      side: positions.side,
      marketId: positions.marketId,
    })
      .from(positions)
      .where(eq(positions.userId, userId));

    // Get market details for positions
    const marketIds = userPositions.map(p => p.marketId);
    const marketsData = marketIds.length > 0
      ? await db.select({
          id: markets.id,
          question: markets.question,
          resolved: markets.resolved,
          resolution: markets.resolution,
        })
        .from(markets)
        .where(inArray(markets.id, marketIds))
      : [];
    
    const marketMap = new Map(marketsData.map(m => [m.id, m]));

    // Calculate wins and losses
    const positionsWithMarkets = userPositions.map(p => ({
      ...p,
      market: marketMap.get(p.marketId),
    }));
    
    const resolvedPositions = positionsWithMarkets.filter((p) => p.market?.resolved);
    const wins = resolvedPositions.filter(
      (p) => p.market?.resolution === p.side
    ).length;
    const losses = resolvedPositions.length - wins;
    const winRate =
      resolvedPositions.length > 0
        ? (wins / resolvedPositions.length) * 100
        : 0;

    const result = {
      success: true,
      reputation: {
        onChain: onChainReputation ?? 70,
        base: baseReputation,
        enhanced: enhancedReputation,
        participationBonus,
        participationScore,
      },
      stats: {
        totalWins: wins,
        totalLosses: losses,
        winRate: Math.round(winRate * 10) / 10,
        totalBets: resolvedPositions.length,
      },
      participation: participationStats
        ? {
            postsCreated: participationStats.postsCreated,
            commentsMade: participationStats.commentsMade,
            sharesMade: participationStats.sharesMade,
            reactionsGiven: participationStats.reactionsGiven,
            marketsParticipated: participationStats.marketsParticipated,
            totalActivity: participationStats.totalActivity,
            lastActivityAt: participationStats.lastActivityAt.toISOString(),
          }
        : null,
      hasNft: onChainReputation !== null,
      recentActivity: recentActivity.map((activity) => ({
        id: activity.id,
        description: activity.description,
        amount: Number(activity.amount),
        timestamp: activity.createdAt.toISOString(),
      })),
    };

    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordHit(cacheKey, responseTime);

    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    cacheMonitoring.recordMiss(cacheKey, responseTime);

    logger.error(
      'Error fetching cached user reputation:',
      error,
      'getCachedUserReputation'
    );
    return {
      success: false,
      reputation: null,
      stats: null,
      participation: null,
      hasNft: false,
      recentActivity: [],
    };
  }
}

// Import sql for like queries
import { sql } from 'drizzle-orm';
