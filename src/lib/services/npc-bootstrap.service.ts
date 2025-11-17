/**
 * NPC Bootstrap Service
 * Initializes NPC agents at server startup
 *
 * Responsibilities:
 * 1. Load all Actor records from database
 * 2. Register each NPC in AgentRegistry (if not already registered)
 * 3. Create runtime instances using AgentRuntimeManager
 * 4. Set up NPC-specific configurations
 *
 * Based on: agent-unified-architecture.md
 */

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { agentRegistry } from './agent-registry.service'
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager'
import { loadActorById } from '@/lib/data/actors-loader'
import { mapActorToOASFSkills, mapActorToOASFDomains } from '@/lib/utils/oasf-skill-mapper'
import type { Actor } from '@prisma/client'
import type { ActorData } from '@/shared/types'
import type { AgentCapabilities } from '@/types/a2a'
import { AgentType, AgentStatus } from '@/types/agent-registry.types'

export interface NPCBootstrapResult {
  totalNpcs: number
  registered: number
  initialized: number
  failed: number
  errors: Array<{ actorId: string; error: string }>
}

export class NPCBootstrapService {
  private static instance: NPCBootstrapService

  private constructor() {
    logger.info('NPCBootstrapService initialized', undefined, 'NPCBootstrapService')
  }

  public static getInstance(): NPCBootstrapService {
    if (!NPCBootstrapService.instance) {
      NPCBootstrapService.instance = new NPCBootstrapService()
    }
    return NPCBootstrapService.instance
  }

  /**
   * Bootstrap all NPC agents from Actor database
   * Called at server startup
   */
  public async bootstrapAllNpcs(): Promise<NPCBootstrapResult> {
    logger.info('Starting NPC bootstrap', undefined, 'NPCBootstrapService')

    const result: NPCBootstrapResult = {
      totalNpcs: 0,
      registered: 0,
      initialized: 0,
      failed: 0,
      errors: [],
    }

    try {
      // Load all Actor records from database
      const actors = await prisma.actor.findMany({
        orderBy: { name: 'asc' },
      })

      result.totalNpcs = actors.length
      logger.info(
        `Found ${actors.length} NPCs to bootstrap`,
        undefined,
        'NPCBootstrapService',
      )

      // Bootstrap each actor in sequence (to avoid overwhelming database)
      for (const actor of actors) {
        try {
          await this.bootstrapSingleNpc(actor)
          result.initialized++
        } catch (error) {
          result.failed++
          result.errors.push({
            actorId: actor.id,
            error: error instanceof Error ? error.message : String(error),
          })
          logger.error(
            `Failed to bootstrap NPC ${actor.id}`,
            error instanceof Error ? error : new Error(String(error)),
            'NPCBootstrapService',
          )
        }
      }

      logger.info(
        `NPC bootstrap complete: ${result.initialized}/${result.totalNpcs} initialized, ${result.failed} failed`,
        { result },
        'NPCBootstrapService',
      )
    } catch (error) {
      logger.error(
        'NPC bootstrap failed',
        error instanceof Error ? error : new Error(String(error)),
        'NPCBootstrapService',
      )
      throw error
    }

    return result
  }

  /**
   * Bootstrap a single NPC agent
   * Creates registry entry and runtime instance
   */
  private async bootstrapSingleNpc(actor: Actor): Promise<void> {
    logger.info(
      `Bootstrapping NPC: ${actor.name} (${actor.id})`,
      undefined,
      'NPCBootstrapService',
    )

    // Check if already registered
    const existing = await agentRegistry.getAgentById(actor.id)
    if (existing) {
      logger.info(
        `NPC ${actor.id} already registered, skipping`,
        undefined,
        'NPCBootstrapService',
      )
      return
    }

    // Load ActorData from JSON files for rich configuration
    const actorData: ActorData | null = loadActorById(actor.id)
    if (!actorData) {
      throw new Error(`ActorData not found for actor ${actor.id}`)
    }

    // Build NPC system prompt from ActorData
    const systemPrompt = this.buildNpcSystemPrompt(actorData)

    // Build NPC capabilities from ActorData
    const capabilities = this.buildNpcCapabilities(actorData)

    // Register NPC in AgentRegistry
    await agentRegistry.registerNpcAgent({
      actorId: actor.id,
      systemPrompt,
      capabilities,
    })

    logger.info(
      `NPC ${actor.id} registered successfully`,
      undefined,
      'NPCBootstrapService',
    )

    // Create runtime instance (this will cache it)
    const runtime = await agentRuntimeManager.getRuntime(actor.id)
    logger.info(
      `NPC ${actor.id} runtime created (agentId: ${runtime.agentId})`,
      undefined,
      'NPCBootstrapService',
    )
  }

