export const MCP_VERSION = '2025-06-18'

export const MCP_TOOLS = [
  {
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
  },
  {
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
  },
  {
    name: 'get_balance',
    description: 'Get current virtual balance and PnL',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_positions',
    description: 'Get open prediction positions',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'close_position',
    description: 'Close an open position by ID',
    inputSchema: {
      type: 'object',
      properties: {
        positionId: { type: 'string', description: 'Position identifier' }
      },
      required: ['positionId']
    }
  },
  {
    name: 'get_market_data',
    description: 'Get detailed market information',
    inputSchema: {
      type: 'object',
      properties: {
        marketId: { type: 'string', description: 'Market identifier' }
      },
      required: ['marketId']
    }
  },
  {
    name: 'query_feed',
    description: 'Fetch latest community posts',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of posts to return', default: 20 },
        questionId: { type: 'string', description: 'Filter by question/market' }
      }
    }
  }
]

