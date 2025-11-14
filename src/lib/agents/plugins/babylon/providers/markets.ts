/**
 * Markets Provider
 * Provides access to prediction markets and perpetual markets via A2A protocol
 * 
 * A2A IS REQUIRED - This provider will not work without an active A2A connection
 */

import type { Provider, IAgentRuntime, Memory, State, ProviderResult } from '@elizaos/core'
import { logger } from '@/lib/logger'
import type { BabylonRuntime } from '../types'
import type { A2APredictionsResponse, A2APerpetualsResponse } from '@/types/a2a-responses'

/**
 * Provider: Current Markets
 * Fetches available prediction markets and perp markets via A2A protocol
 */
export const marketsProvider: Provider = {
  name: 'BABYLON_MARKETS',
  description: 'Get current available markets for trading (prediction markets and perpetual futures) via A2A protocol',
  
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<ProviderResult> => {
    const babylonRuntime = runtime as BabylonRuntime
    
    // A2A is REQUIRED
    if (!babylonRuntime.a2aClient?.isConnected()) {
      logger.error('A2A client not connected - markets provider requires A2A protocol', { 
        agentId: runtime.agentId 
      })
      return { text: 'ERROR: A2A client not connected. Cannot fetch markets data. Please ensure A2A server is running.' }
    }
    
    // Fetch markets via A2A protocol
    const [predictions, perpetuals] = await Promise.all([
      babylonRuntime.a2aClient.sendRequest('a2a.getPredictions', { status: 'active' }),
      babylonRuntime.a2aClient.sendRequest('a2a.getPerpetuals', {})
    ])
    
    const predictionsData = predictions as A2APredictionsResponse
    const perpetualsData = perpetuals as A2APerpetualsResponse
    
    const tickers = perpetualsData.tickers || perpetualsData.perpetuals || []
    
    return { text: `Available Markets:

Prediction Markets (${predictionsData.predictions?.length || 0}):
${predictionsData.predictions?.slice(0, 10).map((m, i: number) => `${i + 1}. ${m.question}
   YES: ${m.yesShares} | NO: ${m.noShares}
   Liquidity: ${m.liquidity}`).join('\n') || 'None'}

Perpetual Markets (${tickers.length}):
${tickers.slice(0, 10).map((p, i: number) => `${i + 1}. ${p.name} (${p.ticker}) @ $${p.currentPrice}`).join('\n') || 'None'}` }
  }
}
