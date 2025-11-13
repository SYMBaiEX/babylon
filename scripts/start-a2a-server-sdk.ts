/**
 * Start A2A Server using Official SDK
 * 
 * This script starts the A2A server using the official @a2a-js/sdk package.
 * Replaces the custom WebSocket server with standards-compliant implementation.
 * 
 * Features:
 * - Standards compliant with A2A protocol
 * - Task lifecycle management
 * - Streaming support
 * - Push notifications
 * - Better maintained by A2A project team
 */

import { createBabylonA2AServer } from '@/a2a/server/babylon-a2a-server'
import { logger } from '@/lib/logger'

async function main() {
  console.log('🚀 Starting Babylon A2A Server (Official SDK)')
  console.log('=' .repeat(60))
  
  try {
    // Verify required environment variables
    const port = parseInt(process.env.A2A_PORT || '8765')
    const host = process.env.A2A_HOST || '0.0.0.0'
    
    console.log('📋 Configuration:')
    console.log(`   Port: ${port}`)
    console.log(`   Host: ${host}`)
    console.log(`   SDK: @a2a-js/sdk v0.3.5`)
    console.log()
    
    // Create and start server
    const server = await createBabylonA2AServer({
      port,
      host,
      agentCard: {
        name: 'Babylon Prediction Markets',
        version: '1.0.0',
        description: 'Real-time prediction market game with autonomous AI agents',
        author: {
          name: 'Babylon Team',
          url: 'https://babylon.market'
        },
        url: `http://${host}:${port}`
      },
      enablePushNotifications: true,
      enableStreaming: true,
      enableStateHistory: true
    })
    
    await server.waitForReady()
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ A2A SERVER READY (Official SDK)')
    console.log('='.repeat(60))
    console.log(`🌐 Endpoint: http://${host}:${port}/a2a`)
    console.log(`📄 Agent Card: http://${host}:${port}/.well-known/agent-card.json`)
    console.log(`📊 Status: Listening for agent connections`)
    console.log(`🔧 Features: Streaming, Push Notifications, Task Management`)
    console.log('='.repeat(60))
    console.log('\n💡 Agents can now connect via:')
    console.log(`   BABYLON_A2A_ENDPOINT=http://${host}:${port}/.well-known/agent-card.json`)
    console.log()
    
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
    console.error('❌ Failed to start A2A server:', error)
    logger.error('Failed to start A2A server', error)
    process.exit(1)
  }
}

main()

