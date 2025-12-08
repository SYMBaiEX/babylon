/**
 * Agent Service v2 - Agents are Users
 *
 * Core service for agent lifecycle management. Agents are implemented as users
 * with isAgent=true, allowing them to participate fully in the platform.
 *
 * @remarks
 * Architecture: Agents ARE users (isAgent=true), not separate entities.
 * They can post, comment, join chats, trade, and do everything users can do.
 * The creating user "manages" them via the managedBy field.
 * Agent configuration is stored in the UserAgentConfig table.
 *
 * @packageDocumentation
 */

import {
  agentLogs,
  agentMessages,
  agentPointsTransactions,
  agentTrades,
  and,
  db,
  desc,
  eq,
  pointsTransactions,
  type User,
  type UserAgentConfig,
  userAgentConfigs,
  users,
  withTransaction,
} from '@babylon/db';
import type { AgentCapabilities } from '@babylon/shared';
import {
  getCurrentChainId,
  IDENTITY_REGISTRY_BASE_SEPOLIA,
  REPUTATION_SYSTEM_BASE_SEPOLIA,
} from '@babylon/shared';
import { AuthorizationError } from '../errors';
import { agentIdentityService } from '../identity/AgentIdentityService';
import { agentRuntimeManager } from '../runtime/AgentRuntimeManager';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';
import type { AgentPerformance, CreateAgentParams } from '../types';
import type { JsonValue } from '../types/common';
import { getService } from './interfaces';

/** User with agent configuration */
export type UserWithConfig = User & { agentConfig: UserAgentConfig | null };

/**
 * Get agent config for a user
 */
