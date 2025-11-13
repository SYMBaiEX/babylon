/**
 * Multi-Agent Runtime Manager
 * 
 * Manages multiple concurrent Eliza agent runtimes in a serverless environment.
 * Each agent gets its own isolated runtime instance with its own character configuration.
 */

import { AgentRuntime, type Character, type UUID } from '@elizaos/core'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { groqPlugin } from '../plugins/groq'
import { enhanceRuntimeWithBabylon } from '../plugins/babylon/integration'

// Global runtime cache for warm container reuse
const globalRuntimes = new Map<string, AgentRuntime>()

export class AgentRuntimeManager {
  private static instance: AgentRuntimeManager

  private constructor() {
    logger.info('AgentRuntimeManager initialized', undefined, 'AgentRuntimeManager')
  }

  public static getInstance(): AgentRuntimeManager {
    if (!AgentRuntimeManager.instance) {
      AgentRuntimeManager.instance = new AgentRuntimeManager()
    }
    return AgentRuntimeManager.instance
  }

  /**
   * Get or create a runtime for a specific agent (agent is a User with isAgent=true)
   */
  public async getRuntime(agentUserId: string): Promise<AgentRuntime> {
    // Check cache first
    if (globalRuntimes.has(agentUserId)) {
      const runtime = globalRuntimes.get(agentUserId)!
      logger.info(`Using cached runtime for agent ${agentUserId}`, undefined, 'AgentRuntimeManager')
      return runtime
    }

    // Fetch agent user from database
    const agentUser = await prisma.user.findUnique({
      where: { id: agentUserId }
    })

    if (!agentUser) {
      throw new Error(`Agent user ${agentUserId} not found`)
    }

    if (!agentUser.isAgent) {
      throw new Error(`User ${agentUserId} is not an agent`)
    }

    // Helper to safely parse JSON fields
    const safeParseJSON = (value: string | null | undefined, fallback: any): any => {
      if (!value) return fallback
      try {
        return JSON.parse(value as string)
      } catch (error) {
        logger.warn('Failed to parse JSON field', { 
          value: value?.substring(0, 50),
          error: error instanceof Error ? error.message : String(error)
        }, 'AgentRuntimeManager')
        return fallback
      }
    }

    // Build character from agent user config
    const character: Character = {
      name: agentUser.displayName || agentUser.username || 'Agent',
      system: agentUser.agentSystem || 'You are a helpful AI agent',
      bio: safeParseJSON(
        typeof agentUser.agentMessageExamples === 'string' ? agentUser.agentMessageExamples : null,
        [agentUser.bio || '']
      ),
      messageExamples: [],
      style: safeParseJSON(
        typeof agentUser.agentStyle === 'string' ? agentUser.agentStyle : null,
        undefined
      ),
      plugins: [],
      settings: {
        GROQ_API_KEY: process.env.GROQ_API_KEY || '',
        SMALL_GROQ_MODEL: 'llama-3.1-8b-instant',
        LARGE_GROQ_MODEL: agentUser.agentModelTier === 'pro' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
      },
    } as Character

    // Database configuration
    const dbPort = process.env.POSTGRES_DEV_PORT || 5432
    const postgresUrl = 
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      `postgres://postgres:password@localhost:${dbPort}/babylon`

    logger.info(`Creating runtime for agent user ${agentUserId}`, undefined, 'AgentRuntimeManager')

    // Initialize Groq plugin (no-op for this version)
    // groqPlugin.init requires runtime context in some versions

    // Create runtime with plugins
    const runtimeConfig = {
      character,
      agentId: agentUserId as UUID,
      plugins: [groqPlugin],
      settings: {
        ...character.settings,
        POSTGRES_URL: postgresUrl,
      },
    }

    const runtime = new AgentRuntime(runtimeConfig)

    // Configure logger
    if (!runtime.logger || !runtime.logger.log) {
      const customLogger = {
        log: (msg: string) => logger.info(msg, undefined, `Agent[${agentUser.displayName}]`),
        info: (msg: string) => logger.info(msg, undefined, `Agent[${agentUser.displayName}]`),
        warn: (msg: string) => logger.warn(msg, undefined, `Agent[${agentUser.displayName}]`),
        error: (msg: string) => logger.error(msg, new Error(msg), `Agent[${agentUser.displayName}]`),
        debug: (msg: string) => logger.debug(msg, undefined, `Agent[${agentUser.displayName}]`),
        success: (msg: string) => logger.info(`✓ ${msg}`, undefined, `Agent[${agentUser.displayName}]`),
        notice: (msg: string) => logger.info(msg, undefined, `Agent[${agentUser.displayName}]`),
        level: 'info' as const,
        trace: (msg: string) => logger.debug(msg, undefined, `Agent[${agentUser.displayName}]`),
        fatal: (msg: string) => logger.error(msg, new Error(msg), `Agent[${agentUser.displayName}]`),
        progress: (msg: string) => logger.info(msg, undefined, `Agent[${agentUser.displayName}]`),
        clear: () => console.clear ? console.clear() : undefined,
        child: () => customLogger
      }
      runtime.logger = customLogger as any
    }

    // Initialize runtime
    await runtime.initialize()

    // Enhance with Babylon plugin
    await enhanceRuntimeWithBabylon(runtime, agentUserId)

    // Cache runtime
    globalRuntimes.set(agentUserId, runtime)

    logger.info(`Runtime created for agent user ${agentUserId}`, undefined, 'AgentRuntimeManager')

    return runtime
  }

  /**
   * Remove runtime from cache
   */
  public clearRuntime(agentUserId: string): void {
    if (globalRuntimes.has(agentUserId)) {
      globalRuntimes.delete(agentUserId)
      logger.info(`Runtime cleared for agent ${agentUserId}`, undefined, 'AgentRuntimeManager')
    }
  }

  public clearAllRuntimes(): void {
    globalRuntimes.clear()
    logger.info('All runtimes cleared', undefined, 'AgentRuntimeManager')
  }

  public getRuntimeCount(): number {
    return globalRuntimes.size
  }

  public hasRuntime(agentUserId: string): boolean {
    return globalRuntimes.has(agentUserId)
  }
}

// Export singleton instance
export const agentRuntimeManager = AgentRuntimeManager.getInstance()

