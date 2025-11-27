/**
 * NPC Bootstrap Service
 *
 * @description Initializes NPC agents at server startup. Loads all Actor records
 * from database, registers each NPC in AgentRegistry (if not already registered),
 * creates runtime instances using AgentRuntimeManager, and sets up NPC-specific configurations.
 *
 * Responsibilities:
 * 1. Load all Actor records from database
 * 2. Register each NPC in AgentRegistry (if not already registered)
 * 3. Create runtime instances using AgentRuntimeManager
 * 4. Set up NPC-specific configurations
 *
 * Based on: agent-unified-architecture.md
 */

import { type Actor, actors, asc, db, eq } from '@babylon/db';
import { agentRuntimeManager } from '@babylon/agents';
import { loadActorById } from '@babylon/engine';
import { logger } from '@babylon/shared';
import {
  mapActorToOASFDomains,
  mapActorToOASFSkills,
} from '@babylon/shared';
import type { ActorData } from '@babylon/shared';
import type { AgentCapabilities } from '@babylon/shared';
import { AgentStatus, AgentType } from '../types/agent-registry';
import { agentRegistry } from './agent-registry.service';

/**
 * NPC bootstrap result
 *
 * @description Contains summary of NPC bootstrap operation including total NPCs,
 * registration counts, initialization counts, failures, and error details.
 */
export interface NPCBootstrapResult {
  totalNpcs: number;
  registered: number;
  initialized: number;
  failed: number;
  errors: Array<{ actorId: string; error: string }>;
}

/**
 * NPC Bootstrap Service Class
 *
 * @description Singleton service class for bootstrapping NPC agents. Provides
 * methods to bootstrap all NPCs, bootstrap individual NPCs, remove NPCs, refresh
 * NPC configurations, and get bootstrap status.
 */
export class NPCBootstrapService {
  /**
   * Singleton instance
   * @private
   */
  private static instance: NPCBootstrapService;

  /**
   * Private constructor for singleton pattern
   * @private
   */
  private constructor() {
    logger.info(
      'NPCBootstrapService initialized',
      undefined,
      'NPCBootstrapService'
    );
  }

  /**
   * Get singleton instance
   *
   * @description Returns the singleton instance of NPCBootstrapService.
   *
   * @returns {NPCBootstrapService} Singleton instance
   */
  public static getInstance(): NPCBootstrapService {
    if (!NPCBootstrapService.instance) {
      NPCBootstrapService.instance = new NPCBootstrapService();
    }
    return NPCBootstrapService.instance;
  }

  /**
   * Bootstrap all NPC agents from Actor database
   *
   * @description Bootstraps all NPC agents from the Actor database. Called at server
   * startup. Processes NPCs sequentially to avoid overwhelming the database. Returns
   * summary with total NPCs, registration counts, initialization counts, failures, and errors.
   *
   * @returns {Promise<NPCBootstrapResult>} Bootstrap result summary
   */
  public async bootstrapAllNpcs(): Promise<NPCBootstrapResult> {
    logger.info('Starting NPC bootstrap', undefined, 'NPCBootstrapService');

    const result: NPCBootstrapResult = {
      totalNpcs: 0,
      registered: 0,
      initialized: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Load all Actor records from database
      const actorsList = await db
        .select()
        .from(actors)
        .orderBy(asc(actors.name));

      result.totalNpcs = actorsList.length;
      logger.info(
        `Found ${actorsList.length} NPCs to bootstrap`,
        undefined,
        'NPCBootstrapService'
      );

      // Bootstrap each actor in sequence (to avoid overwhelming database)
      for (const actor of actorsList) {
        try {
          const bootstrapResult = await this.bootstrapSingleNpc(actor);
          if (bootstrapResult.registered) {
            result.registered++;
          }
          if (bootstrapResult.initialized) {
            result.initialized++;
          }
        } catch (error) {
          result.failed++;
          result.errors.push({
            actorId: actor.id,
            error: error instanceof Error ? error.message : String(error),
          });
          logger.error(
            `Failed to bootstrap NPC ${actor.id}`,
            error instanceof Error ? error : new Error(String(error)),
            'NPCBootstrapService'
          );
        }
      }

      logger.info(
        `NPC bootstrap complete: ${result.initialized}/${result.totalNpcs} initialized, ${result.failed} failed`,
        { result },
        'NPCBootstrapService'
      );
    } catch (error) {
      logger.error(
        'NPC bootstrap failed',
        error instanceof Error ? error : new Error(String(error)),
        'NPCBootstrapService'
      );
      throw error;
    }

    return result;
  }

