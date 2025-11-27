/**
 * Trading Activity Feed API
 *
 * @route GET /api/trades
 * @access Public
 *
 * @description
 * Public trading feed showing recent trading activity across all market types:
 * - Prediction market positions (YES/NO binary predictions)
 * - Perpetual futures positions (long/short leveraged trades)
 * - NPC/agent trades with sentiment and reasoning
 * - Balance transactions (buys, sells, deposits, withdrawals)
 *
 * @openapi
 * /api/trades:
 *   get:
 *     tags:
 *       - Trading
 *     summary: Get trading feed
 *     description: Public trading feed showing recent activity across all market types with user/agent profiles.
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Trades per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Pagination offset
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by specific user/agent
 *     responses:
 *       200:
 *         description: Trading feed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trades:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 *
 * **Trade Types:**
 * - **balance:** User balance transactions (pred_buy, pred_sell, perp operations)
 * - **npc:** Agent/NPC trades with AI reasoning and sentiment
 * - **position:** Prediction market positions with shares and pricing
 * - **perp:** Perpetual futures positions with leverage and PnL
 *
 * **Features:**
 * - Combined feed across all market types
 * - User-specific filtering
 * - Pagination support
 * - Rich trader profiles (users, agents, actors)
 * - Market metadata (questions, tickers, organizations)
 * - Real-time pricing and PnL calculations
 *
 * **Query Parameters:**
 * @query {number} limit - Trades per page (1-100, default: 50)
 * @query {number} offset - Pagination offset (default: 0)
 * @query {string} userId - Filter by specific user/agent/actor
 *
 * **Trade Object Types:**
 *
 * **Balance Transaction:**
 * @property {string} type - 'balance'
 * @property {object} user - Trader profile
 * @property {string} transactionType - Transaction type (pred_buy, pred_sell, etc.)
 * @property {string} amount - Transaction amount
 * @property {string} balanceBefore - Balance before transaction
 * @property {string} balanceAfter - Balance after transaction
 *
 * **NPC/Agent Trade:**
 * @property {string} type - 'npc'
 * @property {object} user - Agent profile
 * @property {string} marketType - Market type
 * @property {string} ticker - Trading symbol
 * @property {string} action - Trade action
 * @property {string} side - Trade side (long/short, YES/NO)
 * @property {string} sentiment - AI sentiment analysis
 * @property {string} reason - AI reasoning for trade
 *
 * **Position:**
 * @property {string} type - 'position'
 * @property {object} market - Market details
 * @property {string} side - Position side (YES/NO)
 * @property {string} shares - Number of shares
 * @property {string} avgPrice - Average entry price
 *
 * **Perpetual Position:**
 * @property {string} type - 'perp'
 * @property {object} organization - Company being traded
 * @property {string} side - Position side (long/short)
 * @property {number} leverage - Leverage multiplier
 * @property {string} entryPrice - Entry price
 * @property {string} currentPrice - Current price
 * @property {string} unrealizedPnL - Unrealized profit/loss
 * @property {string} liquidationPrice - Liquidation price
 *
 * @returns {object} Trading feed response
 * @property {array} trades - Array of trade objects (mixed types)
 * @property {number} total - Total trades before limit
 * @property {boolean} hasMore - Whether more trades available
 *
 * @throws {500} Internal server error
 *
 * @example
 * ```typescript
 * // Get recent trades
 * const feed = await fetch('/api/trades?limit=20');
 * const { trades } = await feed.json();
 *
 * // Get user's trades
 * const userTrades = await fetch(`/api/trades?userId=${userId}&limit=50`);
 *
 * // Process different trade types
 * trades.forEach(trade => {
 *   switch(trade.type) {
 *     case 'npc':
 *       console.log(`${trade.user.displayName}: ${trade.reason}`);
 *       break;
 *     case 'perp':
 *       console.log(`Perp ${trade.side} ${trade.ticker} @${trade.entryPrice}`);
 *       break;
 *     // ... handle other types
 *   }
 * });
 * ```
 *
 * @see {@link /lib/database-service} Database queries
 * @see {@link /src/app/trades/page.tsx} Trading feed UI
 * @see {@link /src/components/trading} Trading components
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@babylon/db';
import { optionalAuth } from '@babylon/api';
import { successResponse, withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  userId: z.string().optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  // Optional auth - trades are public
  await optionalAuth(request).catch(() => null);

  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const params = QuerySchema.parse({
    limit: searchParams.get('limit') || '50',
    offset: searchParams.get('offset') || '0',
    userId: searchParams.get('userId') || undefined,
  });

  logger.info('Public trading feed requested', { params }, 'GET /api/trades');

  const userFilter = params.userId ? { userId: params.userId } : {};

  // Get recent balance transactions (deposits, withdrawals, trades)
  // Only include market-related transactions (buys/sells)
  const balanceTransactions = await db.balanceTransaction.findMany({
    take: params.limit,
    skip: params.offset,
    orderBy: { createdAt: 'desc' },
    where: {
      ...userFilter,
      type: {
        in: [
          'pred_buy',
          'pred_sell',
          'perp_open',
          'perp_close',
          'perp_liquidation',
        ],
      },
    },
  });

  // Get recent point transfers (sent and received)
  const pointTransfers = await db.pointsTransaction.findMany({
    take: params.limit,
    skip: params.offset,
    orderBy: { createdAt: 'desc' },
    where: {
      ...userFilter,
      reason: {
        in: ['transfer_sent', 'transfer_received'],
      },
    },
  });

  // Fetch users for balance transactions
  const balanceUserIds = [
    ...new Set(balanceTransactions.map((tx) => tx.userId)),
  ];
  const balanceUsers = await db.user.findMany({
    where: { id: { in: balanceUserIds } },
    select: {
      id: true,
      username: true,
      displayName: true,
      profileImageUrl: true,
      isActor: true,
    },
  });
  const balanceUsersMap = new Map(balanceUsers.map((u) => [u.id, u]));

  // Fetch users for point transfers (both sender and recipient)
  const transferUserIds = new Set<string>();
  for (const transfer of pointTransfers) {
    transferUserIds.add(transfer.userId);
    // Parse metadata to get the other party's ID
    if (transfer.metadata) {
      const metadata = JSON.parse(transfer.metadata) as {
        senderId?: string;
        recipientId?: string;
        senderName?: string;
        recipientName?: string;
        message?: string;
      };
      if (metadata.senderId) transferUserIds.add(metadata.senderId);
      if (metadata.recipientId) transferUserIds.add(metadata.recipientId);
    }
  }
  const transferUsers = await db.user.findMany({
    where: { id: { in: Array.from(transferUserIds) } },
    select: {
      id: true,
      username: true,
      displayName: true,
      profileImageUrl: true,
      isActor: true,
    },
  });
  const transferUsersMap = new Map(transferUsers.map((u) => [u.id, u]));

  // Get recent NPC trades (if not filtering by specific user, or if user is an NPC)
  // Note: npcActorId references Actor.id, not User.id
  let npcTrades: Awaited<ReturnType<typeof db.npcTrade.findMany>> = [];
  if (!params.userId) {
    npcTrades = await db.npcTrade.findMany({
      take: params.limit,
      skip: params.offset,
      orderBy: { executedAt: 'desc' },
    });
  } else {
    // Check if the userId corresponds to an Actor (NPC)
    const actor = await db.actor.findUnique({
      where: { id: params.userId },
      select: { id: true },
    });

    if (actor) {
      npcTrades = await db.npcTrade.findMany({
        take: params.limit,
        skip: params.offset,
        orderBy: { executedAt: 'desc' },
        where: { npcActorId: params.userId },
      });
    }
  }

  // Fetch NPC actors for NPC trades
  // npcActorId references Actor.id, so query Actor table
  const npcActorIds = [...new Set(npcTrades.map((t) => t.npcActorId))];

  // Query both Actor and User tables to get complete profile information
  // Skip queries if no NPC trades to avoid unnecessary database calls
  const [actors, users] =
    npcActorIds.length > 0
      ? await Promise.all([
          db.actor.findMany({
            where: { id: { in: npcActorIds } },
            select: {
              id: true,
              name: true,
              profileImageUrl: true,
            },
          }),
          db.user.findMany({
            where: {
              id: { in: npcActorIds },
              isActor: true, // Only get users that are actors
            },
            select: {
              id: true,
              username: true,
              displayName: true,
              profileImageUrl: true,
              isActor: true,
            },
          }),
        ])
      : [[], []];

  // Create maps for both actors and users
  const actorsDataMap = new Map(actors.map((a) => [a.id, a]));
  const usersDataMap = new Map(users.map((u) => [u.id, u]));

  // Merge Actor and User data, preferring User data when available (more complete)
  const actorsMap = new Map<
    string,
    {
      id: string;
      username: string;
      displayName: string;
      profileImageUrl: string | null;
      isActor: boolean;
    }
  >();

  for (const actorId of npcActorIds) {
    const actor = actorsDataMap.get(actorId);
    const user = usersDataMap.get(actorId);

    // Prefer User data if available, otherwise use Actor data
    if (user) {
      actorsMap.set(actorId, {
        id: user.id,
        username:
          user.username ||
          user.displayName?.toLowerCase().replace(/\s+/g, '-') ||
          actorId,
        displayName: user.displayName || actor?.name || actorId,
        profileImageUrl: user.profileImageUrl,
        isActor: true,
      });
    } else if (actor) {
      actorsMap.set(actorId, {
        id: actor.id,
        username: actor.name.toLowerCase().replace(/\s+/g, '-'),
        displayName: actor.name,
        profileImageUrl: actor.profileImageUrl,
        isActor: true,
      });
    }
    // If neither actor nor user exists, skip adding to map
    // Trade will have user: null and will be filtered out later
  }

  // Get recent position updates (significant changes)
  const positions = await db.position.findMany({
    take: params.limit,
    skip: params.offset,
    orderBy: { updatedAt: 'desc' },
    where: {
      ...userFilter,
      shares: { gt: '0' }, // Only include positions with shares (decimal is string)
    },
  });

  // Get markets for positions
  const positionMarketIds = [...new Set(positions.map((p) => p.marketId))];
  const positionMarkets =
    positionMarketIds.length > 0
      ? await db.market.findMany({
          where: { id: { in: positionMarketIds } },
          select: {
            id: true,
            question: true,
            resolved: true,
            resolution: true,
          },
        })
      : [];
  const positionMarketMap = new Map(positionMarkets.map((m) => [m.id, m]));

  // Join positions with markets
  const positionsWithMarkets = positions.map((p) => {
    const market = positionMarketMap.get(p.marketId);
    return {
      ...p,
      Market: market || null,
    };
  });

  // Fetch users for positions
  const positionUserIds = [...new Set(positions.map((p) => p.userId))];
  const positionUsers = await db.user.findMany({
    where: { id: { in: positionUserIds } },
    select: {
      id: true,
      username: true,
      displayName: true,
      profileImageUrl: true,
      isActor: true,
    },
  });
  const positionUsersMap = new Map(positionUsers.map((u) => [u.id, u]));

  // Get perp positions for the user (if filtering)
  let perpPositions: Awaited<ReturnType<typeof db.perpPosition.findMany>> = [];
  if (params.userId) {
    perpPositions = await db.perpPosition.findMany({
      take: params.limit,
      skip: params.offset,
      orderBy: { openedAt: 'desc' },
      where: { userId: params.userId },
    });
  } else {
    // Get recent perp positions from all users
    perpPositions = await db.perpPosition.findMany({
      take: params.limit,
      skip: params.offset,
      orderBy: { openedAt: 'desc' },
    });
  }

  // Fetch organizations for perp positions
  const organizationIds = [
    ...new Set(perpPositions.map((p) => p.organizationId)),
  ];
  const organizations = await db.organization.findMany({
    where: { id: { in: organizationIds } },
    select: {
      id: true,
      name: true,
      type: true,
    },
  });
  const organizationsMap = new Map(organizations.map((o) => [o.id, o]));

  // Fetch users for perp positions
  const perpUserIds = [...new Set(perpPositions.map((p) => p.userId))];
  const perpUsers = await db.user.findMany({
    where: { id: { in: perpUserIds } },
    select: {
      id: true,
      username: true,
      displayName: true,
      profileImageUrl: true,
      isActor: true,
    },
  });
  const perpUsersMap = new Map(perpUsers.map((u) => [u.id, u]));

  // Merge and sort by timestamp
  const allTrades = [
    ...balanceTransactions.map((tx) => ({
      type: 'balance' as const,
      id: tx.id,
      timestamp: tx.createdAt,
      user: balanceUsersMap.get(tx.userId) || null,
      amount: tx.amount.toString(),
      balanceBefore: tx.balanceBefore.toString(),
      balanceAfter: tx.balanceAfter.toString(),
      transactionType: tx.type,
      description: tx.description,
      relatedId: tx.relatedId,
    })),
    ...pointTransfers.map((tx) => {
      const metadata = tx.metadata
        ? (JSON.parse(tx.metadata) as {
            senderId?: string;
            recipientId?: string;
            senderName?: string;
            recipientName?: string;
            message?: string;
          })
        : {};
      const isSent = tx.reason === 'transfer_sent';
      const otherPartyId = isSent ? metadata.recipientId : metadata.senderId;
      const otherPartyName = isSent
        ? metadata.recipientName
        : metadata.senderName;

      return {
        type: 'transfer' as const,
        id: tx.id,
        timestamp: tx.createdAt,
        user: transferUsersMap.get(tx.userId) || null,
        otherParty: otherPartyId
          ? transferUsersMap.get(otherPartyId) || {
              id: otherPartyId,
              username: otherPartyName,
              displayName: otherPartyName,
              profileImageUrl: null,
              isActor: false,
            }
          : null,
        amount: tx.amount,
        pointsBefore: tx.pointsBefore,
        pointsAfter: tx.pointsAfter,
        direction: isSent ? ('sent' as const) : ('received' as const),
        message: metadata.message,
      };
    }),
    ...npcTrades.map((trade) => {
      const actor = actorsMap.get(trade.npcActorId);
      return {
        type: 'npc' as const,
        id: trade.id,
        timestamp: trade.executedAt,
        user: actor
          ? {
              id: actor.id,
              username: actor.username,
              displayName: actor.displayName,
              profileImageUrl: actor.profileImageUrl,
              isActor: true,
            }
          : null,
        marketType: trade.marketType,
        ticker: trade.ticker,
        marketId: trade.marketId,
        action: trade.action,
        side: trade.side,
        amount: trade.amount,
        price: trade.price,
        sentiment: trade.sentiment,
        reason: trade.reason,
      };
    }),
    ...positionsWithMarkets.map((pos) => {
      const posWithMarket = pos as typeof pos & {
        Market?: {
          id: string;
          question: string;
          resolved: boolean;
          resolution: string | null;
        } | null;
      };
      const market = posWithMarket.Market;
      return {
        type: 'position' as const,
        id: pos.id,
        timestamp: pos.updatedAt,
        user: positionUsersMap.get(pos.userId) || null,
        market: market
          ? {
              id: market.id,
              question: market.question,
              resolved: market.resolved,
              resolution: market.resolution,
            }
          : null,
        side: pos.side ? 'YES' : 'NO',
        shares: pos.shares.toString(),
        avgPrice: pos.avgPrice.toString(),
        createdAt: pos.createdAt,
      };
    }),
    ...perpPositions.map((pos) => {
      const organization = organizationsMap.get(pos.organizationId);
      return {
        type: 'perp' as const,
        id: pos.id,
        timestamp: pos.openedAt,
        user: perpUsersMap.get(pos.userId) || null,
        ticker: pos.ticker,
        organization: organization
          ? {
              id: organization.id,
              name: organization.name,
              ticker: pos.ticker, // Use ticker from position since Organization doesn't have it
            }
          : null,
        side: pos.side,
        entryPrice: pos.entryPrice.toString(),
        currentPrice: pos.currentPrice.toString(),
        size: pos.size.toString(),
        leverage: pos.leverage,
        unrealizedPnL: pos.unrealizedPnL.toString(),
        liquidationPrice: pos.liquidationPrice.toString(),
        closedAt: pos.closedAt,
      };
    }),
  ].filter((trade) => trade.user !== null); // Filter out trades with missing users

  // Sort by timestamp
  allTrades.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Limit to requested amount
  const limitedTrades = allTrades.slice(0, params.limit);

  return successResponse({
    trades: limitedTrades,
    total: allTrades.length,
    hasMore: allTrades.length > params.limit,
  });
});
