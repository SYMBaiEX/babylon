/**
 * Agent P&L Service
 *
 * Handles P&L tracking, trade recording, and rollup to user accounts
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

export class AgentPnLService {
  /**
   * Record a trade for an agent
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
      userId,
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

        // Roll up to manager's totalAgentPnL
        const managerResult = await tx
          .select({ totalAgentPnL: users.totalAgentPnL })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        const currentManagerPnL = managerResult[0]?.totalAgentPnL
          ? Number.parseFloat(String(managerResult[0].totalAgentPnL))
          : 0;

        await tx
          .update(users)
          .set({
            totalAgentPnL: String(currentManagerPnL + pnl),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
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

  async getUserAgentPnL(userId: string): Promise<number> {
    const userResult = await db
      .select({ totalAgentPnL: users.totalAgentPnL })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userResult[0];
    return user ? Number.parseFloat(String(user.totalAgentPnL)) : 0;
  }

  async syncUserAgentPnL(userId: string): Promise<void> {
    // Filter by managedBy in application since Drizzle needs specific query
    const agentsResult = await db
      .select({ lifetimePnL: users.lifetimePnL, managedBy: users.managedBy })
      .from(users)
      .where(eq(users.managedBy, userId));

    const totalPnL = agentsResult.reduce((sum, agent) => {
      return (
        sum +
        (agent.lifetimePnL ? Number.parseFloat(String(agent.lifetimePnL)) : 0)
      );
    }, 0);

    await db
      .update(users)
      .set({
        totalAgentPnL: String(totalPnL),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    logger.info(
      `Synced agent P&L for user ${userId}: ${totalPnL}`,
      undefined,
      'AgentPnLService'
    );
  }
}

export const agentPnLService = new AgentPnLService();
