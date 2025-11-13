/**
 * Start A2A Server for Local Development
 * 
 * This script starts the A2A WebSocket server required for agent operations.
 * A2A server MUST be running for agents to function.
 */

import { A2AWebSocketServer } from '@/a2a/server/websocket-server'
import { RegistryClient } from '@/a2a/blockchain/registry-client'
import { X402Manager } from '@/a2a/payments/x402-manager'
import { logger } from '@/lib/logger'

async function startA2AServer() {
  console.log('🚀 Starting Babylon A2A Server...\n')
  
  try {
    // Verify required environment variables
    const port = parseInt(process.env.A2A_PORT || '8765')
    const host = process.env.A2A_HOST || 'localhost'
    
    console.log('📋 Configuration:')
    console.log(`   Port: ${port}`)
    console.log(`   Host: ${host}`)
    console.log(`   Max Connections: ${process.env.A2A_MAX_CONNECTIONS || 1000}`)
    console.log(`   Rate Limit: ${process.env.A2A_RATE_LIMIT || 100} msg/min`)
    console.log()
    
    // Initialize blockchain registry client (optional)
    let registryClient: RegistryClient | undefined
    
    if (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS && 
        process.env.NEXT_PUBLIC_RPC_URL) {
      console.log('🔗 Initializing blockchain registry client...')
      registryClient = new RegistryClient({
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL!,
        identityRegistryAddress: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS!,
        reputationSystemAddress: process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_ADDRESS
      })
      console.log('   ✅ Registry client ready\n')
    } else {
      console.log('ℹ️  Blockchain registry not configured (optional)\n')
    }
    
    // Initialize x402 payment manager (optional)
    let x402Manager: X402Manager | undefined
    
    if (process.env.ENABLE_X402 === 'true' && process.env.NEXT_PUBLIC_RPC_URL) {
      console.log('💳 Initializing x402 payment manager...')
      x402Manager = new X402Manager({
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL!,
        minPaymentAmount: process.env.X402_MIN_PAYMENT || '1000000000000000',
        paymentTimeout: parseInt(process.env.X402_TIMEOUT || '900000')
      })
      console.log('   ✅ x402 manager ready\n')
    } else {
      console.log('ℹ️  x402 payments not enabled (optional)\n')
    }
    
    // Create and start A2A server
    console.log('🌐 Starting WebSocket server...')
    
    const server = new A2AWebSocketServer({
      port,
      host,
      maxConnections: parseInt(process.env.A2A_MAX_CONNECTIONS || '1000'),
      messageRateLimit: parseInt(process.env.A2A_RATE_LIMIT || '100'),
      authTimeout: parseInt(process.env.A2A_AUTH_TIMEOUT || '30000'),
      enableX402: process.env.ENABLE_X402 === 'true',
      enableCoalitions: process.env.ENABLE_COALITIONS !== 'false',
      logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      registryClient,
      // @ts-ignore - x402Manager type compatibility
      x402Manager
    })
    
    await server.waitForReady()
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ A2A SERVER READY')
    console.log('='.repeat(60))
    console.log(`🌐 Endpoint: ws://${host}:${port}`)
    console.log(`📊 Status: Listening for agent connections`)
    console.log(`🔧 Features: 74 A2A methods available`)
    console.log('='.repeat(60))
    console.log('\n💡 Agents can now connect via A2A protocol')
    console.log('   Configure BABYLON_A2A_ENDPOINT=ws://localhost:8765\n')
    
    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down A2A server...')
      await server.close()
      console.log('✅ A2A server stopped')
      process.exit(0)
    })
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down A2A server...')
      await server.close()
      console.log('✅ A2A server stopped')
      process.exit(0)
    })
    
  } catch (error) {
    console.error('\n❌ FATAL: Failed to start A2A server')
    console.error(error)
    console.log('\n📋 Troubleshooting:')
    console.log('   1. Check port 8765 is not in use: lsof -i :8765')
    console.log('   2. Verify DATABASE_URL is set correctly')
    console.log('   3. Check .env.local configuration')
    console.log('   4. See A2A_SETUP.md for help\n')
    process.exit(1)
  }
}

// Start server
startA2AServer().catch(console.error)

