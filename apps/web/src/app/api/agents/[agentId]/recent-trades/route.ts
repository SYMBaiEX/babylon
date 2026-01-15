/**
 * Agent Recent Trades API
 *
 * @route GET /api/agents/[agentId]/recent-trades - Get agent's recent trades
 * @access Public
 *
 * @description
 * Returns recent trades for an agent. This endpoint is public so it can be
 * displayed on agent profile pages and banners. Only returns trade metadata,
 * not sensitive information.
 */

import {
  agentTrades,
  db,
  desc,
  eq,
  inArray,
  markets,
  sql,
  users,
} from '@babylon/db';
import { StaticDataRegistry } from '@babylon/engine';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});

interface RecentTrade {
  id: string;
  marketType: 'prediction' | 'perp';
  ticker: string | null;
  marketQuestion: string | null;
  action: 'open' | 'close';
  side: string | null;
  amount: number;
  pnl: number | null;
  executedAt: string;
}

interface RecentTradesResponse {
  success: boolean;
  agentId: string;
  agentName: string | null;
  isAgent: boolean;
  trades: RecentTrade[];
  totalTrades: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const { searchParams } = new URL(req.url);
  const { limit } = QuerySchema.parse({
    limit: searchParams.get('limit'),
  });

  // Check if this is an NPC from static registry
  const npcActor = StaticDataRegistry.getActor(agentId);
  const isNpc = !!npcActor;

  // For users/agents, verify it's actually an agent
  let agentName: string | null = null;
  let isValidAgent = isNpc;

  if (!isNpc) {
    const [user] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        isAgent: users.isAgent,
      })
      .from(users)
      .where(eq(users.id, agentId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    isValidAgent = user.isAgent ?? false;
    agentName = user.displayName;
  } else {
    agentName = npcActor.name;
  }

  // Fetch recent trades
  const trades = await db
    .select({
      id: agentTrades.id,
      marketType: agentTrades.marketType,
      marketId: agentTrades.marketId,
      ticker: agentTrades.ticker,
      action: agentTrades.action,
      side: agentTrades.side,
      amount: agentTrades.amount,
      pnl: agentTrades.pnl,
      executedAt: agentTrades.executedAt,
    })
    .from(agentTrades)
    .where(eq(agentTrades.agentUserId, agentId))
    .orderBy(desc(agentTrades.executedAt))
    .limit(limit);

  // Get total trade count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentTrades)
    .where(eq(agentTrades.agentUserId, agentId));

  const totalTrades = countResult?.count ?? 0;

  // Fetch market questions for prediction trades
  const marketIds = [
    ...new Set(
      trades
        .filter((t) => t.marketType === 'prediction' && t.marketId)
        .map((t) => t.marketId!)
    ),
  ];

  const marketQuestions = new Map<string, string>();
  if (marketIds.length > 0) {
    const marketsData = await db
      .select({ id: markets.id, question: markets.question })
      .from(markets)
      .where(inArray(markets.id, marketIds));

    for (const m of marketsData) {
      marketQuestions.set(m.id, m.question);
    }
  }

  // Format response
  const recentTrades: RecentTrade[] = trades.map((trade) => ({
    id: trade.id,
    marketType: trade.marketType as 'prediction' | 'perp',
    ticker: trade.ticker,
    marketQuestion: trade.marketId
      ? (marketQuestions.get(trade.marketId) ?? null)
      : null,
    action: trade.action as 'open' | 'close',
    side: trade.side,
    amount: trade.amount,
    pnl: trade.pnl,
    executedAt: trade.executedAt.toISOString(),
  }));

  logger.debug(
    'Fetched recent trades for agent',
    { agentId, tradeCount: recentTrades.length },
    'GET /api/agents/[agentId]/recent-trades'
  );

  const response: RecentTradesResponse = {
    success: true,
    agentId,
    agentName,
    isAgent: isValidAgent,
    trades: recentTrades,
    totalTrades,
  };

  return NextResponse.json(response);
}
