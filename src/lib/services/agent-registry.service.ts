/**
 * Unified Agent Registry Service
 * 
 * @description Single source of truth for all agent types: USER_CONTROLLED, NPC, EXTERNAL.
 * Provides unified registration, discovery, and management for all agent types. Supports
 * ERC-8004, Agent0 SDK, and A2A Protocol.
 * 
 * Based on: agent-unified-architecture.md
 * 
 * @see src/types/agent-registry.types.ts for type definitions
 */

import { prisma } from '@/lib/prisma'
import {
  AgentType,
  AgentStatus,
} from '@/types/agent-registry.types'
import type {
  TrustLevel,
  UnifiedAgentRegistration,
  AgentDiscoveryFilter,
  ExternalAgentConnectionParams,
  AgentCapabilities,
} from '@/types/agent-registry.types'
import type { Prisma } from '@prisma/client'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { verifyApiKey } from '@/lib/crypto/api-keys'

const getEncryptionKey = () => {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET
  if (process.env.NODE_ENV === 'production') {
    // Throw only when actually trying to use the key in production without it
    throw new Error('CRON_SECRET must be set in production')
  }
  return 'dev-key-change-in-production-32-chars!!'
}
const ALGORITHM = 'aes-256-cbc'

/**
 * Unified Agent Registry Service Class
 * 
 * @description Service class for managing unified agent registry. Provides methods
 * for registering, discovering, and managing agents of all types (USER_CONTROLLED, NPC, EXTERNAL).
 */
