/**
 * Dashboard Provider
 * Provides comprehensive agent context and state via A2A protocol
 * 
 * A2A IS REQUIRED - This provider will not work without an active A2A connection
 */

import type { Provider, IAgentRuntime, Memory, State, ProviderResult } from '@elizaos/core'
import { logger } from '@/lib/logger'
import type { BabylonRuntime } from '../types'
import type {
  A2ABalanceResponse,
  A2APositionsResponse
} from '@/types/a2a-responses'

/**
 * Provider: Comprehensive Dashboard
 * Provides complete agent context including portfolio, markets, social, and pending items
 * ALL DATA FETCHED VIA A2A PROTOCOL
 */
export const dashboardProvider: Provider = {
  name: 'BABYLON_DASHBOARD',
  description: 'Get comprehensive agent dashboard with portfolio, markets, social feed, and pending interactions via A2A protocol',
  
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<ProviderResult> => {
    const babylonRuntime = runtime as BabylonRuntime
    const agentUserId = runtime.agentId
    
    // A2A is REQUIRED
    if (!babylonRuntime.a2aClient?.isConnected()) {
      logger.error('A2A client not connected - dashboard provider requires A2A protocol', undefined, runtime.agentId)
      return { text: 'ERROR: A2A client not connected. Cannot load dashboard. Please ensure A2A server is running.' }
    }
    
    // Fetch dashboard data via A2A protocol (only implemented methods)
    const [balance, positions] = await Promise.all([
      babylonRuntime.a2aClient.sendRequest('a2a.getBalance', {}),
      babylonRuntime.a2aClient.sendRequest('a2a.getPositions', { userId: agentUserId })
    ])
    
    // NOTE: These A2A methods are NOT currently implemented:
    // - getPredictions, getFeed, getUnreadCount
    // Use REST API instead
    
    const balanceData = balance as unknown as A2ABalanceResponse
    const positionsData = positions as unknown as A2APositionsResponse
    
    const totalPositions = (positionsData.marketPositions?.length || 0) + (positionsData.perpPositions?.length || 0)
    
    const result = `📊 AGENT DASHBOARD

💰 PORTFOLIO
Balance: $${balanceData.balance || 0}
Points: ${balanceData.reputationPoints || 0} pts
Open Positions: ${totalPositions}

ℹ️ NOTE: For markets, social feed, and messages, use REST API endpoints:
- GET /api/markets/predictions
- GET /api/feed
- GET /api/chats
- GET /api/notifications


💡 OPPORTUNITIES
- ${totalPositions > 0 ? 'Monitor open positions' : 'Consider opening positions'}
- Check REST API for markets, feed, and messages`

    return { text: result }
  }
}
