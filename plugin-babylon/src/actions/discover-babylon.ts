/**
 * Discover Babylon Action
 * 
 * Allows agents to manually discover or refresh Babylon game endpoints
 * from the Agent0 registry.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from '@elizaos/core'
import { logger } from '../../../src/lib/logger'

export const discoverBabylonAction: Action = {
  name: 'DISCOVER_BABYLON',
  similes: ['FIND_BABYLON', 'REFRESH_BABYLON', 'LOCATE_GAME', 'DISCOVER_GAME'],
  description: 'Discover or refresh Babylon game endpoints from Agent0 registry. Use when you need to find the game or update endpoint information.',
  
  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    // Check if Agent0 is enabled
    if (process.env.AGENT0_ENABLED !== 'true') {
      logger.warn('Agent0 integration disabled - discovery not available')
      return false
    }
    
    // Check if discovery service is available
    const discoveryService = runtime.getService('babylon-discovery')
    if (!discoveryService) {
      logger.warn('BabylonDiscoveryService not available')
      return false
    }
    
    return true
  },
  
  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      logger.info('Agent initiating Babylon discovery...')
      
      const discoveryService = runtime.getService('babylon-discovery')
      
      if (!discoveryService || typeof discoveryService.discoverAndConnect !== 'function') {
        if (callback) {
          callback({
            text: 'Discovery service not available. Ensure AGENT0_ENABLED=true.',
            action: 'DISCOVER_BABYLON'
          })
        }
        return false
      }
      
      const babylon = await discoveryService.discoverAndConnect()
      
      if (!babylon) {
        if (callback) {
          callback({
            text: 'Babylon game not found in Agent0 registry. The game may not be registered yet.',
            action: 'DISCOVER_BABYLON'
          })
        }
        return false
      }
      
      // Update runtime settings
      if (babylon.endpoints.api) {
        runtime.setSetting?.('babylon.apiEndpoint', babylon.endpoints.api)
      }
      if (babylon.endpoints.a2a) {
        runtime.setSetting?.('babylon.a2aEndpoint', babylon.endpoints.a2a)
      }
      if (babylon.endpoints.mcp) {
        runtime.setSetting?.('babylon.mcpEndpoint', babylon.endpoints.mcp)
      }
      
      const responseText = `✅ Discovered Babylon: ${babylon.name}
      
Endpoints updated:
- API: ${babylon.endpoints.api}
- A2A: ${babylon.endpoints.a2a}
- MCP: ${babylon.endpoints.mcp}

Capabilities: ${babylon.capabilities.markets.join(', ')}
Token ID: ${babylon.tokenId}
Reputation: ${babylon.reputation?.trustScore || 'N/A'}`
      
      if (callback) {
        callback({
          text: responseText,
          action: 'DISCOVER_BABYLON'
        })
      }
      
      logger.info('✅ Babylon discovery completed successfully')
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to discover Babylon:', { error: errorMessage })
      
      if (callback) {
        callback({
          text: `Failed to discover Babylon: ${errorMessage}`,
          action: 'DISCOVER_BABYLON'
        })
      }
      
      return false
    }
  },
  
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Find the Babylon game for me' }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I\'ll discover Babylon from the Agent0 registry...',
          action: 'DISCOVER_BABYLON'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Refresh the game endpoints' }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Refreshing Babylon endpoints from registry...',
          action: 'DISCOVER_BABYLON'
        }
      }
    ]
  ]
}

