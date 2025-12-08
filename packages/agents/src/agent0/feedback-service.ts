/**
 * Agent0 Feedback & Reputation Service
 *
 * Integrates with Agent0's on-chain feedback system
 * Allows users to rate agents and tracks Babylon's own reputation
 * Provides comprehensive feedback management including search, revoke, and append
 */

import { db, eq, gameConfigs, type JsonValue, like, users } from '@babylon/db';
import { SDK } from 'agent0-sdk';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';
import { getAgent0Client } from './Agent0Client';
import type {
  Agent0Feedback,
  Agent0FeedbackParams,
  Agent0FeedbackSearchParams,
  Agent0ReputationSummary,
  IAgent0FeedbackService,
} from './types';

/**
 * Converts an Agent0 ID string (e.g., "84532:1234") to a token ID number
 */
function parseTokenId(agentId: string): number {
  if (agentId.includes(':')) {
    const parts = agentId.split(':');
    return Number.parseInt(parts[1] || '0', 10);
  }
  return Number.parseInt(agentId, 10);
}

/**
 * Converts a 0-100 score to a -5 to +5 rating
 */
function scoreToRating(score: number): number {
  return Math.round(score / 10 - 5);
}

export interface ReputationSummary {
  agentId: string;
  averageScore: number;
  totalFeedback: number;
  skillScores: Record<string, { score: number; count: number }>;
}

/**
 * Agent0 Feedback Service
 * Implements IAgent0FeedbackService for comprehensive feedback management
 */
export class Agent0FeedbackService implements IAgent0FeedbackService {
  private sdk: SDK;
  private chainId: number;

  constructor() {
    // Determine network and chain ID (must match Agent0Client configuration)
    const network =
      (process.env.AGENT0_NETWORK as 'sepolia' | 'mainnet' | 'localnet') ||
      'sepolia';

    if (network === 'localnet') {
      this.chainId = 31337; // Hardhat default chain ID
    } else if (network === 'sepolia') {
      this.chainId = 11155111; // Ethereum Sepolia (Agent0 is on Ethereum, not Base Sepolia)
    } else {
      this.chainId = 1; // Ethereum mainnet
    }

    // Use default test key for localnet (first Hardhat account)
    const feedbackPrivateKey =
      process.env.AGENT0_FEEDBACK_PRIVATE_KEY ||
      process.env.BABYLON_AGENT0_PRIVATE_KEY ||
      (network === 'localnet'
        ? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
        : undefined);

    // Use 'node' IPFS provider for localnet, 'pinata' for production
    const isLocalnet = network === 'localnet';
    const ipfsProvider: 'node' | 'filecoinPin' | 'pinata' =
      (process.env.AGENT0_IPFS_PROVIDER as 'node' | 'filecoinPin' | 'pinata') ||
      (isLocalnet ? 'node' : 'pinata');

    // Determine RPC URL based on network
    // Agent0 operates on Ethereum (Sepolia/mainnet) for discovery layer
    // Match Agent0Client RPC URL resolution pattern
    let rpcUrl: string;
    if (network === 'localnet') {
      rpcUrl = process.env.AGENT0_RPC_URL || 'http://localhost:8545';
    } else {
      // For sepolia/mainnet, prefer AGENT0_RPC_URL, then fallback to Ethereum RPC URLs
      // Agent0 contracts are on Ethereum (Sepolia/mainnet), not Base
      rpcUrl =
        process.env.AGENT0_RPC_URL ||
        (network === 'sepolia'
          ? process.env.ETHEREUM_SEPOLIA_RPC_URL ||
            'https://ethereum-sepolia-rpc.publicnode.com'
          : process.env.ETHEREUM_RPC_URL ||
            'https://ethereum-rpc.publicnode.com');
    }

    // Validate IPFS provider configuration
    if (ipfsProvider === 'pinata' && !process.env.PINATA_JWT) {
      throw new Error(
        'PINATA_JWT is required when using pinata IPFS provider for Agent0FeedbackService'
      );
    }
    if (ipfsProvider === 'filecoinPin' && !process.env.FILECOIN_PRIVATE_KEY) {
      throw new Error(
        'FILECOIN_PRIVATE_KEY is required when using filecoinPin IPFS provider for Agent0FeedbackService'
      );
    }

    // Initialize SDK with signer for feedback submission
    try {
      this.sdk = new SDK({
        chainId: this.chainId,
        rpcUrl,
        signer: feedbackPrivateKey || '',
        ipfs: ipfsProvider,
        pinataJwt: process.env.PINATA_JWT,
        ipfsNodeUrl: isLocalnet ? 'https://ipfs.io' : undefined,
      });
    } catch (error) {
      logger.error(
        'Failed to initialize Agent0FeedbackService SDK',
        {
          error: error instanceof Error ? error.message : String(error),
          chainId: this.chainId,
          rpcUrl,
          ipfsProvider,
        },
        'Agent0FeedbackService'
      );
      throw error;
    }
  }