  /**
   * Bootstrap a single NPC agent
   *
   * @description Creates registry entry and runtime instance for a single NPC.
   * Loads ActorData from JSON files, builds system prompt and capabilities, registers
   * in AgentRegistry, and creates runtime instance.
   *
   * @param {Actor} actor - Actor database record
   * @returns {Promise<object>} Object indicating which operations succeeded
   * @private
   */
  private async bootstrapSingleNpc(
    actor: Actor
  ): Promise<{ registered: boolean; initialized: boolean }> {
    logger.info(
      `Bootstrapping NPC: ${actor.name} (${actor.id})`,
      undefined,
      'NPCBootstrapService'
    );

    let registered = false;
    let initialized = false;

    // Check if already registered
    const existing = await agentRegistry.getAgentById(actor.id);
    if (existing) {
      logger.info(
        `NPC ${actor.id} already registered, initializing runtime only`,
        undefined,
        'NPCBootstrapService'
      );
      // Skip registration but still initialize runtime
    } else {
      // Load ActorData from JSON files for rich configuration
      const actorData: ActorData | null = loadActorById(actor.id);
      if (!actorData) {
        throw new Error(`ActorData not found for actor ${actor.id}`);
      }

      // Build NPC system prompt from ActorData
      const systemPrompt = this.buildNpcSystemPrompt(actorData);

      // Build NPC capabilities from ActorData
      const capabilities = this.buildNpcCapabilities(actorData);

      // Register NPC in AgentRegistry
      await agentRegistry.registerNpcAgent({
        actorId: actor.id,
        systemPrompt,
        capabilities,
      });

      registered = true;
      logger.info(
        `NPC ${actor.id} registered successfully`,
        undefined,
        'NPCBootstrapService'
      );
    }

    // Create runtime instance (this will cache it)
    const runtime = await agentRuntimeManager.getRuntime(actor.id);
    initialized = true;
    logger.info(
      `NPC ${actor.id} runtime created (agentId: ${runtime.agentId})`,
      undefined,
      'NPCBootstrapService'
    );

    return { registered, initialized };
  }

  /**
   * Build system prompt for NPC from ActorData
   *
   * @description Builds system prompt using bio, category, physical description,
   * role, and other rich fields from ActorData. Adds game context about prediction
   * markets and social interactions.
   *
   * @param {ActorData} actorData - Actor data from JSON files
   * @returns {string} System prompt for NPC
   * @private
   */
  private buildNpcSystemPrompt(actorData: ActorData): string {
    const parts: string[] = [];

    // Base personality from description
    if (actorData.description) {
      parts.push(actorData.description);
    } else {
      parts.push(
        `You are ${actorData.name}, a character in the Babylon prediction market game.`
      );
    }

    // Physical description adds immersion
    if (actorData.pfpDescription) {
      parts.push(`Physical appearance: ${actorData.pfpDescription}`);
    }

    // Role provides context
    if (actorData.role) {
      parts.push(`Role: ${actorData.role}`);
    }

    // Add game context
    parts.push(
      'You participate in prediction markets, social interactions, and autonomous trading.'
    );
    parts.push(
      'You maintain your personality while engaging with users and other agents.'
    );

    return parts.join('\n\n');
  }

