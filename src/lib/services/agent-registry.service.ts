/**
 * Unified Agent Registry Service
 * Single source of truth for all agent types: USER_CONTROLLED, NPC, EXTERNAL
 *
 * Based on: agent-unified-architecture.md
 * Supports: ERC-8004, Agent0 SDK, A2A Protocol
 *
 * @see src/types/agent-registry.types.ts for type definitions
 */

import { prisma } from '@/lib/prisma'
import {
  AgentType,
  AgentStatus,
  TrustLevel,
} from '@/types/agent-registry.types'
import type {
  UnifiedAgentRegistration,
  AgentDiscoveryFilter,
  ExternalAgentConnectionParams,
  AgentCapabilities,
} from '@/types/agent-registry.types'
import type { Prisma } from '@prisma/client'

export class AgentRegistryService {
  /**
   * Register a USER_CONTROLLED agent from User record
   * Creates registry entry linked to existing User
   */
  async registerUserAgent(params: {
    userId: string
    name: string
    systemPrompt: string
    capabilities: AgentCapabilities
    trustLevel?: TrustLevel
  }): Promise<UnifiedAgentRegistration> {
    const { userId, name, systemPrompt, capabilities, trustLevel = 0 } = params

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new Error(`User not found: ${userId}`)
    }

    // Check if already registered
    const existing = await prisma.agentRegistry.findUnique({
      where: { userId },
    })

    if (existing) {
      throw new Error(
        `User ${userId} already registered as agent ${existing.agentId}`,
      )
    }

    // Create registry entry
    const registry = await prisma.agentRegistry.create({
      data: {
        id: `agent-user-${userId}`,
        agentId: userId,
        type: AgentType.USER_CONTROLLED,
        status: AgentStatus.REGISTERED,
        trustLevel,
        userId,
        name,
        systemPrompt,
        capabilities: {
          create: {
            id: `cap-${userId}`,
            strategies: capabilities.strategies ?? [],
            markets: capabilities.markets ?? [],
            actions: capabilities.actions ?? [],
            version: capabilities.version ?? '1.0.0',
            x402Support: capabilities.x402Support ?? false,
            platform: capabilities.platform,
            userType: capabilities.userType,
            gameNetworkChainId: capabilities.gameNetwork?.chainId,
            gameNetworkRpcUrl: capabilities.gameNetwork?.registryAddress, // A2A: registryAddress stored in rpcUrl field
            gameNetworkExplorerUrl: capabilities.gameNetwork?.reputationAddress, // A2A: reputationAddress stored in explorerUrl field
            // OASF Taxonomy Support (Agent0 SDK v0.31.0)
            skills: capabilities.skills ?? [],
            domains: capabilities.domains ?? [],
            // A2A Communication Endpoints (Agent0 SDK v0.31.0)
            a2aEndpoint: capabilities.a2aEndpoint,
            mcpEndpoint: capabilities.mcpEndpoint,
          },
        },
      },
      include: {
        capabilities: true,
        User: true,
      },
    })

