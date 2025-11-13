/**
 * Babylon Plugin Integration Service
 * 
 * Integrates the Babylon A2A plugin with the agent runtime manager.
 * A2A CONNECTION IS REQUIRED - Agents cannot function without it.
 */

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { A2AClient } from '@/a2a/client/a2a-client'
import { babylonPlugin } from './index'
import type { BabylonRuntime } from './types'
import type { AgentRuntime } from '@elizaos/core'

/**
 * Initialize A2A client for an agent
 * A2A IS REQUIRED - This must succeed for agents to work properly
 */
export async function initializeAgentA2AClient(
  agentUserId: string
): Promise<A2AClient> {
  try {
    // Get agent user
    const agent = await prisma.user.findUnique({
      where: { id: agentUserId }
    })

    if (!agent || !agent.isAgent) {
      throw new Error(`Agent user ${agentUserId} not found or not an agent`)
    }

    // Check if agent has wallet (REQUIRED)
    if (!agent.walletAddress) {
      throw new Error(`Agent ${agentUserId} has no wallet address. Wallet is required for A2A protocol.`)
    }

    // Get wallet credentials (REQUIRED)
    const privateKey = process.env[`AGENT_${agentUserId}_PRIVATE_KEY`] || 
                      process.env.AGENT_DEFAULT_PRIVATE_KEY

    if (!privateKey) {
      throw new Error(`No private key configured for agent ${agentUserId}. Set AGENT_DEFAULT_PRIVATE_KEY or AGENT_${agentUserId}_PRIVATE_KEY in environment.`)
    }

    // Determine capabilities based on agent config
    const capabilities = {
      strategies: agent.agentTradingStrategy 
        ? ['autonomous-trading', 'prediction-markets', 'social-interaction', agent.agentTradingStrategy]
        : ['social-interaction', 'chat'],
      markets: ['prediction', 'perp'],
      actions: [],
      version: '1.0.0'
    }

    // Build actions list based on permissions
    if (agent.autonomousTrading) capabilities.actions.push('trade')
    if (agent.autonomousPosting) capabilities.actions.push('post', 'comment')
    if (agent.autonomousMessaging) capabilities.actions.push('message')
    
    // Always allow social reading
    capabilities.actions.push('read', 'analyze')

    // Get A2A endpoint (REQUIRED)
    const a2aEndpoint = process.env.BABYLON_A2A_ENDPOINT
    
    if (!a2aEndpoint) {
      throw new Error('BABYLON_A2A_ENDPOINT not configured. A2A server endpoint is required.')
    }
    
    // Create A2A client
    const a2aClient = new A2AClient({
      endpoint: a2aEndpoint,
      credentials: {
        address: agent.walletAddress,
        privateKey,
        tokenId: agent.agent0TokenId || undefined
      },
      capabilities,
      autoReconnect: true,
      reconnectInterval: 5000
    })

    // Connect to A2A server (REQUIRED)
    await a2aClient.connect()
    
    logger.info('✅ A2A client connected successfully', { 
      agentUserId, 
      agentName: agent.displayName,
      endpoint: a2aEndpoint,
      capabilities 
    })

    return a2aClient
  } catch (error) {
    logger.error('❌ FATAL: Failed to initialize A2A client', error, 'BabylonIntegration', { 
      agentUserId 
    })
    throw new Error(`Failed to initialize A2A client for agent ${agentUserId}: ${error instanceof Error ? error.message : 'Unknown error'}. A2A connection is required.`)
  }
}

/**
 * Enhance agent runtime with Babylon plugin
 * A2A CONNECTION IS REQUIRED - Will throw if A2A cannot be initialized
 */
export async function enhanceRuntimeWithBabylon(
  runtime: AgentRuntime,
  agentUserId: string
): Promise<void> {
  const babylonRuntime = runtime as BabylonRuntime

  // Initialize A2A client (REQUIRED - will throw on failure)
  const a2aClient = await initializeAgentA2AClient(agentUserId)
  
  // Inject A2A client into runtime
  babylonRuntime.a2aClient = a2aClient
  
  // Register plugin
  runtime.registerPlugin(babylonPlugin)
  
  logger.info('✅ Babylon plugin registered with A2A protocol', { 
    agentUserId,
    pluginName: babylonPlugin.name,
    providersCount: babylonPlugin.providers?.length || 0,
    actionsCount: babylonPlugin.actions?.length || 0,
    a2aConnected: true
  })
}

/**
 * Disconnect A2A client for an agent
 */
export async function disconnectAgentA2AClient(runtime: AgentRuntime): Promise<void> {
  try {
    const babylonRuntime = runtime as BabylonRuntime
    
    if (babylonRuntime.a2aClient?.isConnected()) {
      await babylonRuntime.a2aClient.disconnect()
      babylonRuntime.a2aClient = undefined
      
      logger.info('A2A client disconnected', { agentId: runtime.agentId })
    }
  } catch (error) {
    logger.error('Failed to disconnect A2A client', error, 'BabylonIntegration')
  }
}

/**
 * Check if agent runtime has active A2A connection
 */
export function hasActiveA2AConnection(runtime: AgentRuntime): boolean {
  const babylonRuntime = runtime as BabylonRuntime
  return !!babylonRuntime.a2aClient?.isConnected()
}

