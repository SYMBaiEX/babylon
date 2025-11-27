/**
 * Market Context Service
 *
 * Builds complete market context for NPCs to make trading decisions.
 * Gathers: feed posts, group chats, events, market data, current positions.
 *
 * Token-aware: Limits context size to prevent LLM token overflows
 */

import {
  actorRelationships,
  actors,
  and,
  asc,
  chatParticipants,
  chats,
  db,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  markets,
  messages,
  or,
  organizations,
  poolPositions,
  posts,
  stockPrices,
  worldEvents,
} from '@/db';
import { logger } from '@/lib/logger';
import type {
  EventContext,
  FeedPostContext,
  GroupChatContext,
  MarketSnapshots,
  NPCMarketContext,
  NPCPosition,
  PerpMarketSnapshot,
  PredictionMarketSnapshot,
  RelationshipContext,
} from '@/types/market-context';

export class MarketContextService {
  /**
   * Build market context for all NPCs in the system
   *
   * Optimized to minimize database queries by fetching shared data once
   * and reusing it across all NPCs. Filters out test actors.
   *
   * @returns Map of NPC ID to their market context
   *
   * @remarks
   * This method is optimized for batch processing. For single NPC context,
   * use buildContextForNPC() which is more efficient for individual lookups.
   *
   * @example
   * ```typescript
   * const contexts = await service.buildContextForAllNPCs();
   * const npcContext = contexts.get('npc-123');
   * ```
   */
  async buildContextForAllNPCs(): Promise<Map<string, NPCMarketContext>> {
    const startTime = Date.now();

    // Fetch all NPCs (no pool requirement)
    // Note: All records in Actor table are NPCs
    // Filter out test actors (Group Test Alice, Bob, Charlie)
    const npcsList = await db.select().from(actors);

    const npcs = npcsList.filter((actor) => !actor.name.includes('Group Test'));

    // Fetch shared data once (used by all NPCs)
    const [marketSnapshots, recentPosts, recentEvents] = await Promise.all([
      this.getMarketSnapshots(),
      this.getRecentFeed(),
      this.getRecentEvents(),
    ]);

    // Get group chats with messages
    const groupChats = await db
      .select({
        id: chats.id,
        name: chats.name,
      })
      .from(chats)
      .where(eq(chats.isGroup, true));

    // Get messages for each group chat
    const groupChatMessages = new Map<string, typeof messagesData>();
    const messagesData = await db
      .select()
      .from(messages)
      .where(
        inArray(
          messages.chatId,
          groupChats.map((c) => c.id)
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(500); // Limit total messages

    // Group messages by chat
    for (const msg of messagesData) {
      const existing = groupChatMessages.get(msg.chatId) || [];
      if (existing.length < 50) {
        // Max 50 per chat
        existing.push(msg);
        groupChatMessages.set(msg.chatId, existing);
      }
    }

    // Fetch all relationships for all NPCs in one query
    const npcIds = npcs.map((npc) => npc.id);
    const allRelationships =
      npcIds.length > 0
        ? await db
            .select()
            .from(actorRelationships)
            .where(
              or(
                inArray(actorRelationships.actor1Id, npcIds),
                inArray(actorRelationships.actor2Id, npcIds)
              )
            )
        : [];

    // Fetch all NPC positions in one query (poolId = actorId for backward compatibility)
    const allPositions =
      npcIds.length > 0
        ? await db
            .select({
              id: poolPositions.id,
              poolId: poolPositions.poolId,
              marketType: poolPositions.marketType,
              ticker: poolPositions.ticker,
              marketId: poolPositions.marketId,
              side: poolPositions.side,
              entryPrice: poolPositions.entryPrice,
              currentPrice: poolPositions.currentPrice,
              size: poolPositions.size,
              shares: poolPositions.shares,
              unrealizedPnL: poolPositions.unrealizedPnL,
              openedAt: poolPositions.openedAt,
            })
            .from(poolPositions)
            .where(
              and(
                inArray(poolPositions.poolId, npcIds),
                isNull(poolPositions.closedAt)
              )
            )
        : [];

    // Group positions by NPC ID
    const positionsByNpc = new Map<string, typeof allPositions>();
    for (const position of allPositions) {
      if (!position.poolId) continue;
      const existing = positionsByNpc.get(position.poolId) || [];
      existing.push(position);
      positionsByNpc.set(position.poolId, existing);
    }

    // Build context for each NPC
    const contexts = new Map<string, NPCMarketContext>();

    for (const npc of npcs) {
      // Use actor's trading balance (no pools)
      const availableBalance = Number.parseFloat(npc.tradingBalance.toString());

      // Filter group chats this NPC is a member of (based on chat participants)
      const npcGroupChats: GroupChatContext[] = [];
      for (const chat of groupChats) {
        const chatMsgs = groupChatMessages.get(chat.id) || [];
        // Check if NPC has sent messages or chat name includes NPC name
        const isRelevant =
          chatMsgs.some((msg) => msg.senderId === npc.id) ||
          chat.name
            ?.toLowerCase()
            .includes(npc.name.toLowerCase().split(' ')[0] ?? '');

        if (isRelevant) {
          for (const msg of chatMsgs) {
            npcGroupChats.push({
              chatId: chat.id,
              chatName: chat.name || 'Group Chat',
              from: msg.senderId,
              fromName: msg.senderId,
              message: msg.content,
              timestamp: msg.createdAt.toISOString(),
            });
          }
        }
      }

      // Fetch positions for this NPC (poolId = actorId for backward compatibility)
      const npcPositions = positionsByNpc.get(npc.id) || [];
      const currentPositions: NPCPosition[] = npcPositions.map((pos) => ({
        id: pos.id,
        marketType: pos.marketType as 'perp' | 'prediction',
        ticker: pos.ticker || undefined,
        marketId: pos.marketId || undefined,
        side: pos.side,
        entryPrice: Number.parseFloat(pos.entryPrice.toString()),
        currentPrice: Number.parseFloat(pos.currentPrice.toString()),
        size: Number.parseFloat(pos.size.toString()),
        shares: pos.shares
          ? Number.parseFloat(pos.shares.toString())
          : undefined,
        unrealizedPnL: Number.parseFloat(pos.unrealizedPnL.toString()),
        openedAt: pos.openedAt.toISOString(),
      }));

      // Get relationships for this NPC
      const npcRelationships = allRelationships
        .filter((rel) => rel.actor1Id === npc.id || rel.actor2Id === npc.id)
        .map((rel) => {
          const isActor1 = rel.actor1Id === npc.id;
          const otherActorId = isActor1 ? rel.actor2Id : rel.actor1Id;

          return {
            actorId: otherActorId,
            actorName: otherActorId,
            relationshipType: rel.relationshipType,
            sentiment: rel.sentiment || 0,
            strength: rel.strength || 0.5,
            history: rel.history || undefined,
          };
        });

      contexts.set(npc.id, {
        npcId: npc.id,
        npcName: npc.name,
        personality: npc.personality || 'neutral trader',
        tier: npc.tier || 'B_TIER',
        availableBalance,
        relationships: npcRelationships,
        recentPosts,
        groupChatMessages: npcGroupChats,
        recentEvents,
        perpMarkets: marketSnapshots.perps,
        predictionMarkets: marketSnapshots.predictions,
        currentPositions,
      });
    }

    const duration = Date.now() - startTime;
    logger.info(
      `Built market context for ${contexts.size} NPCs in ${duration}ms`,
      {
        npcCount: contexts.size,
        durationMs: duration,
      },
      'MarketContextService'
    );

    return contexts;
  }

  /**
   * Build context for a specific NPC with relationship data
   *
   * Fetches market data, feed posts, events, and relationships for a single NPC.
   * More efficient than buildContextForAllNPCs() for individual lookups.
   *
   * @param npcId - Unique identifier for the NPC
   * @returns Complete market context for the NPC
   * @throws Error if NPC not found
   *
   * @example
   * ```typescript
   * const context = await service.buildContextForNPC('npc-123');
   * console.log(`Balance: ${context.availableBalance}`);
   * console.log(`Markets: ${context.predictionMarkets.length}`);
   * ```
   */
  async buildContextForNPC(npcId: string): Promise<NPCMarketContext> {
    const [npc] = await db
      .select()
      .from(actors)
      .where(eq(actors.id, npcId))
      .limit(1);

    if (!npc) {
      throw new Error(`NPC not found: ${npcId}`);
    }

    const [marketSnapshots, recentPosts, recentEvents, groupChatMessages] =
      await Promise.all([
        this.getMarketSnapshots(),
        this.getRecentFeed(),
        this.getRecentEvents(),
        this.getInsiderInfo(npcId),
      ]);

    // Get relationships for this NPC
    const relationships = await this.getRelationshipsForNPC(npcId);

    // Use actor's trading balance (no pools)
    const availableBalance = Number.parseFloat(npc.tradingBalance.toString());

    // Fetch positions for this NPC (poolId = actorId for backward compatibility)
    const npcPositions = await db
      .select({
        id: poolPositions.id,
        marketType: poolPositions.marketType,
        ticker: poolPositions.ticker,
        marketId: poolPositions.marketId,
        side: poolPositions.side,
        entryPrice: poolPositions.entryPrice,
        currentPrice: poolPositions.currentPrice,
        size: poolPositions.size,
        shares: poolPositions.shares,
        unrealizedPnL: poolPositions.unrealizedPnL,
        openedAt: poolPositions.openedAt,
      })
      .from(poolPositions)
      .where(
        and(eq(poolPositions.poolId, npcId), isNull(poolPositions.closedAt))
      );

    const currentPositions: NPCPosition[] = npcPositions.map((pos) => ({
      id: pos.id,
      marketType: pos.marketType as 'perp' | 'prediction',
      ticker: pos.ticker || undefined,
      marketId: pos.marketId || undefined,
      side: pos.side,
      entryPrice: Number.parseFloat(pos.entryPrice.toString()),
      currentPrice: Number.parseFloat(pos.currentPrice.toString()),
      size: Number.parseFloat(pos.size.toString()),
      shares: pos.shares ? Number.parseFloat(pos.shares.toString()) : undefined,
      unrealizedPnL: Number.parseFloat(pos.unrealizedPnL.toString()),
      openedAt: pos.openedAt.toISOString(),
    }));

    return {
      npcId: npc.id,
      npcName: npc.name,
      personality: npc.personality || 'neutral trader',
      tier: npc.tier || 'B_TIER',
      availableBalance,
      relationships,
      recentPosts,
      groupChatMessages,
      recentEvents,
      perpMarkets: marketSnapshots.perps,
      predictionMarkets: marketSnapshots.predictions,
      currentPositions,
    };
  }

  /**
   * Get relationships for an NPC
   *
   * Retrieves all actor relationships where the NPC is involved,
   * regardless of event association.
   *
   * @param npcId - Unique identifier for the NPC
   * @returns Array of relationship contexts
   */
  private async getRelationshipsForNPC(
    npcId: string
  ): Promise<RelationshipContext[]> {
    const relationshipsList = await db
      .select()
      .from(actorRelationships)
      .where(
        or(
          eq(actorRelationships.actor1Id, npcId),
          eq(actorRelationships.actor2Id, npcId)
        )
      );

    return relationshipsList.map((rel) => {
      const isActor1 = rel.actor1Id === npcId;
      const otherActorId = isActor1 ? rel.actor2Id : rel.actor1Id;

      return {
        actorId: otherActorId,
        actorName: otherActorId,
        relationshipType: rel.relationshipType,
        sentiment: rel.sentiment || 0,
        strength: rel.strength || 0.5,
        history: rel.history || undefined,
      };
    });
  }

  /**
   * Get insider information from group chats this NPC is in
   *
   * Retrieves messages from group chats where the NPC is a member.
   * Messages are truncated and limited to prevent token overflow.
   *
   * @param npcId - Unique identifier for the NPC
   * @returns Array of group chat message contexts
   *
   * @remarks
   * - Limited to 20 messages per chat
   * - Messages truncated to 120 characters
   * - Only includes chats where NPC is a participant
   */
  private async getInsiderInfo(npcId: string): Promise<GroupChatContext[]> {
    // Get chats where NPC is a participant
    const participantRecords = await db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, npcId));

    const participantChatIds = participantRecords.map((p) => p.chatId);

    if (participantChatIds.length === 0) {
      return [];
    }

    const groupChats = await db
      .select()
      .from(chats)
      .where(
        and(eq(chats.isGroup, true), inArray(chats.id, participantChatIds))
      );

    const result: GroupChatContext[] = [];

    for (const chat of groupChats) {
      const chatMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .orderBy(desc(messages.createdAt))
        .limit(20);

      for (const msg of chatMessages.slice(0, 15)) {
        // Truncate long messages
        const maxMsgLength = 120;
        const message =
          msg.content.length > maxMsgLength
            ? msg.content.slice(0, maxMsgLength) + '...'
            : msg.content;

        result.push({
          chatId: chat.id,
          chatName: chat.name || 'Group Chat',
          from: msg.senderId,
          fromName: msg.senderId,
          message,
          timestamp: msg.createdAt.toISOString(),
        });
      }
    }

    return result;
  }

