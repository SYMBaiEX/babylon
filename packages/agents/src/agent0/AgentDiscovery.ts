/**
 * Agent Discovery Service
 *
 * Merges local agent registry with Agent0 network discovery
 * to provide comprehensive agent search.
 */

import type { AgentProfile } from '@babylon/a2a';
import { AgentRegistryService } from '../services/agent-registry.service';
import type { AgentRegistration } from '../types/agent-registry';
import { parseCapabilities } from './capabilities-schema';
import { ReputationBridge } from './ReputationBridge';
import { type SubgraphAgent, SubgraphClient } from './SubgraphClient';
// Agent0Client available if needed for future enhancements
import type {
  DiscoveryFilters,
  IAgentDiscoveryService,
  IReputationBridge,
} from './types';

export class AgentDiscoveryService implements IAgentDiscoveryService {
  private localRegistry: AgentRegistryService;
  private subgraphClient: SubgraphClient;
  private reputationBridge: IReputationBridge | null;

  constructor(
    localRegistry: AgentRegistryService,
    subgraphClient: SubgraphClient,
    reputationBridge?: IReputationBridge | null
  ) {
    this.localRegistry = localRegistry;
    this.subgraphClient = subgraphClient;
    this.reputationBridge = reputationBridge || null;
  }

  /**
   * Discover agents from both local registry and Agent0 network
   */
  async discoverAgents(filters: DiscoveryFilters): Promise<AgentProfile[]> {
    const results: AgentProfile[] = [];

    // Use discoverAgents() from AgentRegistryService
    // Filter locally for strategies and reputation
    const allLocalAgents = await this.localRegistry.discoverAgents({});
    const localAgents = allLocalAgents.filter((agent: AgentRegistration) => {
      if (filters.strategies && filters.strategies.length > 0) {
        const agentStrategies = agent.capabilities?.strategies || [];
        const hasMatchingStrategy = filters.strategies.some((s) =>
          agentStrategies.includes(s)
        );
        if (!hasMatchingStrategy) return false;
      }
      if (filters.minReputation !== undefined) {
        // Map trustLevel (0-4) to reputation (0-100) approximately or use onChainData
        const score =
          agent.onChainData?.reputationScore || agent.trustLevel * 25;
        if (score < filters.minReputation) return false;
      }
      return true;
    });

    results.push(
      ...localAgents.map((r: AgentRegistration) => this.mapToProfile(r))
    );

    if (filters.includeExternal && process.env.AGENT0_ENABLED === 'true') {
      const externalAgents = await this.subgraphClient.searchAgents({
        strategies: filters.strategies,
        markets: filters.markets,
        minTrustScore: filters.minReputation,
      });

      for (const agent0Data of externalAgents) {
        const profile = await this.transformAgent0Profile(
          agent0Data,
          this.reputationBridge
        );
        results.push(profile);
      }
    }

    return this.deduplicateAndSort(results);
  }

  /**
   * Transform Agent0 subgraph data to Babylon AgentProfile format
   */
  private async transformAgent0Profile(
    agent0Data: SubgraphAgent,
    reputationBridge?: IReputationBridge | null
  ): Promise<AgentProfile> {
    const parsed = JSON.parse(agent0Data.capabilities!);
    const capabilities = parseCapabilities(parsed);

    let reputation;
    if (reputationBridge) {
      const aggregated = await reputationBridge.getAggregatedReputation(
        agent0Data.tokenId
      );
      reputation = {
        totalBets: aggregated.totalBets,
        winningBets: aggregated.winningBets,
        accuracyScore: aggregated.accuracyScore,
        trustScore: aggregated.trustScore,
        totalVolume: aggregated.totalVolume,
        profitLoss: aggregated.profitLoss,
        isBanned: aggregated.isBanned,
      };
    } else {
      reputation = {
        totalBets: agent0Data.reputation!.totalBets,
        winningBets: agent0Data.reputation!.winningBets,
        accuracyScore: agent0Data.reputation!.accuracyScore / 100,
        trustScore: agent0Data.reputation!.trustScore / 100,
        totalVolume: '0',
        profitLoss: 0,
        isBanned: false,
      };
    }

    return {
      agentId: `agent0-${agent0Data.tokenId}`,
      tokenId: agent0Data.tokenId,
      address: agent0Data.walletAddress,
      name: agent0Data.name,
      endpoint: agent0Data.a2aEndpoint!,
      capabilities,
      reputation,
      isActive: true,
    };
  }

  /**
   * Deduplicate agents by address and sort by reputation
   */
  private deduplicateAndSort(agents: AgentProfile[]): AgentProfile[] {
    // Deduplicate by address, prefer local agents (those without 'agent0-' prefix)
    const seen = new Map<string, AgentProfile>();

    for (const agent of agents) {
      const address = agent.address.toLowerCase();
      const existing = seen.get(address);

      if (
        !existing ||
        (agent.agentId && !agent.agentId.startsWith('agent0-'))
      ) {
        seen.set(address, agent);
      }
    }

    // Sort by trust score (descending)
    return Array.from(seen.values()).sort(
      (a, b) => b.reputation.trustScore - a.reputation.trustScore
    );
  }

  /**
   * Get agent by ID (searches both local and external)
   */
  async getAgent(agentId: string): Promise<AgentProfile> {
    if (agentId.startsWith('agent0-')) {
      const tokenId = Number.parseInt(agentId.replace('agent0-', ''), 10);
      const agent0Data = await this.subgraphClient.getAgent(tokenId);
      return this.transformAgent0Profile(agent0Data, this.reputationBridge);
    }

    // Use discoverAgents() and find by ID
    const allAgents = await this.localRegistry.discoverAgents({});
    const localAgent = allAgents.find(
      (a: AgentRegistration) => a.agentId === agentId
    );
    if (!localAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return this.mapToProfile(localAgent);
  }

  private mapToProfile(r: AgentRegistration): AgentProfile {
    return {
      agentId: r.agentId,
      tokenId: r.onChainData?.tokenId || 0,
      address: r.onChainData?.serverWallet || '',
      name: r.name,
      endpoint: r.capabilities.a2aEndpoint || '',
      capabilities: r.capabilities,
      reputation: {
        totalBets: 0,
        winningBets: 0,
        accuracyScore: 0,
        trustScore: r.onChainData?.reputationScore || r.trustLevel * 25,
        totalVolume: '0',
        profitLoss: 0,
        isBanned: false,
      },
      isActive: r.status === 'ACTIVE',
    };
  }
}

/**
 * Get or create singleton AgentDiscoveryService instance
 */
let agentDiscoveryInstance: AgentDiscoveryService | null = null;

export function getAgentDiscoveryService(): AgentDiscoveryService {
  if (!agentDiscoveryInstance) {
    const localRegistry = new AgentRegistryService();
    const subgraphClient = new SubgraphClient();

    let reputationBridge: ReputationBridge | null = null;
    if (process.env.AGENT0_ENABLED === 'true') {
      reputationBridge = new ReputationBridge(undefined);
    }

    agentDiscoveryInstance = new AgentDiscoveryService(
      localRegistry,
      subgraphClient,
      reputationBridge
    );
  }

  return agentDiscoveryInstance;
}