export class AgentRegistryService {
  /**
   * Register a USER_CONTROLLED agent from User record
   * 
   * @description Creates registry entry linked to existing User. Verifies user exists
   * and is not already registered. Creates registry entry with USER_CONTROLLED type.
   * 
   * @param {object} params - Registration parameters
   * @param {string} params.userId - User ID
   * @param {string} params.name - Agent name
   * @param {string} params.systemPrompt - System prompt
   * @param {AgentCapabilities} params.capabilities - Agent capabilities
   * @param {TrustLevel} [params.trustLevel=0] - Trust level (default: 0)
   * @returns {Promise<UnifiedAgentRegistration>} Registered agent
   * @throws {Error} If user not found or already registered
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
   * 
   * @description Creates registry entry linked to existing Actor. Verifies actor exists
   * and is not already registered. Creates registry entry with NPC type and SYSTEM trust level.
   * 
   * @param {object} params - Registration parameters
   * @param {string} params.actorId - Actor ID
   * @param {string} params.systemPrompt - System prompt
   * @param {AgentCapabilities} params.capabilities - Agent capabilities
   * @returns {Promise<UnifiedAgentRegistration>} Registered agent
   * @throws {Error} If actor not found or already registered
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
   * 
   * @description Creates registry entry with connection parameters for external agents.
   * Verifies external agent is not already registered. Creates registry entry with EXTERNAL
   * type and UNTRUSTED trust level by default.
   * 
   * @param {ExternalAgentConnectionParams} params - External agent connection parameters
   * @returns {Promise<UnifiedAgentRegistration>} Registered agent
   * @throws {Error} If external agent already registered
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
            authCredentials: authentication?.credentials 
              ? this.encryptCredentials(authentication.credentials)
              : null,
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
   * 
   * @description Supports querying by type, status, trust level, capabilities,
   * OASF skills/domains. Returns paginated results ordered by trust level and registration date.
   * 
   * @param {AgentDiscoveryFilter} [filter={}] - Discovery filter options
   * @returns {Promise<UnifiedAgentRegistration[]>} Array of matching agents
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
   * Get agent by agentId
   * 
   * @description Gets agent by agentId (userId for USER_CONTROLLED, actorId for NPC,
   * externalId for EXTERNAL). Returns null if not found.
   * 
   * @param {string} agentId - Agent ID
   * @returns {Promise<UnifiedAgentRegistration | null>} Agent registration or null
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
   * Update agent status
   * 
   * @description Updates agent status in lifecycle: REGISTERED → INITIALIZED → ACTIVE → PAUSED → TERMINATED.
   * Updates lastActiveAt for ACTIVE status and terminatedAt for TERMINATED status.
   * 
   * @param {string} agentId - Agent ID
   * @param {AgentStatus} status - New status
   * @returns {Promise<UnifiedAgentRegistration>} Updated agent registration
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
   * 
   * @description Sets runtime instance ID and updates status to INITIALIZED when
   * AgentRuntime is created.
   * 
   * @param {string} agentId - Agent ID
   * @param {string} runtimeInstanceId - Runtime instance ID
   * @returns {Promise<void>}
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
   * 
   * @description Clears runtime instance ID and updates status to REGISTERED when
   * AgentRuntime is destroyed.
   * 
   * @param {string} agentId - Agent ID
   * @returns {Promise<void>}
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
   * Update trust level
   * 
   * @description Updates agent trust level. Requires verification before calling.
   * 
   * @param {string} agentId - Agent ID
   * @param {TrustLevel} trustLevel - New trust level
   * @returns {Promise<void>}
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
   * 
   * @description Allows EXTERNAL agents to gain USER_CONTROLLED capabilities after verification.
   * Verifies agent is EXTERNAL type and user is not already linked to another agent.
   * Updates trust level to at least BASIC when linked.
   * 
   * @param {string} agentId - External agent ID
   * @param {string} userId - User ID to link
   * @returns {Promise<UnifiedAgentRegistration>} Updated agent registration
   * @throws {Error} If agent not found, not EXTERNAL type, user not found, or user already linked
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
   * Verify external agent API key
   * 
   * @description Verifies an API key against registered external agents.
   * Decrypts stored credentials and checks hash.
   * 
   * @param {string} apiKey - API key to verify
   * @returns {Promise<UnifiedAgentRegistration | null>} Agent registration if valid, null otherwise
   */
  async verifyExternalAgentApiKey(apiKey: string): Promise<UnifiedAgentRegistration | null> {
    const agents = await prisma.externalAgentConnection.findMany({
      where: { authType: 'apiKey' },
      include: {
        AgentRegistry: {
          include: {
            capabilities: true,
            User: true,
            Actor: true,
            externalConnection: true,
          }
        }
      }
    })

    for (const agent of agents) {
      if (!agent.authCredentials) continue

      try {
        const decrypted = this.decryptCredentials(agent.authCredentials)
        const credentials = JSON.parse(decrypted)
        
        if (credentials?.apiKeyHash && verifyApiKey(apiKey, credentials.apiKeyHash)) {
          if (!agent.AgentRegistry) {
            console.warn(`[Auth] Valid key for external agent ${agent.externalId} but missing AgentRegistry link`)
            return null
          }
          return this.mapToUnifiedRegistration(agent.AgentRegistry)
        }
      } catch {
        // Continue if decryption or parsing fails
        continue
      }
    }

    return null
  }

  /**
   * Map Prisma model to UnifiedAgentRegistration type
   * 
   * @description Maps Prisma AgentRegistry model with relations to UnifiedAgentRegistration
   * type. Handles capabilities, discovery metadata, on-chain data, and Agent0 data mapping.
   * 
   * @param {object} registry - Prisma AgentRegistry model with relations
   * @returns {UnifiedAgentRegistration} Unified agent registration
   * @private
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

  /**
   * Encrypt credentials for secure storage
   * Uses AES-256-CBC encryption with random IV
   */
  private encryptCredentials(credentials: string): string {
    const iv = randomBytes(16)
    const key = Buffer.from(getEncryptionKey().padEnd(32).slice(0, 32))
    const cipher = createCipheriv(ALGORITHM, key, iv)
    
    let encrypted = cipher.update(credentials, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    return `${iv.toString('hex')}:${encrypted}`
  }

  /**
   * Decrypt credentials
   */
  private decryptCredentials(encrypted: string): string {
    const [ivHex, encryptedHex] = encrypted.split(':')
    if (!ivHex || !encryptedHex) throw new Error('Invalid encrypted format')
    
    const iv = Buffer.from(ivHex, 'hex')
    const key = Buffer.from(getEncryptionKey().padEnd(32).slice(0, 32))
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

}

// Export singleton instance
export const agentRegistry = new AgentRegistryService()