  /**
   * Build system prompt for NPC from ActorData
   * Uses bio, category, and other rich fields
   */
  private buildNpcSystemPrompt(actorData: ActorData): string {
    const parts: string[] = []

    // Base personality from description
    if (actorData.description) {
      parts.push(actorData.description)
    } else {
      parts.push(`You are ${actorData.name}, a character in the Babylon prediction market game.`)
    }

    // Physical description adds immersion
    if (actorData.physicalDescription) {
      parts.push(`Physical appearance: ${actorData.physicalDescription}`)
    }

    // Role provides context
    if (actorData.role) {
      parts.push(`Role: ${actorData.role}`)
    }

    // Add game context
    parts.push(
      'You participate in prediction markets, social interactions, and autonomous trading.',
    )
    parts.push('You maintain your personality while engaging with users and other agents.')

    return parts.join('\n\n')
  }

  /**
   * Build capabilities for NPC from ActorData
   * NPCs have standard game capabilities plus OASF taxonomy skills/domains
   */
  private buildNpcCapabilities(actorData: ActorData): AgentCapabilities {
    // Map ActorData to OASF skills and domains using the skill mapper
    const oasfSkills = mapActorToOASFSkills(actorData)
    const oasfDomains = mapActorToOASFDomains(actorData)

    return {
      // Standard NPC strategies
      strategies: [
        'prediction_markets',
        'social_interaction',
        'autonomous_trading',
      ],

      // NPCs can interact with all market types
      markets: ['prediction', 'perpetual', 'spot'],

      // Standard NPC actions
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

      // NPCs support x402 payments in game
      x402Support: true,

      // Platform and user type
      platform: 'babylon',
      userType: 'npc',

      // Game network configuration
      gameNetwork: {
        chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532'), // Base Sepolia default
        registryAddress: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA || '0x0000000000000000000000000000000000000000'),
        reputationAddress: process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA,
      },

      // OASF Taxonomy Support (Agent0 SDK v0.31.0)
      skills: oasfSkills,
      domains: oasfDomains,

      // A2A Communication Endpoints (Agent0 SDK v0.31.0)
      // Note: These will be set when A2A endpoints are implemented
      a2aEndpoint: undefined,
      mcpEndpoint: undefined,
    }
  }

  /**
   * Bootstrap a specific NPC by ID
   * Useful for adding new NPCs at runtime
   */
  public async bootstrapNpc(actorId: string): Promise<void> {
    const actor = await prisma.actor.findUnique({
      where: { id: actorId },
    })

    if (!actor) {
      throw new Error(`Actor ${actorId} not found`)
    }

    await this.bootstrapSingleNpc(actor)
  }

  /**
   * Remove NPC from registry and clear runtime
   * Useful for removing NPCs at runtime
   */
  public async removeNpc(actorId: string): Promise<void> {
    logger.info(
      `Removing NPC ${actorId}`,
      undefined,
      'NPCBootstrapService',
    )

    // Clear runtime from cache
    await agentRuntimeManager.clearRuntime(actorId)

    // Note: We don't delete from AgentRegistry to preserve history
    // Status will be set to TERMINATED by clearRuntimeInstance

    logger.info(
      `NPC ${actorId} removed successfully`,
      undefined,
      'NPCBootstrapService',
    )
  }

  /**
   * Refresh NPC configuration
   * Reloads ActorData and recreates runtime
   */
  public async refreshNpc(actorId: string): Promise<void> {
    logger.info(
      `Refreshing NPC ${actorId}`,
      undefined,
      'NPCBootstrapService',
    )

    // Clear existing runtime
    await agentRuntimeManager.clearRuntime(actorId)

    // Bootstrap again (will use latest ActorData)
    await this.bootstrapNpc(actorId)

    logger.info(
      `NPC ${actorId} refreshed successfully`,
      undefined,
      'NPCBootstrapService',
    )
  }

  /**
   * Get bootstrap status for all NPCs
   */
  public async getBootstrapStatus(): Promise<{
    totalNpcs: number
    registered: number
    initialized: number
    active: number
  }> {
    const actors = await prisma.actor.findMany()
    const totalNpcs = actors.length

    const registrations = await agentRegistry.discoverAgents({
      types: [AgentType.NPC],
    })

    const registered = registrations.length
    const initialized = registrations.filter(
      (r) => r.status === AgentStatus.INITIALIZED || r.status === AgentStatus.ACTIVE,
    ).length
    const active = registrations.filter((r) => r.status === AgentStatus.ACTIVE).length

    return {
      totalNpcs,
      registered,
      initialized,
      active,
    }
  }
}

// Export singleton instance
export const npcBootstrapService = NPCBootstrapService.getInstance()