  /**
   * Get recent feed posts
   *
   * Retrieves the most recent feed posts, excluding deleted ones.
   * Content is truncated to limit token usage.
   *
   * @returns Array of feed post contexts
   *
   * @remarks
   * - Limited to 50 most recent posts
   * - Post content truncated to 200 characters
   * - Article titles truncated to 80 characters
   */
  private async getRecentFeed(): Promise<FeedPostContext[]> {
    const now = new Date();
    const postList = await db
      .select()
      .from(posts)
      .where(and(isNull(posts.deletedAt), lte(posts.timestamp, now)))
      .orderBy(desc(posts.createdAt))
      .limit(50);

    return postList.map((post) => {
      // Truncate long posts to save tokens
      const maxContentLength = 200;
      const content =
        post.content.length > maxContentLength
          ? post.content.slice(0, maxContentLength) + '...'
          : post.content;

      const maxTitleLength = 80;
      const articleTitle =
        post.articleTitle && post.articleTitle.length > maxTitleLength
          ? post.articleTitle.slice(0, maxTitleLength) + '...'
          : post.articleTitle;

      return {
        author: post.authorId,
        authorName: post.authorId,
        content,
        timestamp: post.createdAt.toISOString(),
        articleTitle: articleTitle || undefined,
      };
    });
  }

