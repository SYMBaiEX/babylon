/**
 * A2A Server Example
 * Example of starting an A2A WebSocket server with blockchain integration
 */

import { A2AWebSocketServer } from '../server'
import { RegistryClient } from '../blockchain'

async function main() {
  // Optional: Set up blockchain integration for agent discovery
  const registryClient = new RegistryClient({
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    identityRegistryAddress: process.env.IDENTITY_REGISTRY_ADDRESS || '0x...',
    reputationSystemAddress: process.env.REPUTATION_SYSTEM_ADDRESS || '0x...'
  })

  // Create server
  const server = new A2AWebSocketServer({
    port: 8080,
    host: '0.0.0.0',
    maxConnections: 1000,
    messageRateLimit: 100, // messages per minute
    authTimeout: 30000, // 30 seconds
    enableX402: true,
    enableCoalitions: true,
    logLevel: 'info',
    registryClient // Enable blockchain-based agent discovery and authentication
  })

  // Listen for events
  server.on('agent.connected', (data) => {
    console.log(`Agent connected: ${data.agentId}`)
  })

  server.on('agent.disconnected', (data) => {
    console.log(`Agent disconnected: ${data.agentId}`)
  })

  console.log('A2A WebSocket server started on ws://0.0.0.0:8080')

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down server...')
    await server.close()
    process.exit(0)
  })
}

main().catch(console.error)