    return this.mapToUnifiedRegistration(registry)
  }

  /**
   * Register an NPC agent from Actor record
   * Creates registry entry linked to existing Actor
   */
  async registerNpcAgent(params: {
    actorId: string
    systemPrompt: string
    capabilities: AgentCapabilities
  }): Promise<UnifiedAgentRegistration> {
    const { actorId, systemPrompt, capabilities } = params

    // Verify actor exists
    const actor = await prisma.actor.findUnique({
      where: { id: actorId },
    })

    if (!actor) {
      throw new Error(`Actor not found: ${actorId}`)
    }

    // Check if already registered
    const existing = await prisma.agentRegistry.findUnique({
      where: { actorId },
    })

    if (existing) {
      throw new Error(
        `Actor ${actorId} already registered as agent ${existing.agentId}`,
      )
    }

    // Create registry entry with SYSTEM trust level for NPCs
    const registry = await prisma.agentRegistry.create({
      data: {
        id: `agent-npc-${actorId}`,
        agentId: actorId,
        type: AgentType.NPC,
        status: AgentStatus.REGISTERED,
        trustLevel: 4, // SYSTEM trust level for NPCs
        actorId,
        name: actor.name,
        systemPrompt,
        capabilities: {
          create: {
            id: `cap-${actorId}`,
            strategies: capabilities.strategies ?? [],
            markets: capabilities.markets ?? [],
            actions: capabilities.actions ?? [],
            version: capabilities.version ?? '1.0.0',
            x402Support: capabilities.x402Support ?? false,
            platform: capabilities.platform,
            userType: capabilities.userType,
            gameNetworkChainId: capabilities.gameNetwork?.chainId,
            gameNetworkRpcUrl: capabilities.gameNetwork?.registryAddress, // A2A: registryAddress stored in rpcUrl field
            gameNetworkExplorerUrl: capabilities.gameNetwork?.reputationAddress, // A2A: reputationAddress stored in explorerUrl field
            // OASF Taxonomy Support (Agent0 SDK v0.31.0)
            skills: capabilities.skills ?? [],
            domains: capabilities.domains ?? [],
            // A2A Communication Endpoints (Agent0 SDK v0.31.0)
            a2aEndpoint: capabilities.a2aEndpoint,
            mcpEndpoint: capabilities.mcpEndpoint,
          },
        },
      },
      include: {
        capabilities: true,
        Actor: true,
      },
    })

    return this.mapToUnifiedRegistration(registry)
  }

  /**
   * Register an EXTERNAL agent (ElizaOS, MCP, Agent0, custom)
   * Creates registry entry with connection parameters
   */
  async registerExternalAgent(
    params: ExternalAgentConnectionParams,
  ): Promise<UnifiedAgentRegistration> {
    const {
      externalId,
      name,
      description,
      endpoint,
      protocol,
      capabilities,
      authentication,
      agentCard,
    } = params

    // Check if already registered
    const existing = await prisma.externalAgentConnection.findUnique({
      where: { externalId },
    })

    if (existing) {
      throw new Error(`External agent already registered: ${externalId}`)
    }

    // Create registry entry with UNTRUSTED trust level by default
    const registry = await prisma.agentRegistry.create({
      data: {
        id: `agent-ext-${externalId}`,
        agentId: externalId,
        type: AgentType.EXTERNAL,
        status: AgentStatus.REGISTERED,
        trustLevel: 0, // UNTRUSTED by default, must be verified
        name,
        systemPrompt: description,
        capabilities: {
          create: {
            id: `cap-${externalId}`,
            strategies: capabilities.strategies ?? [],
            markets: capabilities.markets ?? [],
            actions: capabilities.actions ?? [],
            version: capabilities.version ?? '1.0.0',
            x402Support: capabilities.x402Support ?? false,
            platform: capabilities.platform,
            userType: capabilities.userType,
            gameNetworkChainId: capabilities.gameNetwork?.chainId,
            gameNetworkRpcUrl: capabilities.gameNetwork?.registryAddress, // A2A: registryAddress stored in rpcUrl field
            gameNetworkExplorerUrl: capabilities.gameNetwork?.reputationAddress, // A2A: reputationAddress stored in explorerUrl field
            // OASF Taxonomy Support (Agent0 SDK v0.31.0)
            skills: capabilities.skills ?? [],
            domains: capabilities.domains ?? [],
            // A2A Communication Endpoints (Agent0 SDK v0.31.0)
            a2aEndpoint: capabilities.a2aEndpoint,
            mcpEndpoint: capabilities.mcpEndpoint,
          },
        },
        externalConnection: {
          create: {
            id: `ext-conn-${externalId}`,
            externalId,
            endpoint,
            protocol,
            authType: authentication?.type,
            authCredentials: authentication?.credentials, // TODO: Encrypt in production
            agentCardJson: agentCard as unknown as Prisma.InputJsonValue,
          },
        },
        // Discovery metadata from Agent Card
        discoveryCardVersion: agentCard?.version,
        discoveryEndpointA2a: agentCard?.endpoints?.a2a,
        discoveryEndpointMcp: agentCard?.endpoints?.mcp,
        discoveryEndpointRpc: agentCard?.endpoints?.rpc,
        discoveryAuthRequired: agentCard?.authentication?.required ?? false,
        discoveryAuthMethods: agentCard?.authentication?.methods ?? [],
        discoveryRateLimit: agentCard?.limits?.rateLimit,
        discoveryCostPerAction: agentCard?.limits?.costPerAction,
      },
      include: {
        capabilities: true,
        externalConnection: true,
      },
    })

    return this.mapToUnifiedRegistration(registry)
  }

  /**
   * Discover agents using flexible filters
   * Supports querying by type, status, trust level, capabilities, OASF skills/domains
   */
  async discoverAgents(
    filter: AgentDiscoveryFilter = {},
  ): Promise<UnifiedAgentRegistration[]> {
    const {
      types,
      statuses,
      minTrustLevel,
      requiredCapabilities,
      requiredSkills,
      requiredDomains,
      matchMode = 'all',
      search,
      limit = 50,
      offset = 0,
    } = filter

    // Build where clause
    const where: Prisma.AgentRegistryWhereInput = {
      AND: [
        types && types.length > 0 ? { type: { in: types } } : {},
        statuses && statuses.length > 0 ? { status: { in: statuses } } : {},
        minTrustLevel !== undefined ? { trustLevel: { gte: minTrustLevel } } : {},
        search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { systemPrompt: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    }

    const registrations = await prisma.agentRegistry.findMany({
      where,
      include: {
        capabilities: true,
        User: true,
        Actor: true,
        externalConnection: true,
      },
      orderBy: [{ trustLevel: 'desc' }, { registeredAt: 'desc' }],
      take: limit,
      skip: offset,
    })

    // Filter by required capabilities if specified
    let filtered = registrations
    if (requiredCapabilities && requiredCapabilities.length > 0) {
      filtered = filtered.filter((reg) => {
        if (!reg.capabilities) return false
        const allCaps = [
          ...(reg.capabilities.strategies || []),
          ...(reg.capabilities.markets || []),
          ...(reg.capabilities.actions || []),
        ]
        return requiredCapabilities.every((cap) => allCaps.includes(cap))
      })
    }

    // Filter by OASF skills if specified (Agent0 SDK v0.31.0)
    if (requiredSkills && requiredSkills.length > 0) {
      filtered = filtered.filter((reg) => {
        if (!reg.capabilities || !reg.capabilities.skills) return false
        const agentSkills = reg.capabilities.skills

        if (matchMode === 'all') {
          // All required skills must be present
          return requiredSkills.every((skill) => agentSkills.includes(skill))
        } else {
          // Any required skill matches
          return requiredSkills.some((skill) => agentSkills.includes(skill))
        }
      })
    }

    // Filter by OASF domains if specified (Agent0 SDK v0.31.0)
    if (requiredDomains && requiredDomains.length > 0) {
      filtered = filtered.filter((reg) => {
        if (!reg.capabilities || !reg.capabilities.domains) return false
        const agentDomains = reg.capabilities.domains

        if (matchMode === 'all') {
          // All required domains must be present
          return requiredDomains.every((domain) => agentDomains.includes(domain))
        } else {
          // Any required domain matches
          return requiredDomains.some((domain) => agentDomains.includes(domain))
        }
      })
    }

    return filtered.map((reg) => this.mapToUnifiedRegistration(reg))
  }

  /**
   * Get agent by agentId (userId for USER_CONTROLLED, actorId for NPC, externalId for EXTERNAL)
   */
  async getAgentById(agentId: string): Promise<UnifiedAgentRegistration | null> {
    const registry = await prisma.agentRegistry.findUnique({
      where: { agentId },
      include: {
        capabilities: true,
        User: true,
        Actor: true,
        externalConnection: true,
      },
    })

    if (!registry) return null

    return this.mapToUnifiedRegistration(registry)
  }

  /**
   * Update agent status (lifecycle: REGISTERED → INITIALIZED → ACTIVE → PAUSED → TERMINATED)
   */
  async updateAgentStatus(
    agentId: string,
    status: AgentStatus,
  ): Promise<UnifiedAgentRegistration> {
    const registry = await prisma.agentRegistry.update({
      where: { agentId },
      data: {
        status,
        lastActiveAt: status === AgentStatus.ACTIVE ? new Date() : undefined,
        terminatedAt: status === AgentStatus.TERMINATED ? new Date() : undefined,
      },
      include: {
        capabilities: true,
        User: true,
        Actor: true,
        externalConnection: true,
      },
    })

    return this.mapToUnifiedRegistration(registry)
  }

  /**
   * Set runtime instance ID when AgentRuntime is created
   */
  async setRuntimeInstance(
    agentId: string,
    runtimeInstanceId: string,
  ): Promise<void> {
    await prisma.agentRegistry.update({
      where: { agentId },
      data: {
        runtimeInstanceId,
        status: AgentStatus.INITIALIZED,
      },
    })
  }

  /**
   * Clear runtime instance ID when AgentRuntime is destroyed
   */
  async clearRuntimeInstance(agentId: string): Promise<void> {
    await prisma.agentRegistry.update({
      where: { agentId },
      data: {
        runtimeInstanceId: null,
        status: AgentStatus.REGISTERED,
      },
    })
  }

  /**
   * Update trust level (requires verification)
   */
  async updateTrustLevel(
    agentId: string,
    trustLevel: TrustLevel,
  ): Promise<void> {
    await prisma.agentRegistry.update({
      where: { agentId },
      data: { trustLevel },
    })
  }

  /**
   * Link external agent to User account
   * Allows EXTERNAL agents to gain USER_CONTROLLED capabilities after verification
   */
  async linkExternalAgentToUser(
    agentId: string,
    userId: string,
  ): Promise<UnifiedAgentRegistration> {
    // Verify agent is EXTERNAL type
    const registry = await prisma.agentRegistry.findUnique({
      where: { agentId },
    })

    if (!registry) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    if (registry.type !== AgentType.EXTERNAL) {
      throw new Error(
        `Only EXTERNAL agents can be linked to users. Agent ${agentId} is type ${registry.type}`,
      )
    }

    // Verify user exists and not already linked to another agent
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { AgentRegistry: true },
    })

    if (!user) {
      throw new Error(`User not found: ${userId}`)
    }

    if (user.AgentRegistry) {
      throw new Error(
        `User ${userId} already linked to agent ${user.AgentRegistry.agentId}`,
      )
    }

    // Link external agent to user
    const updated = await prisma.agentRegistry.update({
      where: { agentId },
      data: {
        userId,
        trustLevel: Math.max(registry.trustLevel, 1), // At least BASIC trust when linked
      },
      include: {
        capabilities: true,
        User: true,
        Actor: true,
        externalConnection: true,
      },
    })

    return this.mapToUnifiedRegistration(updated)
  }

  /**
   * Map Prisma model to UnifiedAgentRegistration type
   */
  private mapToUnifiedRegistration(
    registry: Prisma.AgentRegistryGetPayload<{
      include: {
        capabilities: true
      }
    }> & {
      User?: Prisma.UserGetPayload<true> | null
      Actor?: Prisma.ActorGetPayload<true> | null
      externalConnection?: Prisma.ExternalAgentConnectionGetPayload<true> | null
    },
  ): UnifiedAgentRegistration {
    // Map capabilities
    const capabilities: AgentCapabilities = registry.capabilities
      ? {
          strategies: registry.capabilities.strategies,
          markets: registry.capabilities.markets,
          actions: registry.capabilities.actions,
          version: registry.capabilities.version,
          x402Support: registry.capabilities.x402Support,
          platform: registry.capabilities.platform ?? undefined,
          userType: registry.capabilities.userType ?? undefined,
          gameNetwork: registry.capabilities.gameNetworkChainId
            ? {
                chainId: registry.capabilities.gameNetworkChainId,
                registryAddress: registry.capabilities.gameNetworkRpcUrl || '0x0000000000000000000000000000000000000000', // A2A: registryAddress read from rpcUrl field, fallback to zero address
                reputationAddress: registry.capabilities.gameNetworkExplorerUrl ?? undefined, // A2A: reputationAddress read from explorerUrl field
              }
            : undefined,
          // OASF Taxonomy Support (Agent0 SDK v0.31.0)
          skills: registry.capabilities.skills,
          domains: registry.capabilities.domains,
          // A2A Communication Endpoints (Agent0 SDK v0.31.0)
          a2aEndpoint: registry.capabilities.a2aEndpoint ?? undefined,
          mcpEndpoint: registry.capabilities.mcpEndpoint ?? undefined,
        }
      : {
          strategies: [],
          markets: [],
          actions: [],
          version: '1.0.0',
          x402Support: false,
          skills: [],
          domains: [],
        }

    return {
      agentId: registry.agentId,
      type: registry.type as AgentType,
      status: registry.status as AgentStatus,
      trustLevel: registry.trustLevel as TrustLevel,
      userId: registry.userId,
      name: registry.name,
      systemPrompt: registry.systemPrompt,
      capabilities,
      discoveryMetadata: registry.discoveryCardVersion
        ? {
            version: '1.0' as const,
            agentId: registry.agentId,
            name: registry.name,
            description: registry.systemPrompt,
            endpoints: {
              a2a: registry.discoveryEndpointA2a ?? undefined,
              mcp: registry.discoveryEndpointMcp ?? undefined,
              rpc: registry.discoveryEndpointRpc ?? undefined,
            },
            capabilities,
            authentication: registry.discoveryAuthRequired
              ? {
                  required: true,
                  methods: registry.discoveryAuthMethods as (
                    | 'apiKey'
                    | 'oauth'
                    | 'wallet'
                  )[],
                }
              : undefined,
            limits: registry.discoveryRateLimit
              ? {
                  rateLimit: registry.discoveryRateLimit,
                  costPerAction: registry.discoveryCostPerAction ?? undefined,
                }
              : undefined,
          }
        : null,
      onChainData: registry.onChainTokenId
        ? {
            tokenId: registry.onChainTokenId,
            txHash: registry.onChainTxHash ?? '',
            serverWallet: registry.onChainServerWallet ?? '',
            reputationScore: registry.onChainReputationScore ?? 0,
            chainId: registry.onChainChainId ?? 31337,
            contracts: {
              identityRegistry: registry.onChainIdentityRegistry ?? '',
              reputationSystem: registry.onChainReputationSystem ?? '',
            },
          }
        : null,
      agent0Data: registry.agent0TokenId
        ? {
            tokenId: registry.agent0TokenId,
            metadataCID: registry.agent0MetadataCID ?? '',
            subgraphData: registry.agent0SubgraphOwner
              ? {
                  owner: registry.agent0SubgraphOwner,
                  metadataURI: registry.agent0SubgraphMetadataURI ?? '',
                  timestamp: registry.agent0SubgraphTimestamp ?? 0,
                }
              : undefined,
            discoveryEndpoint: registry.agent0DiscoveryEndpoint ?? '',
          }
        : null,
      runtimeInstanceId: registry.runtimeInstanceId,
      registeredAt: registry.registeredAt,
      lastActiveAt: registry.lastActiveAt,
      terminatedAt: registry.terminatedAt,
    }
  }
}

// Export singleton instance
export const agentRegistry = new AgentRegistryService()