  /**
   * Get recent events with actor involvement
   *
   * Retrieves recent world events, filtering to only include events
   * up to the current time to prevent future information leakage.
   *
   * @returns Array of event contexts
   *
   * @remarks
   * - Limited to 30 most recent events
   * - Event descriptions truncated to 150 characters
   * - Only includes events with timestamp <= now()
   */
  private async getRecentEvents(): Promise<EventContext[]> {
    const now = new Date();
    const eventList = await db
      .select()
      .from(worldEvents)
      .where(lte(worldEvents.timestamp, now))
      .orderBy(desc(worldEvents.timestamp))
      .limit(30);

    return eventList.map((event) => {
      // Truncate long descriptions
      const maxDescLength = 150;
      const description =
        event.description.length > maxDescLength
          ? event.description.slice(0, maxDescLength) + '...'
          : event.description;

      return {
        type: event.eventType,
        description,
        actors: event.actors as string[] | undefined,
        timestamp: event.timestamp.toISOString(),
        relatedQuestion: event.relatedQuestion || undefined,
        pointsToward: event.pointsToward || undefined,
      };
    });
  }

  /**
   * Get current market snapshots
   *
   * Retrieves snapshots of both perpetual and prediction markets.
   *
   * @returns MarketSnapshots with perps, predictions, and timestamp
   */
  private async getMarketSnapshots(): Promise<MarketSnapshots> {
    const [perps, predictions] = await Promise.all([
      this.getPerpMarketSnapshots(),
      this.getPredictionMarketSnapshots(),
    ]);

    return {
      perps,
      predictions,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get perpetual market snapshots
   *
   * Retrieves current state of all perpetual markets including:
   * - Current price and 24h price change
   * - High/low prices
   * - Volume and open interest
   *
   * @returns Array of perpetual market snapshots
   */
  private async getPerpMarketSnapshots(): Promise<PerpMarketSnapshot[]> {
    const companies = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        ticker: organizations.ticker,
        currentPrice: organizations.currentPrice,
        initialPrice: organizations.initialPrice,
      })
      .from(organizations)
      .where(
        and(
          eq(organizations.type, 'company'),
          isNotNull(organizations.currentPrice)
        )
      );

    return Promise.all(
      companies.map(async (company) => {
        const currentPrice =
          company.currentPrice || company.initialPrice || 100;

        // Get 24h price history
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const priceHistory = await db
          .select()
          .from(stockPrices)
          .where(
            and(
              eq(stockPrices.organizationId, company.id),
              gte(stockPrices.timestamp, oneDayAgo)
            )
          )
          .orderBy(asc(stockPrices.timestamp));

        let change24h = 0;
        let changePercent24h = 0;
        let high24h = currentPrice;
        let low24h = currentPrice;

        if (priceHistory.length > 0) {
          const oldestPrice = priceHistory[0]!.price;
          change24h = currentPrice - oldestPrice;
          changePercent24h = (change24h / oldestPrice) * 100;

          high24h = Math.max(...priceHistory.map((p) => p.price), currentPrice);
          low24h = Math.min(...priceHistory.map((p) => p.price), currentPrice);
        }

        // Get open interest from pool positions
        const positions = await db
          .select({ size: poolPositions.size })
          .from(poolPositions)
          .where(
            and(
              eq(poolPositions.ticker, company.id),
              isNull(poolPositions.closedAt)
            )
          );

        const openInterest = positions.reduce(
          (sum, pos) => sum + Number(pos.size),
          0
        );
        const volume24h = positions.reduce(
          (sum, pos) => sum + Number(pos.size),
          0
        );

        // Use ticker field if available, fallback to transformed org ID
        const ticker =
          company.ticker || company.id.toUpperCase().replace(/-/g, '');

        return {
          ticker,
          organizationId: company.id,
          name: company.name || 'Unknown',
          currentPrice,
          change24h,
          changePercent24h,
          high24h,
          low24h,
          volume24h,
          openInterest,
        };
      })
    );
  }

