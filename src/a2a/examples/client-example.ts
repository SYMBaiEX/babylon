/**
 * A2A Client Example
 * Example of connecting an agent to an A2A server
 */

import { A2AClient } from '../client'
import { logger } from '../utils/logger'

async function main() {
  // Create client
  const client = new A2AClient({
    endpoint: 'ws://localhost:8080',
    credentials: {
      address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001', // Example key
      tokenId: 1
    },
    capabilities: {
      strategies: ['momentum', 'sentiment'],
      markets: ['prediction', 'sports'],
      actions: ['analyze', 'trade', 'coordinate'],
      version: '1.0.0'
    },
    autoReconnect: true,
    reconnectInterval: 5000,
    heartbeatInterval: 30000
  })

  // Listen for events
  client.on('agent.connected', (data) => {
    logger.info(`Connected as: ${data.agentId}`)
  })

  client.on('agent.disconnected', () => {
    logger.info('Disconnected from server')
  })

  client.on('error', (error) => {
    logger.error('Client error:', error)
  })

  // Connect to server
  await client.connect()
  logger.info('Connected to A2A server')

  // Example: Discover other agents
  const discovery = await client.discoverAgents({
    strategies: ['momentum'],
    minReputation: 50
  })
  logger.info(`Found ${discovery.total} agents:`, discovery.agents)

  // Example: Get market data
  const marketData = await client.getMarketData('market-123')
  logger.info('Market data:', marketData)

  // Example: Subscribe to market updates
  await client.subscribeMarket('market-123')
  client.on('market_update', (data) => {
    logger.info('Market update:', data)
  })

  // Example: Propose a coalition
  const coalition = await client.proposeCoalition(
    'Alpha Strategy Coalition',
    'market-123',
    'momentum',
    2,
    5
  )
  logger.info('Coalition created:', coalition.coalitionId)

  // Example: Share analysis
  const analysis = await client.shareAnalysis({
    marketId: 'market-123',
    analyst: client.getAgentId()!,
    prediction: 0.75,
    confidence: 0.85,
    reasoning: 'Strong momentum indicators',
    dataPoints: {
      volume: '1000000',
      volatility: 0.15
    },
    timestamp: Date.now()
  })
  logger.info('Analysis shared:', analysis.analysisId)

  // Keep running
  logger.info('Agent running... Press Ctrl+C to exit')

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Disconnecting...')
    client.disconnect()
    process.exit(0)
  })
}

main().catch(error => {
  logger.error('Error:', error)
  process.exit(1)
})
