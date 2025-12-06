/**
 * Test Agent Creation Utility
 *
 * Creates test agents for benchmarking and RL training with proper configuration.
 *
 * @packageDocumentation
 */

import { db, eq, like, users } from '@babylon/db';
import { ethers } from 'ethers';
import { agentRegistry } from '../services/agent-registry.service';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';
import { AgentStatus } from '../types/agent-registry';

export interface TestAgentConfig {
  username?: string;
  displayName?: string;
  virtualBalance?: number;
  agentPointsBalance?: number;
  autonomousTrading?: boolean;
  autonomousPosting?: boolean;
  autonomousCommenting?: boolean;
  autonomousDMs?: boolean;
  autonomousGroupChats?: boolean;
  agentSystem?: string;
  agentModelTier?: 'lite' | 'standard' | 'pro';
}

export interface CreateTestAgentResult {
  agentId: string;
  created: boolean;
  agent: {
    id: string;
    username: string;
    displayName: string | null;
    isAgent: boolean;
  };
}

/**
 * Creates or gets a test agent
 *
 * @param prefix - Username prefix for the test agent
 * @param config - Test agent configuration
 * @returns Test agent creation result
 */
export async function createTestAgent(
  prefix = 'test-agent',
  config: TestAgentConfig = {}
): Promise<CreateTestAgentResult> {
  const {
    username,
    displayName = `${prefix} ${Date.now().toString().slice(-6)}`,
    virtualBalance = 10000,
    agentPointsBalance = 1000,
    autonomousTrading = true,
    autonomousPosting = true,
    autonomousCommenting = true,
    autonomousDMs = false,
    autonomousGroupChats = false,
    agentSystem = 'You are an autonomous trading agent on Babylon prediction markets. Make smart trading decisions based on market analysis.',
    agentModelTier = 'lite',
  } = config;

  // Try to find existing agent with same prefix
  let agentResult;
  if (username) {
    agentResult = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
  } else {
    agentResult = await db
      .select()
      .from(users)
      .where(like(users.username, `${prefix}%`))
      .limit(1);
  }

  let agent = agentResult[0];
  let created = false;

  if (!agent) {
    // Create new agent
    const agentId = await generateSnowflakeId();
    const finalUsername = username || `${prefix}-${agentId.slice(-6)}`;

    const newAgentResult = await db
      .insert(users)
      .values({
        id: agentId,
        privyId: `did:privy:${prefix}-${agentId}`,
        username: finalUsername,
        displayName,
        walletAddress: ethers.Wallet.createRandom().address,
        isAgent: true,
        autonomousTrading,
        autonomousPosting,
        autonomousCommenting,
        autonomousDMs,
        autonomousGroupChats,
        agentSystem,
        agentModelTier,
        virtualBalance: String(virtualBalance),
        reputationPoints: 1000,
        agentPointsBalance,
        isTest: true,
        updatedAt: new Date(),
      })
      .returning();

    agent = newAgentResult[0]!;
    created = true;

    logger.info('Created test agent', {
      agentId: agent.id,
      username: agent.username,
      displayName: agent.displayName,
    });
  } else {
    logger.info('Using existing test agent', {
      agentId: agent.id,
      username: agent.username,
    });
  }

  // Register in Agent Registry if not already registered
  if (agent.isAgent) {
    try {
      // Check if already registered
      const existingReg = await agentRegistry.getAgentById(agent.id);

      if (!existingReg) {
        logger.info('Registering user agent...', { userId: agent.id });
        await agentRegistry.registerUserAgent({
          userId: agent.id,
          name: agent.displayName || agent.username || 'Test Agent',
          systemPrompt: agentSystem,
          capabilities: {
            actions: ['tweet', 'trade', 'comment'],
            version: '1.0.0',
            strategies: [],
            markets: [],
            skills: [],
            domains: [],
          },
          trustLevel: 1, // Basic trust
        });

        // Small delay to ensure persistence in test env
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Set status to ACTIVE so it's picked up by discovery
        await agentRegistry.updateAgentStatus(agent.id, AgentStatus.ACTIVE);

        logger.info('Registered and activated test agent in Agent Registry', {
          agentId: agent.id,
        });
      } else {
        // Ensure status is ACTIVE
        if (existingReg.status !== AgentStatus.ACTIVE) {
          await agentRegistry.updateAgentStatus(agent.id, AgentStatus.ACTIVE);
          logger.info('Updated test agent status to ACTIVE in Agent Registry', {
            agentId: agent.id,
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to register test agent in Agent Registry', {
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't fail the test agent creation, but log warning
    }
  }

  return {
    agentId: agent.id,
    created,
    agent: {
      id: agent.id,
      username: agent.username || 'unknown',
      displayName: agent.displayName,
      isAgent: agent.isAgent,
    },
  };
}

/**
 * Create multiple test agents
 */
export async function createTestAgents(
  count: number,
  prefix = 'test-agent',
  config: TestAgentConfig = {}
): Promise<CreateTestAgentResult[]> {
  const results: CreateTestAgentResult[] = [];

  for (let i = 0; i < count; i++) {
    const result = await createTestAgent(`${prefix}-${i}`, {
      ...config,
      displayName: config.displayName || `${prefix} ${i + 1}`,
    });
    results.push(result);

    // Small delay between creations
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Ensure test agents exist (idempotent)
 */
export async function ensureTestAgents(
  count: number,
  prefix = 'test-agent',
  config: TestAgentConfig = {}
): Promise<string[]> {
  const results = await createTestAgents(count, prefix, config);
  return results.map((r) => r.agentId);
}