  /**
   * Submit feedback for an agent
   * Returns the created feedback record
   * Accepts Agent0FeedbackParams per IAgent0FeedbackService interface
   */
  async submitFeedback(params: Agent0FeedbackParams): Promise<Agent0Feedback> {
    // Convert targetAgentId to string format for SDK
    const agentId = `${this.chainId}:${params.targetAgentId}`;

    // Convert rating from -5 to +5 scale to 0-100 scale
    // -5 → 0, 0 → 50, +5 → 100
    const score = Math.round((params.rating + 5) * 10);

    try {
      logger.info('Submitting feedback to Agent0', {
        agentId,
        targetAgentId: params.targetAgentId,
        rating: params.rating,
        score,
        skill: params.skill,
      });

      // Prepare feedback using SDK
      const feedback = this.sdk.prepareFeedback(
        agentId,
        score,
        params.tags || [],
        params.comment || '',
        params.capability, // capability
        undefined, // name
        params.skill, // skill being rated
        params.task || 'game-interaction' // task type
      );

      // Submit on-chain (SDK will handle authorization)
      const result = await this.sdk.giveFeedback(agentId, feedback);

      logger.info('Feedback submitted successfully', {
        agentId,
        targetAgentId: params.targetAgentId,
        rating: params.rating,
      });

      // Store locally for tracking if transactionId provided
      if (params.transactionId) {
        await db.insert(gameConfigs).values({
          id: await generateSnowflakeId(),
          key: `agent0_feedback_${params.transactionId}`,
          value: {
            agentId,
            targetAgentId: params.targetAgentId,
            rating: params.rating,
            score,
            skill: params.skill,
            comment: params.comment,
            tags: params.tags,
            transactionId: params.transactionId,
            submittedAt: new Date().toISOString(),
          } as JsonValue,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Map SDK Feedback to Agent0Feedback
      return this.mapSdkFeedback(result);
    } catch (error) {
      logger.error('Failed to submit feedback', { error, params });
      throw error;
    }
  }

  /**
   * Get a specific feedback record
   */
  async getFeedback(
    agentId: string,
    clientAddress: string,
    feedbackIndex: number
  ): Promise<Agent0Feedback> {
    try {
      // Try Agent0Client first
      const agent0Client = getAgent0Client();
      if (agent0Client.isAvailable()) {
        return await agent0Client.getFeedback(
          agentId,
          clientAddress,
          feedbackIndex
        );
      }

      // Fallback to SDK
      const feedback = await this.sdk.getFeedback(
        agentId,
        clientAddress,
        feedbackIndex
      );
      return this.mapSdkFeedback(feedback);
    } catch (error) {
      logger.error('Failed to get feedback', {
        error,
        agentId,
        clientAddress,
        feedbackIndex,
      });
      throw error;
    }
  }

  /**
   * Search feedback for an agent with optional filters
   */
  async searchFeedback(
    agentId: string,
    params?: Partial<Agent0FeedbackSearchParams>
  ): Promise<Agent0Feedback[]> {
    try {
      // Try Agent0Client first
      const agent0Client = getAgent0Client();
      if (agent0Client.isAvailable()) {
        return await agent0Client.searchFeedback(agentId, params);
      }

      // Fallback to SDK
      const feedbacks = await this.sdk.searchFeedback(
        agentId,
        params?.tags,
        params?.capabilities,
        params?.skills,
        params?.minScore,
        params?.maxScore
      );

      return feedbacks.map((f) => this.mapSdkFeedback(f));
    } catch (error) {
      logger.error('Failed to search feedback', { error, agentId, params });
      return [];
    }
  }

  /**
   * Revoke previously submitted feedback
   */
  async revokeFeedback(
    agentId: string,
    feedbackIndex: number
  ): Promise<string> {
    try {
      // Try Agent0Client first
      const agent0Client = getAgent0Client();
      if (agent0Client.isAvailable()) {
        return await agent0Client.revokeFeedback(agentId, feedbackIndex);
      }

      // Fallback to SDK
      const txHash = await this.sdk.revokeFeedback(agentId, feedbackIndex);

      logger.info('Feedback revoked successfully', {
        agentId,
        feedbackIndex,
        txHash,
      });

      return txHash;
    } catch (error) {
      logger.error('Failed to revoke feedback', {
        error,
        agentId,
        feedbackIndex,
      });
      throw error;
    }
  }

  /**
   * Append a response to existing feedback
   */
  async appendResponse(
    agentId: string,
    clientAddress: string,
    feedbackIndex: number,
    responseUri: string,
    responseHash: string
  ): Promise<string> {
    try {
      // Try Agent0Client first
      const agent0Client = getAgent0Client();
      if (agent0Client.isAvailable()) {
        return await agent0Client.appendFeedbackResponse(
          agentId,
          clientAddress,
          feedbackIndex,
          responseUri,
          responseHash
        );
      }

      // Fallback to SDK
      const txHash = await this.sdk.appendResponse(
        agentId,
        clientAddress,
        feedbackIndex,
        { uri: responseUri, hash: responseHash }
      );

      logger.info('Response appended to feedback successfully', {
        agentId,
        clientAddress,
        feedbackIndex,
        txHash,
      });

      return txHash;
    } catch (error) {
      logger.error('Failed to append response', {
        error,
        agentId,
        clientAddress,
        feedbackIndex,
      });
      throw error;
    }
  }

  /**
   * Get reputation summary with optional tag filtering
   */
  async getReputationSummary(
    agentId: string,
    tag1?: string,
    tag2?: string
  ): Promise<Agent0ReputationSummary> {
    try {
      // Try Agent0Client first
      const agent0Client = getAgent0Client();
      if (agent0Client.isAvailable()) {
        return await agent0Client.getReputationSummary(agentId, tag1, tag2);
      }

      // Fallback to SDK
      const summary = await this.sdk.getReputationSummary(agentId, tag1, tag2);
      return {
        count: summary.count,
        averageScore: summary.averageScore,
      };
    } catch (error) {
      logger.error('Failed to get reputation summary', {
        error,
        agentId,
        tag1,
        tag2,
      });
      return { count: 0, averageScore: 0 };
    }
  }

  /**
   * Get reputation summary for an agent (legacy method)
   */
  async getAgentReputation(agentId: string): Promise<ReputationSummary | null> {
    try {
      const reputation = await this.sdk.getReputationSummary(
        agentId,
        undefined // tag filter
      );

      // Parse skill scores from feedback details if available
      const skillScores: Record<string, { score: number; count: number }> = {};

      // Try to get detailed feedback to extract skill scores
      try {
        // Check if reputation object has feedback details or if we need to fetch them separately
        // The SDK structure may vary, so we'll try multiple approaches
        const reputationObj = reputation as Record<string, unknown>;

        // If feedback array is available, parse skills from it
        if (Array.isArray(reputationObj.feedback)) {
          const feedbacks = reputationObj.feedback as Array<{
            skill?: string;
            score?: number;
          }>;

          for (const feedback of feedbacks) {
            if (feedback.skill && typeof feedback.score === 'number') {
              const skill = feedback.skill;
              if (!skillScores[skill]) {
                skillScores[skill] = { score: 0, count: 0 };
              }
              const skillData = skillScores[skill];
              if (skillData) {
                skillData.score += feedback.score;
                skillData.count += 1;
              }
            }
          }

          // Calculate averages
          for (const skill in skillScores) {
            const skillData = skillScores[skill];
            if (skillData && skillData.count > 0) {
              skillData.score = skillData.score / skillData.count;
            }
          }
        }
      } catch (parseError) {
        // If parsing fails, continue with empty skill scores
        logger.debug('Could not parse skill scores from reputation', {
          error: parseError,
          agentId,
        });
      }

      // Also check local feedback records for skill breakdown
      const localFeedback = await db
        .select()
        .from(gameConfigs)
        .where(like(gameConfigs.key, `agent0_feedback_${agentId}_%`));

      for (const config of localFeedback) {
        const feedbackData = config.value as {
          skill?: string;
          score?: number;
        } | null;
        if (feedbackData?.skill && typeof feedbackData.score === 'number') {
          const skill = feedbackData.skill;
          if (!skillScores[skill]) {
            skillScores[skill] = { score: 0, count: 0 };
          }
          const skillData = skillScores[skill];
          if (skillData) {
            skillData.score += feedbackData.score;
            skillData.count += 1;
          }
        }
      }

      // Calculate averages for local feedback
      for (const skill in skillScores) {
        const skillData = skillScores[skill];
        if (skillData && skillData.count > 0) {
          const totalScore = skillData.score;
          const count = skillData.count;
          skillData.score = totalScore / count;
        }
      }

      return {
        agentId,
        averageScore: reputation.averageScore || 0,
        totalFeedback: reputation.count || 0,
        skillScores,
      };
    } catch (error) {
      logger.error('Failed to get reputation', { error, agentId });
      return null;
    }
  }

  /**
   * Get Babylon's own reputation from Agent0
   */
  async getBabylonReputation(): Promise<ReputationSummary | null> {
    const configResult = await db
      .select()
      .from(gameConfigs)
      .where(eq(gameConfigs.key, 'agent0_registration'))
      .limit(1);
    const config = configResult[0];

    type Agent0Config = {
      agentId?: string;
    };
    const configValue = (config?.value ?? null) as Agent0Config | null;

    if (!configValue?.agentId) {
      logger.warn('Babylon not registered on Agent0');
      return null;
    }

    return await this.getAgentReputation(configValue.agentId);
  }

  /**
   * Rate another Babylon agent on Agent0
   *
   * For agents that are also registered on Agent0
   */
  async rateBabylonAgent(
    babylonAgentUserId: string,
    fromUserId: string,
    score: number,
    skill: string,
    comment?: string
  ): Promise<void> {
    // Get agent's Agent0 registration
    const agentResult = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        agentSystem: users.agentSystem,
      })
      .from(users)
      .where(eq(users.id, babylonAgentUserId))
      .limit(1);
    const agent = agentResult[0];

    if (!agent) {
      throw new Error('Agent not found');
    }

    logger.info('Rating Babylon agent', {
      agentUserId: babylonAgentUserId,
      score,
      skill,
    });

    // Check if agent has Agent0 registration in gameConfig
    const agent0ConfigResult = await db
      .select()
      .from(gameConfigs)
      .where(eq(gameConfigs.key, `agent0_registration_${babylonAgentUserId}`))
      .limit(1);
    const agent0Config = agent0ConfigResult[0];

    const agent0ConfigValue = agent0Config?.value as {
      agentId?: string;
    } | null;
    const agent0AgentId = agent0ConfigValue?.agentId;

    // If agent has Agent0 ID, submit feedback to Agent0
    if (agent0AgentId) {
      try {
        const targetAgentId = parseTokenId(agent0AgentId);
        const rating = scoreToRating(score);

        await this.submitFeedback({
          targetAgentId,
          rating,
          comment: comment || '',
          skill,
          transactionId: `babylon_rating_${fromUserId}_${Date.now()}`,
        });
        logger.info('Agent rating submitted to Agent0', {
          agentUserId: babylonAgentUserId,
          agent0AgentId,
        });
      } catch (error) {
        logger.error('Failed to submit rating to Agent0, storing locally', {
          error,
          agentUserId: babylonAgentUserId,
        });
        // Fall through to local storage
      }
    }

    // Always store locally for tracking (even if submitted to Agent0)
    await db.insert(gameConfigs).values({
      id: await generateSnowflakeId(),
      key: `local_agent_rating_${babylonAgentUserId}_${Date.now()}`,
      value: {
        agentUserId: babylonAgentUserId,
        fromUserId,
        score,
        skill,
        comment,
        agent0AgentId: agent0AgentId || null,
        ratedAt: new Date().toISOString(),
      } as JsonValue,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info('Agent rating stored locally');
  }

  /**
   * Get feedback given by a user
   */
  async getUserFeedbackHistory(
    userId: string
  ): Promise<Record<string, unknown>[]> {
    const feedbackConfigs = await db
      .select()
      .from(gameConfigs)
      .where(like(gameConfigs.key, 'agent0_feedback_%'));

    return feedbackConfigs
      .map((c) => c.value as Record<string, unknown>)
      .filter((v: Record<string, unknown>) => v.fromUserId === userId);
  }

  /**
   * Map SDK Feedback to Agent0Feedback type
   */
  private mapSdkFeedback(feedback: {
    id: [string, string, number];
    agentId: string;
    reviewer: string;
    score?: number;
    tags: string[];
    text?: string;
    context?: Record<string, unknown>;
    proofOfPayment?: Record<string, unknown>;
    fileURI?: string;
    createdAt: number;
    answers: Array<Record<string, unknown>>;
    isRevoked: boolean;
    capability?: string;
    name?: string;
    skill?: string;
    task?: string;
  }): Agent0Feedback {
    return {
      id: feedback.id,
      agentId: feedback.agentId,
      reviewer: feedback.reviewer,
      score: feedback.score,
      tags: feedback.tags,
      text: feedback.text,
      context: feedback.context,
      proofOfPayment: feedback.proofOfPayment,
      fileURI: feedback.fileURI,
      createdAt: feedback.createdAt,
      answers: feedback.answers,
      isRevoked: feedback.isRevoked,
      capability: feedback.capability,
      name: feedback.name,
      skill: feedback.skill,
      task: feedback.task,
    };
  }
}

/**
 * Singleton instance
 */
let feedbackService: Agent0FeedbackService | null = null;

export function getAgent0FeedbackService(): Agent0FeedbackService {
  if (!feedbackService) {
    feedbackService = new Agent0FeedbackService();
  }
  return feedbackService;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetAgent0FeedbackService(): void {
  feedbackService = null;
}