  /**
   * Get prediction market snapshots
   *
   * Retrieves current state of active prediction markets.
   * Limited to top 15 most active markets to control token usage.
   *
   * @returns Array of prediction market snapshots
   *
   * @remarks
   * - Limited to 15 most active markets (by yesShares)
   * - Question text truncated to 120 characters
   * - Only includes unresolved markets with endDate >= now
   */
  private async getPredictionMarketSnapshots(): Promise<
    PredictionMarketSnapshot[]
  > {
    const marketList = await db
      .select()
      .from(markets)
      .where(and(eq(markets.resolved, false), gte(markets.endDate, new Date())))
      .orderBy(desc(markets.yesShares))
      .limit(15);

    return marketList.map((market) => {
      const yesShares = Number.parseFloat(market.yesShares.toString());
      const noShares = Number.parseFloat(market.noShares.toString());
      const totalShares = yesShares + noShares;

      const yesPrice = totalShares > 0 ? (yesShares / totalShares) * 100 : 50;
      const noPrice = totalShares > 0 ? (noShares / totalShares) * 100 : 50;
      const totalVolume = totalShares * 0.5;

      const now = new Date();
      const resolutionDate = market.endDate.toISOString();
      const daysUntilResolution = Math.max(
        0,
        Math.ceil(
          (market.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
      );

      // Truncate long question text
      const maxQuestionLength = 120;
      const text =
        market.question.length > maxQuestionLength
          ? market.question.slice(0, maxQuestionLength) + '...'
          : market.question;

      return {
        id: market.id, // Keep as Snowflake string
        text,
        yesPrice,
        noPrice,
        totalVolume,
        resolutionDate,
        daysUntilResolution,
      };
    });
  }
}
