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
import { type SubgraphAgent, SubgraphClient } from './SubgraphClient';
import type {
  Agent0FeedbackSearchParams,
  Agent0SearchOptions,
  Agent0SearchResponse,
  Agent0SearchResult,
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
   * with full filter and pagination support
   */
  async discoverAgents(
    filters: DiscoveryFilters,
    options?: Agent0SearchOptions
  ): Promise<Agent0SearchResponse<AgentProfile>> {
    const results: AgentProfile[] = [];
    let nextCursor: string | undefined;

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

    // Search Agent0 network if enabled
    if (filters.includeExternal && process.env.AGENT0_ENABLED === 'true') {
      try {
        const agent0Client = getAgent0Client();

        if (agent0Client.isAvailable()) {
          const searchResponse = await agent0Client.searchAgents(
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

          for (const agent0Data of searchResponse.items) {
            const profile = await this.transformAgent0SearchResult(
              agent0Data,
              this.reputationBridge
            );
            results.push(profile);
          }

          nextCursor = searchResponse.nextCursor;
        } else {
          // Fallback to subgraph client
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
      } catch {
        // Fallback to subgraph client on error
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
    }

    const deduplicated = this.deduplicateAndSort(results);

    return {
      items: deduplicated,
      nextCursor,
    };
  }

  /**
   * Discover agents by reputation using Agent0's feedback-based search
   */
  async discoverAgentsByReputation(
    params: Agent0FeedbackSearchParams,
    options?: Agent0SearchOptions
  ): Promise<Agent0SearchResponse<AgentProfile>> {
    if (process.env.AGENT0_ENABLED !== 'true') {
      return { items: [] };
    }

    try {
      const agent0Client = getAgent0Client();

      if (!agent0Client.isAvailable()) {
        return { items: [] };
      }

      const searchResponse = await agent0Client.searchAgentsByReputation(
        params,
        options
      );

      const profiles: AgentProfile[] = [];
      for (const agent0Data of searchResponse.items) {
        const profile = await this.transformAgent0SearchResult(
          agent0Data,
          this.reputationBridge
        );
        profiles.push(profile);
      }

      return {
        items: profiles,
        nextCursor: searchResponse.nextCursor,
        meta: searchResponse.meta,
      };
    } catch {
      return { items: [] };
    }
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
   * Transform Agent0 subgraph data to Babylon AgentProfile format
   */
  private async transformAgent0Profile(
    agent0Data: SubgraphAgent,
    reputationBridge?: IReputationBridge | null
  ): Promise<AgentProfile> {
    // Parse capabilities defensively - provide defaults if missing
    const defaultCapabilities = {
      strategies: [],
      markets: [],
      actions: [],
      version: '1.0.0',
      skills: [],
      domains: [],
    };
    const capabilities = agent0Data.capabilities
      ? parseCapabilities(JSON.parse(agent0Data.capabilities))
      : defaultCapabilities;

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
      // Use optional chaining for reputation - may be undefined
      reputation = {
        totalBets: agent0Data.reputation?.totalBets ?? 0,
        winningBets: agent0Data.reputation?.winningBets ?? 0,
        accuracyScore: (agent0Data.reputation?.accuracyScore ?? 0) / 100,
        trustScore: (agent0Data.reputation?.trustScore ?? 0) / 100,
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
      endpoint: agent0Data.a2aEndpoint ?? '',
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
  async getAgent(agentId: string): Promise<AgentProfile | null> {
    // Try Agent0 network first for agent0- prefixed IDs
    if (agentId.startsWith('agent0-')) {
      const tokenId = Number.parseInt(agentId.replace('agent0-', ''), 10);

      // Try Agent0Client first
      if (process.env.AGENT0_ENABLED === 'true') {
        try {
          const agent0Client = getAgent0Client();
          if (agent0Client.isAvailable()) {
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
          }
        } catch {
          // Fallback to subgraph
        }
      }

      // Fallback to subgraph client
      const agent0Data = await this.subgraphClient.getAgent(tokenId);
      if (!agent0Data) {
        return null;
      }
      return this.transformAgent0Profile(agent0Data, this.reputationBridge);
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

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetAgentDiscoveryService(): void {
  agentDiscoveryInstance = null;
}
