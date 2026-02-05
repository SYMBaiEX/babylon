/**
 * Reputation Bridge
 *
 * Aggregates reputation from ERC-8004 on-chain data and Agent0 network feedback
 * to provide comprehensive reputation scores with tag-filtered support.
 * Uses Agent0 SDK directly for Ethereum mainnet queries.
 */

import { type AgentReputation, type RegistryClient } from '@babylon/a2a';
import type { SDK } from 'agent0-sdk';
import { logger } from '../shared/logger';
import type {
  Agent0ReputationSummary,
  AggregatedReputation,
  IReputationBridge,
} from './types';

export class ReputationBridge implements IReputationBridge {
  private erc8004Registry?: RegistryClient;
  private agent0SDK?: SDK;

  constructor(erc8004Registry?: RegistryClient, agent0SDK?: SDK) {
    this.erc8004Registry = erc8004Registry;
    this.agent0SDK = agent0SDK;
  }

  /**
   * Get aggregated reputation from both ERC-8004 and Agent0
   */
  async getAggregatedReputation(
    tokenId: number
  ): Promise<AggregatedReputation> {
    const [local, agent0] = await Promise.all([
      this.getLocalReputation(tokenId),
      this.getAgent0Reputation(tokenId),
    ]);

    return {
      totalBets: local.totalBets + agent0.totalBets,
      winningBets: local.winningBets + agent0.winningBets,
      accuracyScore: this.calculateWeightedAccuracy(local, agent0),
      trustScore: this.calculateTrustScore(local, agent0),
      totalVolume: this.sumVolumes(local.totalVolume, agent0.totalVolume),
      profitLoss: local.profitLoss + agent0.profitLoss,
      isBanned: local.isBanned || agent0.isBanned,
      sources: {
        local: local.trustScore,
        agent0: agent0.trustScore,
      },
    };
  }

  /**
   * Get Agent0 reputation summary with optional tag filtering
   * Uses the Agent0 SDK directly to query Ethereum mainnet
   */
  async getAgent0ReputationSummary(
    agentId: string,
    tag1?: string,
    tag2?: string
  ): Promise<Agent0ReputationSummary> {
    if (process.env.AGENT0_ENABLED !== 'true' || !this.agent0SDK) {
      return { count: 0, averageValue: 0 };
    }

    try {
      return await this.agent0SDK.getReputationSummary(agentId, tag1, tag2);
    } catch (error) {
      logger.error(
        'Failed to get Agent0 reputation summary',
        { error, agentId, tag1, tag2 },
        'ReputationBridge'
      );
      return { count: 0, averageValue: 0 };
    }
  }

  /**
   * Get reputation from ERC-8004 (local/on-chain)
   */
  private async getLocalReputation(tokenId: number): Promise<AgentReputation> {
    if (!this.erc8004Registry) {
      return this.getDefaultReputation();
    }

    return await this.erc8004Registry.getAgentReputation(tokenId);
  }

  /**
   * Get reputation from Agent0 network (Ethereum mainnet)
   */
  private async getAgent0Reputation(tokenId: number): Promise<AgentReputation> {
    // Use Agent0 SDK if enabled
    if (process.env.AGENT0_ENABLED === 'true' && this.agent0SDK) {
      try {
        // Agent0 uses Ethereum mainnet (chainId 1)
        const agentId = `1:${tokenId}`;
        const summary = await this.agent0SDK.getReputationSummary(agentId);

        return {
          totalBets: summary.count,
          winningBets: 0, // Not available in summary
          accuracyScore: summary.averageValue / 100, // Convert 0-100 to 0-1
          trustScore: summary.averageValue / 100,
          totalVolume: '0',
          profitLoss: 0,
          isBanned: false,
        };
      } catch {
        // Agent0 lookup failed
      }
    }

    return this.getDefaultReputation();
  }

  /**
   * Calculate weighted accuracy score
   * Prefers local data (60%) but incorporates Agent0 data (40%)
   */
  private calculateWeightedAccuracy(
    local: AgentReputation,
    agent0: AgentReputation
  ): number {
    const localWeight = 0.6;
    const agent0Weight = 0.4;

    // If one source has no data, use the other
    if (local.totalBets === 0 && agent0.totalBets === 0) {
      return 0;
    }

    if (local.totalBets === 0) {
      return agent0.accuracyScore;
    }

    if (agent0.totalBets === 0) {
      return local.accuracyScore;
    }

    // Weighted average
    return (
      local.accuracyScore * localWeight + agent0.accuracyScore * agent0Weight
    );
  }

  /**
   * Calculate trust score
   * Takes the maximum of both sources (more conservative)
   */
  private calculateTrustScore(
    local: AgentReputation,
    agent0: AgentReputation
  ): number {
    // If one source has no data, use the other
    if (local.totalBets === 0 && agent0.totalBets === 0) {
      return 0;
    }

    if (local.totalBets === 0) {
      return agent0.trustScore;
    }

    if (agent0.totalBets === 0) {
      return local.trustScore;
    }

    // Take maximum (more conservative - require trust from both sources)
    return Math.max(local.trustScore, agent0.trustScore);
  }

  /**
   * Sum two volume strings (wei amounts)
   */
  private sumVolumes(volume1: string, volume2: string): string {
    const v1 = BigInt(volume1 || '0');
    const v2 = BigInt(volume2 || '0');
    return (v1 + v2).toString();
  }

  /**
   * Get default reputation
   */
  private getDefaultReputation(): AgentReputation {
    return {
      totalBets: 0,
      winningBets: 0,
      accuracyScore: 0,
      trustScore: 0,
      totalVolume: '0',
      profitLoss: 0,
      isBanned: false,
    };
  }

  /**
   * Sync local reputation to Agent0 network
   * This can be called periodically to keep both systems in sync
   */
  async syncReputationToAgent0(
    tokenId: number,
    agent0Client: {
      submitFeedback: (params: {
        targetAgentId: number;
        rating: number;
        comment: string;
      }) => Promise<unknown>;
    }
  ): Promise<void> {
    logger.info(
      `Syncing reputation for token ${tokenId} to Agent0 network`,
      undefined,
      'ReputationBridge'
    );

    const localRep = await this.getLocalReputation(tokenId);

    if (localRep.totalBets === 0) {
      logger.debug(
        `No local activity for token ${tokenId}, skipping sync`,
        undefined,
        'ReputationBridge'
      );
      return;
    }

    const rating = Math.round((localRep.accuracyScore - 0.5) * 10);
    const clampedRating = Math.max(-5, Math.min(5, rating));

    const comment = `Local reputation sync: ${localRep.totalBets} bets, ${localRep.winningBets} wins, ${(localRep.accuracyScore * 100).toFixed(1)}% accuracy`;

    await agent0Client.submitFeedback({
      targetAgentId: tokenId,
      rating: clampedRating,
      comment,
    });

    logger.info(
      `✅ Synced reputation for token ${tokenId} to Agent0 network`,
      undefined,
      'ReputationBridge'
    );
  }
}