export async function getAgentConfig(
  userId: string
): Promise<UserAgentConfig | null> {
  const result = await db
    .select()
    .from(userAgentConfigs)
    .where(eq(userAgentConfigs.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Get user with their agent config
 */
export async function getUserWithConfig(
  userId: string
): Promise<UserWithConfig | null> {
  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userResult[0];
  if (!user) return null;

  const config = await getAgentConfig(userId);
  return { ...user, agentConfig: config };
}

/**
 * Service for agent lifecycle management
 */
export class AgentServiceV2 {
  /**
   * Creates a new agent (creates a full User with isAgent=true)
   *
   * Creates a complete user account with agent capabilities, wallet, and
   * initial configuration. The agent can immediately participate in all
   * platform activities.
   *
   * @param params - Agent creation parameters
   * @returns Created user/agent entity
   * @throws Error if manager not found or insufficient points for deposit
   */
  async createAgent(params: CreateAgentParams): Promise<User> {
    const {
      userId: managerUserId,
      name,
      description,
      profileImageUrl,
      coverImageUrl,
      system,
      bio,
      personality,
      tradingStrategy,
      initialDeposit,
    } = params;

    const managerResult = await db
      .select()
      .from(users)
      .where(eq(users.id, managerUserId))
      .limit(1);

    const manager = managerResult[0];
    if (!manager) throw new Error('Manager user not found');

    if (initialDeposit && initialDeposit > 0) {
      const totalPoints = manager.reputationPoints;
      if (totalPoints < initialDeposit) {
        throw new Error(
          `Insufficient points. Have: ${totalPoints}, Need: ${initialDeposit}`
        );
      }
    }

    const baseUsername = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .substring(0, 20);
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const agentUsername = `agent_${baseUsername}_${randomSuffix}`;
    const agentUserId = await generateSnowflakeId();

    const agent = await withTransaction(async (tx) => {
      // Create the user record
      const newAgentResult = await tx
        .insert(users)
        .values({
          id: agentUserId,
          username: agentUsername,
          displayName: name,
          bio:
            description ||
            `AI agent managed by ${manager.displayName || manager.username}`,
          profileImageUrl: profileImageUrl || null,
          coverImageUrl: coverImageUrl || null,
          isAgent: true,
          managedBy: managerUserId,
          virtualBalance: '0',
          totalDeposited: '0',
          reputationPoints: 0,
          profileComplete: true,
          hasUsername: true,
          hasBio: Boolean(description),
          hasProfileImage: Boolean(profileImageUrl),
          updatedAt: new Date(),
        })
        .returning();

      const newAgent = newAgentResult[0]!;

      // Create the agent config record
      await tx.insert(userAgentConfigs).values({
        id: await generateSnowflakeId(),
        userId: agentUserId,
        systemPrompt: system ?? null,
        personality: personality ?? null,
        tradingStrategy: tradingStrategy ?? null,
        messageExamples: bio ? JSON.parse(JSON.stringify(bio)) : null,
        pointsBalance: initialDeposit || 0,
        totalDeposited: initialDeposit || 0,
        a2aEnabled: true, // Enable A2A by default for all agents
        updatedAt: new Date(),
      });

      if (initialDeposit && initialDeposit > 0) {
        const initialManagerPoints = manager.reputationPoints;

        await tx
          .update(users)
          .set({
            reputationPoints: manager.reputationPoints - initialDeposit,
            updatedAt: new Date(),
          })
          .where(eq(users.id, managerUserId));

        await tx.insert(agentPointsTransactions).values({
          id: await generateSnowflakeId(),
          agentUserId,
          managerUserId,
          type: 'deposit',
          amount: initialDeposit,
          balanceBefore: 0,
          balanceAfter: initialDeposit,
          description: 'Initial deposit',
        });

        await tx.insert(pointsTransactions).values({
          id: await generateSnowflakeId(),
          userId: managerUserId,
          amount: -initialDeposit,
          pointsBefore: initialManagerPoints,
          pointsAfter: initialManagerPoints - initialDeposit,
          reason: `Deposit to agent: ${name}`,
          metadata: JSON.stringify({ agentUserId, agentName: name }),
        });
      }

      await tx.insert(agentLogs).values({
        id: await generateSnowflakeId(),
        agentUserId,
        type: 'system',
        level: 'info',
        message: `Agent created: ${name}`,
        metadata: { initialDeposit: initialDeposit || 0 },
      });

      return newAgent;
    });

    logger.info(
      `Agent user created: ${agentUserId} managed by ${managerUserId}`,
      undefined,
      'AgentService'
    );

    // Register agent in registry if service is available
    const agentRegistry = getService('agentRegistry');
    if (agentRegistry) {
      const capabilities: AgentCapabilities = {
        strategies: [
          'prediction_markets',
          'social_interaction',
          ...(tradingStrategy
            ? [`trading_${tradingStrategy.toLowerCase()}`]
            : []),
        ],
        markets: ['prediction', 'perpetual', 'spot'],
        actions: [
          'trade',
          'post',
          'comment',
          'like',
          'message',
          'analyze_market',
          'manage_portfolio',
        ],
        version: '1.0.0',
        x402Support: true,
        platform: 'babylon',
        userType: 'user_controlled',
        gameNetwork: {
          chainId: getCurrentChainId(),
          registryAddress: IDENTITY_REGISTRY_BASE_SEPOLIA,
          reputationAddress: REPUTATION_SYSTEM_BASE_SEPOLIA,
        },
        skills: [],
        domains: [],
      };

      await agentRegistry.registerUserAgent({
        userId: agentUserId,
        name: name,
        systemPrompt:
          system || 'You are a helpful AI agent on Babylon prediction market.',
        capabilities,
      });

      logger.info(
        `Agent ${agentUserId} registered in registry`,
        undefined,
        'AgentService'
      );
    }

    if (this.shouldAutoSetupAgentIdentity()) {
      void this.setupAgentIdentity(agentUserId);
    }

    return agent;
  }

  async getAgent(
    agentUserId: string,
    managerUserId?: string
  ): Promise<User | null> {
    const agentResult = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    const agent = agentResult[0];
    if (!agent) return null;
    if (!agent.isAgent) throw new Error('User is not an agent');
    if (managerUserId && agent.managedBy !== managerUserId) {
      throw new AuthorizationError(
        'You do not have permission to access this agent. You can only chat with agents you own.',
        'agent',
        'chat'
      );
    }
    return agent;
  }

  /**
   * Get agent with config
   */
  async getAgentWithConfig(
    agentUserId: string,
    managerUserId?: string
  ): Promise<UserWithConfig | null> {
    const agent = await this.getAgent(agentUserId, managerUserId);
    if (!agent) return null;

    const config = await getAgentConfig(agentUserId);
    return { ...agent, agentConfig: config };
  }

  async listUserAgents(
    managerUserId: string,
    filters?: { autonomousTrading?: boolean }
  ): Promise<User[]> {
    // If filtering by autonomousTrading, we need to join with userAgentConfigs
    if (filters?.autonomousTrading !== undefined) {
      const results = await db
        .select({ user: users })
        .from(users)
        .innerJoin(userAgentConfigs, eq(users.id, userAgentConfigs.userId))
        .where(
          and(
            eq(users.isAgent, true),
            eq(users.managedBy, managerUserId),
            eq(userAgentConfigs.autonomousTrading, filters.autonomousTrading)
          )
        )
        .orderBy(desc(users.createdAt));

      return results.map((r) => r.user);
    }

    return db
      .select()
      .from(users)
      .where(and(eq(users.isAgent, true), eq(users.managedBy, managerUserId)))
      .orderBy(desc(users.createdAt));
  }

  async updateAgent(
    agentUserId: string,
    managerUserId: string,
    updates: Partial<{
      name: string;
      description: string;
      profileImageUrl: string;
      system: string;
      bio: string[]; // Bio array for ElizaOS agentMessageExamples
      personality: string;
      tradingStrategy: string;
      modelTier: 'free' | 'pro';
      autonomousTrading: boolean;
      autonomousPosting: boolean;
      autonomousCommenting: boolean;
      autonomousDMs: boolean;
      autonomousGroupChats: boolean;
      a2aEnabled: boolean;
    }>
  ): Promise<User> {
    await this.getAgent(agentUserId, managerUserId); // Verify ownership

    if (
      updates.system ||
      updates.personality ||
      updates.modelTier ||
      updates.bio
    ) {
      await agentRuntimeManager.clearRuntime(agentUserId);
    }

    // Update user fields
    const userUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name) userUpdates.displayName = updates.name;
    if (updates.description) userUpdates.bio = updates.description;
    if (updates.profileImageUrl !== undefined)
      userUpdates.profileImageUrl = updates.profileImageUrl;

    if (Object.keys(userUpdates).length > 1) {
      await db.update(users).set(userUpdates).where(eq(users.id, agentUserId));
    }

    // Update agent config fields
    const configUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.system) configUpdates.systemPrompt = updates.system;
    if (updates.bio)
      configUpdates.messageExamples = JSON.stringify(updates.bio);
    if (updates.personality) configUpdates.personality = updates.personality;
    if (updates.tradingStrategy)
      configUpdates.tradingStrategy = updates.tradingStrategy;
    if (updates.modelTier) configUpdates.modelTier = updates.modelTier;
    if (updates.autonomousTrading !== undefined)
      configUpdates.autonomousTrading = updates.autonomousTrading;
    if (updates.autonomousPosting !== undefined)
      configUpdates.autonomousPosting = updates.autonomousPosting;
    if (updates.autonomousCommenting !== undefined)
      configUpdates.autonomousCommenting = updates.autonomousCommenting;
    if (updates.autonomousDMs !== undefined)
      configUpdates.autonomousDMs = updates.autonomousDMs;
    if (updates.autonomousGroupChats !== undefined)
      configUpdates.autonomousGroupChats = updates.autonomousGroupChats;
    if (updates.a2aEnabled !== undefined)
      configUpdates.a2aEnabled = updates.a2aEnabled;

    if (Object.keys(configUpdates).length > 1) {
      await db
        .update(userAgentConfigs)
        .set(configUpdates)
        .where(eq(userAgentConfigs.userId, agentUserId));
    }

    const updatedAgentResult = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    const updatedAgent = updatedAgentResult[0]!;

    await db.insert(agentLogs).values({
      id: await generateSnowflakeId(),
      agentUserId,
      type: 'system',
      level: 'info',
      message: 'Agent configuration updated',
      metadata: updates,
    });

    logger.info(`Agent updated: ${agentUserId}`, undefined, 'AgentService');
    return updatedAgent;
  }

  async deleteAgent(agentUserId: string, managerUserId: string): Promise<void> {
    const agentWithConfig = await this.getAgentWithConfig(
      agentUserId,
      managerUserId
    );
    if (!agentWithConfig) throw new Error('Agent not found');

    const pointsBalance = agentWithConfig.agentConfig?.pointsBalance ?? 0;

    await withTransaction(async (tx) => {
      // Return remaining points to manager
      if (pointsBalance > 0) {
        const managerResult = await tx
          .select({ reputationPoints: users.reputationPoints })
          .from(users)
          .where(eq(users.id, managerUserId))
          .limit(1);

        const currentPoints = managerResult[0]?.reputationPoints || 0;

        await tx
          .update(users)
          .set({
            reputationPoints: currentPoints + pointsBalance,
            updatedAt: new Date(),
          })
          .where(eq(users.id, managerUserId));

        await tx.insert(pointsTransactions).values({
          id: await generateSnowflakeId(),
          userId: managerUserId,
          amount: pointsBalance,
          pointsBefore: currentPoints,
          pointsAfter: currentPoints + pointsBalance,
          reason: `Agent deleted, points returned: ${agentWithConfig.displayName}`,
          metadata: JSON.stringify({
            agentUserId,
            agentName: agentWithConfig.displayName,
          }),
        });
      }

      // Delete agent config
      await tx
        .delete(userAgentConfigs)
        .where(eq(userAgentConfigs.userId, agentUserId));

      // Delete agent user
      await tx.delete(users).where(eq(users.id, agentUserId));
    });

    // Clear runtime from agent runtime manager
    await agentRuntimeManager.clearRuntime(agentUserId);

    logger.info(`Agent deleted: ${agentUserId}`, undefined, 'AgentService');
  }

  async depositPoints(
    agentUserId: string,
    managerUserId: string,
    amount: number
  ): Promise<User> {
    if (amount <= 0) throw new Error('Amount must be positive');
    const agentWithConfig = await this.getAgentWithConfig(
      agentUserId,
      managerUserId
    );
    if (!agentWithConfig) throw new Error('Agent not found');

    const config = agentWithConfig.agentConfig;
    if (!config) throw new Error('Agent config not found');

    const managerResult = await db
      .select()
      .from(users)
      .where(eq(users.id, managerUserId))
      .limit(1);

    const manager = managerResult[0];
    if (!manager) throw new Error('Manager not found');

    const totalPoints = manager.reputationPoints;
    if (totalPoints < amount) {
      throw new Error(
        `Insufficient points. Have: ${totalPoints}, Need: ${amount}`
      );
    }

    await withTransaction(async (tx) => {
      await tx
        .update(userAgentConfigs)
        .set({
          pointsBalance: config.pointsBalance + amount,
          totalDeposited: config.totalDeposited + amount,
          updatedAt: new Date(),
        })
        .where(eq(userAgentConfigs.userId, agentUserId));

      await tx
        .update(users)
        .set({
          reputationPoints: manager.reputationPoints - amount,
          updatedAt: new Date(),
        })
        .where(eq(users.id, managerUserId));

      await tx.insert(agentPointsTransactions).values({
        id: await generateSnowflakeId(),
        agentUserId,
        managerUserId,
        type: 'deposit',
        amount,
        balanceBefore: config.pointsBalance,
        balanceAfter: config.pointsBalance + amount,
        description: 'Points deposit',
      });

      await tx.insert(pointsTransactions).values({
        id: await generateSnowflakeId(),
        userId: managerUserId,
        amount: -amount,
        pointsBefore: totalPoints,
        pointsAfter: totalPoints - amount,
        reason: `Deposit to agent: ${agentWithConfig.displayName}`,
        metadata: JSON.stringify({
          agentUserId,
          agentName: agentWithConfig.displayName,
        }),
      });
    });

    logger.info(
      `Deposited ${amount} points to agent ${agentUserId}`,
      undefined,
      'AgentService'
    );

    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);
    return result[0]!;
  }

  async withdrawPoints(
    agentUserId: string,
    managerUserId: string,
    amount: number
  ): Promise<User> {
    if (amount <= 0) throw new Error('Amount must be positive');
    const agentWithConfig = await this.getAgentWithConfig(
      agentUserId,
      managerUserId
    );
    if (!agentWithConfig) throw new Error('Agent not found');

    const config = agentWithConfig.agentConfig;
    if (!config) throw new Error('Agent config not found');

    if (config.pointsBalance < amount) {
      throw new Error(
        `Insufficient balance. Have: ${config.pointsBalance}, Need: ${amount}`
      );
    }

    await withTransaction(async (tx) => {
      await tx
        .update(userAgentConfigs)
        .set({
          pointsBalance: config.pointsBalance - amount,
          totalWithdrawn: config.totalWithdrawn + amount,
          updatedAt: new Date(),
        })
        .where(eq(userAgentConfigs.userId, agentUserId));

      const managerResult = await tx
        .select({ reputationPoints: users.reputationPoints })
        .from(users)
        .where(eq(users.id, managerUserId))
        .limit(1);

      const managerPoints = managerResult[0]?.reputationPoints || 0;

      await tx
        .update(users)
        .set({
          reputationPoints: managerPoints + amount,
          updatedAt: new Date(),
        })
        .where(eq(users.id, managerUserId));

      await tx.insert(agentPointsTransactions).values({
        id: await generateSnowflakeId(),
        agentUserId,
        managerUserId,
        type: 'withdraw',
        amount: -amount,
        balanceBefore: config.pointsBalance,
        balanceAfter: config.pointsBalance - amount,
        description: 'Points withdrawal',
      });

      await tx.insert(pointsTransactions).values({
        id: await generateSnowflakeId(),
        userId: managerUserId,
        amount,
        pointsBefore: managerPoints,
        pointsAfter: managerPoints + amount,
        reason: `Withdrawal from agent: ${agentWithConfig.displayName}`,
        metadata: JSON.stringify({
          agentUserId,
          agentName: agentWithConfig.displayName,
        }),
      });
    });

    logger.info(
      `Withdrew ${amount} points from agent ${agentUserId}`,
      undefined,
      'AgentService'
    );

    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);
    return result[0]!;
  }

  async deductPoints(
    agentUserId: string,
    amount: number,
    reason: string,
    relatedId?: string
  ): Promise<number> {
    const config = await getAgentConfig(agentUserId);
    if (!config) throw new Error('Agent config not found');

    if (config.pointsBalance < amount) {
      throw new Error(
        `Insufficient balance. Have: ${config.pointsBalance}, Need: ${amount}`
      );
    }

    const newBalance = await withTransaction(async (tx) => {
      const result = await tx
        .update(userAgentConfigs)
        .set({
          pointsBalance: config.pointsBalance - amount,
          totalPointsSpent: config.totalPointsSpent + amount,
          updatedAt: new Date(),
        })
        .where(eq(userAgentConfigs.userId, agentUserId))
        .returning();

      // Get the user to find manager
      const userResult = await tx
        .select({ managedBy: users.managedBy })
        .from(users)
        .where(eq(users.id, agentUserId))
        .limit(1);

      const managedBy = userResult[0]?.managedBy || agentUserId;

      await tx.insert(agentPointsTransactions).values({
        id: await generateSnowflakeId(),
        type: reason.includes('chat')
          ? 'spend_chat'
          : reason.includes('post')
            ? 'spend_post'
            : 'spend_tick',
        amount: -amount,
        balanceBefore: config.pointsBalance,
        balanceAfter: config.pointsBalance - amount,
        description: reason,
        relatedId: relatedId ?? null,
        agentUserId: agentUserId,
        managerUserId: managedBy,
      });

      return result[0]!.pointsBalance;
    });

    return newBalance;
  }

  async getPerformance(agentUserId: string): Promise<AgentPerformance> {
    const agentResult = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    const agent = agentResult[0];
    if (!agent || !agent.isAgent) throw new Error('Agent not found');

    // Get trades with pnl
    const trades = await db
      .select()
      .from(agentTrades)
      .where(eq(agentTrades.agentUserId, agentUserId));

    const tradesWithPnl = trades.filter((t) => t.pnl !== null);
    const avgTradeSize =
      tradesWithPnl.length > 0
        ? tradesWithPnl.reduce((sum, t) => sum + t.amount, 0) /
          tradesWithPnl.length
        : 0;

    return {
      lifetimePnL: Number(agent.lifetimePnL),
      totalTrades: tradesWithPnl.length,
      profitableTrades: tradesWithPnl.filter((t) => t.pnl && t.pnl > 0).length,
      winRate:
        tradesWithPnl.length > 0
          ? tradesWithPnl.filter((t) => t.pnl && t.pnl > 0).length /
            tradesWithPnl.length
          : 0,
      avgTradeSize,
    };
  }

  async getChatHistory(agentUserId: string, limit = 50) {
    return db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.agentUserId, agentUserId))
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit);
  }

  async getLogs(
    agentUserId: string,
    filters?: { type?: string; level?: string; limit?: number }
  ) {
    const query = db
      .select()
      .from(agentLogs)
      .where(
        and(
          eq(agentLogs.agentUserId, agentUserId),
          ...(filters?.type ? [eq(agentLogs.type, filters.type)] : []),
          ...(filters?.level ? [eq(agentLogs.level, filters.level)] : [])
        )
      )
      .orderBy(desc(agentLogs.createdAt))
      .limit(filters?.limit || 100);

    return query;
  }

  async createLog(
    agentUserId: string,
    log: {
      type:
        | 'chat'
        | 'tick'
        | 'trade'
        | 'error'
        | 'system'
        | 'post'
        | 'comment'
        | 'dm';
      level: 'info' | 'warn' | 'error' | 'debug';
      message: string;
      prompt?: string;
      completion?: string;
      thinking?: string;
      metadata?: Record<string, JsonValue>;
    }
  ) {
    const result = await db
      .insert(agentLogs)
      .values({
        id: await generateSnowflakeId(),
        agentUserId,
        type: log.type,
        level: log.level,
        message: log.message,
        prompt: log.prompt ?? null,
        completion: log.completion ?? null,
        thinking: log.thinking ?? null,
        metadata: log.metadata
          ? JSON.parse(JSON.stringify(log.metadata))
          : null,
      })
      .returning();

    return result[0]!;
  }

  private shouldAutoSetupAgentIdentity(): boolean {
    if (process.env.AUTO_CREATE_AGENT_WALLETS === 'false') {
      return false;
    }

    // Require Privy credentials outside development so we do not spam errors
    const hasPrivyConfig = Boolean(
      process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.PRIVY_APP_SECRET
    );

    if (!hasPrivyConfig && process.env.NODE_ENV !== 'development') {
      logger.warn(
        'Skipping automatic agent identity setup - Privy credentials missing',
        undefined,
        'AgentService'
      );
      return false;
    }

    return true;
  }

  private async setupAgentIdentity(agentUserId: string): Promise<void> {
    const skipAgent0Registration = process.env.AGENT0_ENABLED !== 'true';

    const agent = await agentIdentityService.setupAgentIdentity(agentUserId, {
      skipAgent0Registration,
    });

    logger.info(
      'Agent identity setup complete',
      {
        agentUserId,
        walletProvisioned: Boolean(agent.walletAddress),
        agent0TokenId: agent.agent0TokenId,
        skippedAgent0: skipAgent0Registration,
      },
      'AgentService'
    );
  }
}

export const agentService = new AgentServiceV2();
