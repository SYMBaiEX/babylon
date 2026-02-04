/**
 * Agent Discovery Service
 *
 * Merges local agent registry with Agent0 network discovery
 * to provide comprehensive agent search with full filter and pagination support.
 */

import type { AgentProfile } from '@babylon/a2a';
import { AgentRegistryService } from '../services/agent-registry.service';
import type { AgentRegistration } from '../types/agent-registry';
import { getAgent0Client } from './Agent0Client';
import { parseCapabilities } from './capabilities-schema';
import { ReputationBridge } from './ReputationBridge';
import type {
  Agent0SearchOptions,
  Agent0SearchResult,
  DiscoveryFilters,
  IAgentDiscoveryService,
  IReputationBridge,
} from './types';

export class AgentDiscoveryService implements IAgentDiscoveryService {
  private localRegistry: AgentRegistryService;
  private reputationBridge: IReputationBridge | null;

  constructor(
    localRegistry: AgentRegistryService,
    reputationBridge?: IReputationBridge | null
  ) {
    this.localRegistry = localRegistry;
    this.reputationBridge = reputationBridge || null;
  }

  /**
   * Discover agents from both local registry and Agent0 network
   *
   * @remarks
   * v1.5.2 SDK returns flat arrays (no pagination).
   */
  async discoverAgents(
    filters: DiscoveryFilters,
    options?: Agent0SearchOptions
  ): Promise<AgentProfile[]> {
    const results: AgentProfile[] = [];

    // Use discoverAgents() from AgentRegistryService
    // Filter locally for strategies and reputation
    const allLocalAgents = await this.localRegistry.discoverAgents({});
    const localAgents = allLocalAgents.filter((agent: AgentRegistration) => {
      // Apply strategy filter
      if (filters.strategies && filters.strategies.length > 0) {
        const agentStrategies = agent.capabilities?.strategies || [];
        const hasMatchingStrategy = filters.strategies.some((s) =>
          agentStrategies.includes(s)
        );
        if (!hasMatchingStrategy) return false;
      }

      // Apply skills filter
      if (filters.skills && filters.skills.length > 0) {
        const agentSkills = agent.capabilities?.skills || [];
        const hasMatchingSkill = filters.skills.some((s) =>
          agentSkills.includes(s)
        );
        if (!hasMatchingSkill) return false;
      }

      // Apply reputation filter
      if (filters.minReputation !== undefined) {
        const score =
          agent.onChainData?.reputationScore || agent.trustLevel * 25;
        if (score < filters.minReputation) return false;
      }

      // Apply active filter
      if (filters.active !== undefined) {
        const isActive = agent.status === 'ACTIVE';
        if (filters.active !== isActive) return false;
      }

      // Apply x402Support filter
      if (filters.x402Support !== undefined) {
        const hasX402 = agent.capabilities?.x402Support || false;
        if (filters.x402Support !== hasX402) return false;
      }

      return true;
    });

    results.push(
      ...localAgents.map((r: AgentRegistration) => this.mapToProfile(r))
    );

    // Search Agent0 network if enabled (uses unified search with feedback filters)
    if (filters.includeExternal && process.env.AGENT0_ENABLED === 'true') {
      try {
        const agent0Client = getAgent0Client();
        await agent0Client.ensureAvailable();

        const externalAgents = await agent0Client.searchAgents(
          {
            skills: filters.skills,
            strategies: filters.strategies,
            markets: filters.markets,
            minReputation: filters.minReputation,
            active: filters.active,
            x402Support: filters.x402Support,
            chains: filters.chains,
            mcp: filters.mcp,
            a2a: filters.a2a,
          },
          options
        );

        for (const agent0Data of externalAgents) {
          const profile = await this.transformAgent0SearchResult(
            agent0Data,
            this.reputationBridge
          );
          results.push(profile);
        }
      } catch {
        // Agent0 search failed, continue with local results only
      }
    }

    return this.deduplicateAndSort(results);
  }

  /**
   * Transform Agent0 search result to Babylon AgentProfile format
   */
  private async transformAgent0SearchResult(
    result: Agent0SearchResult,
    reputationBridge?: IReputationBridge | null
  ): Promise<AgentProfile> {
    let reputation;
    if (reputationBridge) {
      const aggregated = await reputationBridge.getAggregatedReputation(
        result.tokenId
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
        totalBets: 0,
        winningBets: 0,
        accuracyScore: result.reputation.accuracyScore,
        trustScore: result.reputation.trustScore,
        totalVolume: '0',
        profitLoss: 0,
        isBanned: false,
      };
    }

    return {
      agentId: `agent0-${result.tokenId}`,
      tokenId: result.tokenId,
      address: result.walletAddress,
      name: result.name,
      endpoint: result.capabilities?.a2aEndpoint || '',
      capabilities: result.capabilities,
      reputation,
      isActive: result.active ?? true,
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
  async getAgent(agentId: string): Promise<AgentProfile | null> {
    // Try Agent0 network first for agent0- prefixed IDs
    if (agentId.startsWith('agent0-')) {
      const tokenId = Number.parseInt(agentId.replace('agent0-', ''), 10);

      // Use Agent0Client
      if (process.env.AGENT0_ENABLED === 'true') {
        try {
          const agent0Client = getAgent0Client();
          await agent0Client.ensureAvailable();

          const profile = await agent0Client.getAgentProfile(tokenId);
          if (profile) {
            return {
              agentId: `agent0-${profile.tokenId}`,
              tokenId: profile.tokenId,
              address: profile.walletAddress,
              name: profile.name,
              endpoint:
                profile.endpoints?.find((e) => e.type === 'A2A')?.value || '',
              capabilities: profile.capabilities,
              reputation: {
                totalBets: 0,
                winningBets: 0,
                accuracyScore: profile.reputation.accuracyScore,
                trustScore: profile.reputation.trustScore,
                totalVolume: '0',
                profitLoss: 0,
                isBanned: false,
              },
              isActive: profile.active ?? true,
            };
          }
        } catch {
          // Agent0 lookup failed
        }
      }

      return null;
    }

    // Search local registry for non-agent0 IDs
    const allAgents = await this.localRegistry.discoverAgents({});
    const localAgent = allAgents.find(
      (a: AgentRegistration) => a.agentId === agentId
    );
    if (!localAgent) {
      return null;
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

    let reputationBridge: ReputationBridge | null = null;
    if (process.env.AGENT0_ENABLED === 'true') {
      reputationBridge = new ReputationBridge(undefined);
    }

    agentDiscoveryInstance = new AgentDiscoveryService(
      localRegistry,
      reputationBridge
    );
  }

  return agentDiscoveryInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetAgentDiscoveryService(): void {
  agentDiscoveryInstance = null;
}