  /**
   * Build capabilities for NPC from ActorData
   *
   * @description Builds agent capabilities including standard NPC strategies, markets,
   * actions, OASF taxonomy skills/domains, and game network configuration. NPCs have
   * standard game capabilities plus OASF taxonomy skills/domains mapped from ActorData.
   *
   * @param {ActorData} actorData - Actor data from JSON files
   * @returns {AgentCapabilities} Agent capabilities
   * @private
   */
  private buildNpcCapabilities(actorData: ActorData): AgentCapabilities {
    // Map ActorData to OASF skills and domains using the skill mapper
    const oasfSkills = mapActorToOASFSkills(actorData);
    const oasfDomains = mapActorToOASFDomains(actorData);

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
        chainId: Number.parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532'), // Base Sepolia default
        registryAddress:
          process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA ||
          '0x0000000000000000000000000000000000000000',
        reputationAddress:
          process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA,
      },

      // OASF Taxonomy Support (Agent0 SDK v0.31.0)
      skills: oasfSkills,
      domains: oasfDomains,

      // A2A Communication Endpoints (Agent0 SDK v0.31.0)
      // Set when A2A endpoints are implemented
      a2aEndpoint: undefined,
      mcpEndpoint: undefined,
    };
  }

  /**
   * Bootstrap a specific NPC by ID
   *
   * @description Bootstraps a specific NPC by ID. Useful for adding new NPCs
   * at runtime or refreshing existing NPCs.
   *
   * @param {string} actorId - Actor ID to bootstrap
   * @returns {Promise<void>}
   * @throws {Error} If actor not found
   */
  public async bootstrapNpc(actorId: string): Promise<void> {
    const [actor] = await db
      .select()
      .from(actors)
      .where(eq(actors.id, actorId))
      .limit(1);

    if (!actor) {
      throw new Error(`Actor ${actorId} not found`);
    }

    await this.bootstrapSingleNpc(actor);
  }

  /**
   * Remove NPC from registry and clear runtime
   *
   * @description Removes NPC from runtime cache and clears runtime instance.
   * Note: Does not delete from AgentRegistry to preserve history. Status will
   * be set to TERMINATED by clearRuntimeInstance.
   *
   * @param {string} actorId - Actor ID to remove
   * @returns {Promise<void>}
   */
  public async removeNpc(actorId: string): Promise<void> {
    logger.info(`Removing NPC ${actorId}`, undefined, 'NPCBootstrapService');

    // Clear runtime from cache
    await agentRuntimeManager.clearRuntime(actorId);

    // AgentRegistry entry is preserved for history
    // Status will be set to TERMINATED by clearRuntimeInstance

    logger.info(
      `NPC ${actorId} removed successfully`,
      undefined,
      'NPCBootstrapService'
    );
  }

  /**
   * Refresh NPC configuration
   *
   * @description Reloads ActorData and recreates runtime. Clears existing runtime
   * and bootstraps again with latest ActorData.
   *
   * @param {string} actorId - Actor ID to refresh
   * @returns {Promise<void>}
   */
  public async refreshNpc(actorId: string): Promise<void> {
    logger.info(`Refreshing NPC ${actorId}`, undefined, 'NPCBootstrapService');

    // Clear existing runtime
    await agentRuntimeManager.clearRuntime(actorId);

    // Bootstrap again (will use latest ActorData)
    await this.bootstrapNpc(actorId);

    logger.info(
      `NPC ${actorId} refreshed successfully`,
      undefined,
      'NPCBootstrapService'
    );
  }

  /**
   * Get bootstrap status for all NPCs
   *
   * @description Returns bootstrap status including total NPCs, registered count,
   * initialized count, and active count.
   *
   * @returns {Promise<object>} Bootstrap status summary
   */
  public async getBootstrapStatus(): Promise<{
    totalNpcs: number;
    registered: number;
    initialized: number;
    active: number;
  }> {
    const actorsList = await db.select().from(actors);
    const totalNpcs = actorsList.length;

    const registrations = await agentRegistry.discoverAgents({
      types: [AgentType.NPC],
    });

    const registered = registrations.length;
    const initialized = registrations.filter(
      (r) =>
        r.status === AgentStatus.INITIALIZED || r.status === AgentStatus.ACTIVE
    ).length;
    const active = registrations.filter(
      (r) => r.status === AgentStatus.ACTIVE
    ).length;

    return {
      totalNpcs,
      registered,
      initialized,
      active,
    };
  }
}

// Export singleton instance
export const npcBootstrapService = NPCBootstrapService.getInstance();
