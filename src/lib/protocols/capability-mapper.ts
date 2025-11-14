/**
 * Protocol Capability Mapper
 * 
 * Maps capabilities between MCP tools and A2A methods.
 * Enables cross-protocol capability discovery and translation.
 */

/**
 * MCP Tool to A2A Method mapping
 */
export const MCP_TO_A2A_MAPPING: Record<string, string> = {
  // Market Operations
  'get_markets': 'a2a.getMarketData',
  'place_bet': 'a2a.buyShares',
  'get_market_data': 'a2a.getMarketData',
  'get_balance': 'a2a.getBalance',
  'get_positions': 'a2a.getPositions',
  'close_position': 'a2a.closePosition',
  
  // Social Operations
  'query_feed': 'a2a.getFeed',
  'create_post': 'a2a.createPost',
  'create_comment': 'a2a.createComment',
  
  // Discovery
  'discover_agents': 'a2a.discover'
}

/**
 * A2A Method to MCP Tool mapping (reverse)
 */
export const A2A_TO_MCP_MAPPING: Record<string, string> = Object.fromEntries(
  Object.entries(MCP_TO_A2A_MAPPING).map(([mcp, a2a]) => [a2a, mcp])
)

/**
 * Convert MCP tool name to A2A method
 */
export function mcpToolToA2AMethod(tool: string): string | null {
  return MCP_TO_A2A_MAPPING[tool] || null
}

/**
 * Convert A2A method to MCP tool name
 */
export function a2aMethodToMCPTool(method: string): string | null {
  return A2A_TO_MCP_MAPPING[method] || null
}

/**
 * Check if MCP tool has A2A equivalent
 */
export function hasMCPToA2AMapping(tool: string): boolean {
  return tool in MCP_TO_A2A_MAPPING
}

/**
 * Check if A2A method has MCP equivalent
 */
export function hasA2AToMCPMapping(method: string): boolean {
  return method in A2A_TO_MCP_MAPPING
}

/**
 * Get all MCP tools that have A2A equivalents
 */
export function getMappedMCPTools(): string[] {
  return Object.keys(MCP_TO_A2A_MAPPING)
}

/**
 * Get all A2A methods that have MCP equivalents
 */
export function getMappedA2AMethods(): string[] {
  return Object.keys(A2A_TO_MCP_MAPPING)
}

