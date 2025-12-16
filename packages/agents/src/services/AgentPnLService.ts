/**
 * Agent P&L Service
 *
 * Handles P&L tracking and trade recording for agents.
 *
 * @packageDocumentation
 */

import {
  agentLogs,
  agentTrades,
  db,
  desc,
  eq,
  type JsonValue,
  users,
  withTransaction,
} from '@babylon/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';

/**
 * Service for agent profit and loss tracking
 */
export class AgentPnLService {
  /**
   * Records a trade for an agent and updates P&L
   *
   * @param params - Trade parameters
   * @param params.agentId - Agent ID
   * @param params.userId - User ID (manager)
   * @param params.marketType - Market type (prediction or perp)
   * @param params.marketId - Market ID for prediction markets
   * @param params.ticker - Ticker for perpetual markets
   * @param params.action - Trade action (open or close)
   * @param params.side - Trade side (long/short/yes/no)
   * @param params.amount - Trade amount
   * @param params.price - Trade price
   * @param params.pnl - Realized P&L (for close actions)
   * @param params.reasoning - Trade reasoning
   */
  async recordTrade(params: {
    agentId: string;
    userId: string;
    marketType: 'prediction' | 'perp';
    marketId?: string;
    ticker?: string;
    action: 'open' | 'close';
    side?: 'long' | 'short' | 'yes' | 'no';
    amount: number;
    price: number;
    pnl?: number;
    reasoning?: string;
  }): Promise<void> {
    const {
      agentId,
      marketType,
      marketId,
      ticker,
      action,
      side,
      amount,
      price,
      pnl,
      reasoning,
    } = params;

    await withTransaction(async (tx) => {
      // Create trade record
      await tx.insert(agentTrades).values({
        id: uuidv4(),
        agentUserId: agentId,
        marketType,
        marketId: marketId ?? null,
        ticker: ticker ?? null,
        action,
        side: side ?? null,
        amount,
        price,
        pnl: pnl ?? null,
        reasoning: reasoning ?? null,
      });

      // Update agent P&L if provided
      if (pnl !== undefined && pnl !== null) {
        // Get current lifetimePnL
        const agentResult = await tx
          .select({ lifetimePnL: users.lifetimePnL })
          .from(users)
          .where(eq(users.id, agentId))
          .limit(1);

        const currentPnL = agentResult[0]?.lifetimePnL
          ? Number.parseFloat(String(agentResult[0].lifetimePnL))
          : 0;

        await tx
          .update(users)
          .set({
            lifetimePnL: String(currentPnL + pnl),
            updatedAt: new Date(),
          })
          .where(eq(users.id, agentId));
      }

      // Log the trade
      await tx.insert(agentLogs).values({
        id: await generateSnowflakeId(),
        agentUserId: agentId,
        type: 'trade',
        level: 'info',
        message: `Trade executed: ${action} ${side || ''} ${amount} @ ${price}`,
        metadata: {
          marketType,
          marketId,
          ticker,
          pnl,
          reasoning,
        } as JsonValue,
      });
    });

    logger.info(
      `Trade recorded for agent ${agentId}`,
      undefined,
      'AgentPnLService'
    );
  }

  /**
   * Get agent trades
   */
  async getAgentTrades(agentUserId: string, limit = 50) {
    return db
      .select()
      .from(agentTrades)
      .where(eq(agentTrades.agentUserId, agentUserId))
      .orderBy(desc(agentTrades.executedAt))
      .limit(limit);
  }

  /**
   * Get total agent P&L for a user (manager) by summing their agents' lifetimePnL
   */
  async getUserAgentPnL(userId: string): Promise<number> {
    const agentsResult = await db
      .select({ lifetimePnL: users.lifetimePnL })
      .from(users)
      .where(eq(users.managedBy, userId));

    return agentsResult.reduce((sum, agent) => {
      return (
        sum +
        (agent.lifetimePnL ? Number.parseFloat(String(agent.lifetimePnL)) : 0)
      );
    }, 0);
  }
}

export const agentPnLService = new AgentPnLService();
