/**
 * Babylon Discovery
 * 
 * For now, returns configured Babylon endpoints
 * TODO: Integrate with Agent0 registry when it's deployed
 */

import type { DiscoveredBabylon } from '../types/agent-config'

/**
 * Get Babylon endpoints from environment
 * In production, this would query Agent0 registry
 */
export async function discoverBabylon(): Promise<DiscoveredBabylon> {
  const apiUrl = process.env.BABYLON_API_URL || 'http://localhost:3000'
  
  const babylon: DiscoveredBabylon = {
    name: 'Babylon',
    tokenId: 0,
    endpoints: {
      api: apiUrl,
      a2a: process.env.BABYLON_A2A_ENDPOINT || 'ws://localhost:8081',
      mcp: process.env.BABYLON_MCP_ENDPOINT || `${apiUrl}/mcp`,
    },
    capabilities: {
      strategies: ['momentum', 'volume', 'sentiment'],
      markets: ['prediction', 'perpetuals'],
      actions: ['trade', 'post', 'follow'],
    },
  }
  
  return babylon
}

/**
 * Validate Babylon endpoints
 */
export function validateEndpoints(babylon: DiscoveredBabylon): boolean {
  const { api, a2a, mcp } = babylon.endpoints
  
  const isValidUrl = (url: string) => {
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('ws://') || url.startsWith('wss://')
  }
  
  return isValidUrl(api) && isValidUrl(a2a) && isValidUrl(mcp)
}

/**
 * Clear discovery cache
 */
export function clearDiscoveryCache(): void {
  discoveryCache.clear()
}

