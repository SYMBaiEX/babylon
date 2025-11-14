/**
 * MCP Tool Registry
 * 
 * Dynamic registry for MCP tools that can be discovered and registered in Agent0.
 * Replaces hardcoded tool list with discoverable, extensible system.
 */

export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export class MCPToolRegistry {
  private static instance: MCPToolRegistry | null = null
  private tools: Map<string, MCPTool> = new Map()
  
  private constructor() {
    // Register default tools
    this.registerDefaultTools()
  }
  
  static getInstance(): MCPToolRegistry {
    if (!MCPToolRegistry.instance) {
      MCPToolRegistry.instance = new MCPToolRegistry()
    }
    return MCPToolRegistry.instance
  }
  
  /**
   * Register a new tool
   */
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool)
  }
  
  /**
   * Get all registered tools
   */
  getTools(): MCPTool[] {
    return Array.from(this.tools.values())
  }
  
  /**
   * Get tool names only (for Agent0 registration)
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys())
  }
  
  /**
   * Get specific tool
   */
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name)
  }
  
  /**
   * Check if tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name)
  }
  
  /**
   * Register default Babylon tools
   */
  private registerDefaultTools(): void {
    // Market Operations
    this.registerTool({
      name: 'get_markets',
      description: 'Get all active prediction markets',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['prediction', 'perpetuals', 'all'],
            description: 'Market type filter'
          }
        }
      }
    })
    
    this.registerTool({
      name: 'place_bet',
      description: 'Place a bet on a prediction market',
      inputSchema: {
        type: 'object',
        properties: {
          marketId: { type: 'string', description: 'Market ID' },
          side: { type: 'string', enum: ['YES', 'NO'], description: 'Bet side' },
          amount: { type: 'number', description: 'Bet amount in points' }
        },
        required: ['marketId', 'side', 'amount']
      }
    })
    
    this.registerTool({
      name: 'get_balance',
      description: 'Get current virtual balance and PnL',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    })
    
    this.registerTool({
      name: 'get_positions',
      description: 'Get open prediction positions',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    })
    
    this.registerTool({
      name: 'close_position',
      description: 'Close an open position by ID',
      inputSchema: {
        type: 'object',
        properties: {
          positionId: { type: 'string', description: 'Position identifier' }
        },
        required: ['positionId']
      }
    })
    
    this.registerTool({
      name: 'get_market_data',
      description: 'Get detailed market information',
      inputSchema: {
        type: 'object',
        properties: {
          marketId: { type: 'string', description: 'Market identifier' }
        },
        required: ['marketId']
      }
    })
    
    this.registerTool({
      name: 'query_feed',
      description: 'Fetch latest community posts',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of posts to return', default: 20 },
          questionId: { type: 'string', description: 'Filter by question/market' }
        }
      }
    })
    
    // Social Operations
    this.registerTool({
      name: 'create_post',
      description: 'Create a new post in the feed',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Post content' },
          questionId: { type: 'string', description: 'Related question/market ID' }
        },
        required: ['content']
      }
    })
    
    this.registerTool({
      name: 'create_comment',
      description: 'Comment on a post',
      inputSchema: {
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'Post ID' },
          content: { type: 'string', description: 'Comment content' }
        },
        required: ['postId', 'content']
      }
    })
    
    // Discovery
    this.registerTool({
      name: 'discover_agents',
      description: 'Discover other agents in the network',
      inputSchema: {
        type: 'object',
        properties: {
          strategies: { type: 'array', items: { type: 'string' }, description: 'Filter by strategies' },
          minReputation: { type: 'number', description: 'Minimum reputation score' }
        }
      }
    })
  }
}

/**
 * Get singleton MCP tool registry
 */
export function getMCPToolRegistry(): MCPToolRegistry {
  return MCPToolRegistry.getInstance()
}

