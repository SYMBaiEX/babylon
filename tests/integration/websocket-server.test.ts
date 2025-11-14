/**
 * A2A WebSocket Server Integration Tests
 * 
 * Tests the WebSocket server implementation including authentication,
 * rate limiting, and message routing.
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { A2AWebSocketServer } from '@/a2a/server/websocket-server'
import WebSocket from 'ws'

describe('A2A WebSocket Server', () => {
  let server: A2AWebSocketServer
  const TEST_PORT = 18765
  const TEST_HOST = 'localhost'

  beforeAll(async () => {
    server = new A2AWebSocketServer({
      port: TEST_PORT,
      host: TEST_HOST,
      maxConnections: 10,
      messageRateLimit: 100,
      authTimeout: 5000,
      enableX402: false,
      enableCoalitions: true,
      logLevel: 'error'
    })

    await server.waitForReady()
  })

  afterAll(async () => {
    await server.close()
  })

  test('server initializes successfully', async () => {
    expect(server).toBeDefined()
  })

  test('server accepts WebSocket connections', (done) => {
    const ws = new WebSocket(`ws://${TEST_HOST}:${TEST_PORT}`)
    
    ws.on('open', () => {
      expect(ws.readyState).toBe(WebSocket.OPEN)
      ws.close()
      done()
    })

    ws.on('error', (error) => {
      done(error)
    })
  })

  test('server requires authentication handshake', (done) => {
    const ws = new WebSocket(`ws://${TEST_HOST}:${TEST_PORT}`)
    
    ws.on('open', () => {
      // Send non-handshake message
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'a2a.discover',
        params: {}
      }))
    })

    ws.on('message', (data) => {
      const response = JSON.parse(data.toString())
      expect(response.error).toBeDefined()
      expect(response.error.code).toBe(-32000) // NOT_AUTHENTICATED
      ws.close()
      done()
    })

    ws.on('error', (error) => {
      done(error)
    })
  })

  test('server handles invalid handshake', (done) => {
    const ws = new WebSocket(`ws://${TEST_HOST}:${TEST_PORT}`)
    
    ws.on('open', () => {
      // Send handshake without required params
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'a2a.handshake',
        params: {
          agentId: 'test-agent'
          // Missing: address, signature, timestamp
        }
      }))
    })

    ws.on('message', (data) => {
      const response = JSON.parse(data.toString())
      expect(response.error).toBeDefined()
      // Server returns NOT_AUTHENTICATED (-32000) for invalid handshake
      expect(response.error.code).toBe(-32000)
      ws.close()
      done()
    })

    ws.on('error', (error) => {
      done(error)
    })
  })

  test('server enforces connection limit', async () => {
    const connections: WebSocket[] = []
    
    // Create max connections
    for (let i = 0; i < 10; i++) {
      const ws = new WebSocket(`ws://${TEST_HOST}:${TEST_PORT}`)
      connections.push(ws)
      await new Promise(resolve => ws.on('open', resolve))
    }

    // Try to exceed limit
    const extraWs = new WebSocket(`ws://${TEST_HOST}:${TEST_PORT}`)
    
    await new Promise<void>((resolve, reject) => {
      const watchdog = setTimeout(() => {
        reject(new Error('Extra connection was not rejected in time'))
      }, 1000)

      extraWs.on('close', (code) => {
        clearTimeout(watchdog)
        expect(code).toBe(1008) // Policy violation
        resolve()
      })

      extraWs.on('error', (error) => {
        clearTimeout(watchdog)
        reject(error)
      })
    })

    // Cleanup
    connections.forEach(ws => ws.close())
    await new Promise(resolve => setTimeout(resolve, 100)) // Wait for cleanup
  })

  test('server responds to ping with pong', (done) => {
    const ws = new WebSocket(`ws://${TEST_HOST}:${TEST_PORT}`)
    
    ws.on('open', () => {
      ws.ping()
    })

    ws.on('pong', () => {
      ws.close()
      done()
    })

    ws.on('error', (error) => {
      done(error)
    })
  })
})

describe('A2A WebSocket Server Configuration', () => {
  test('server accepts custom configuration', async () => {
    const customServer = new A2AWebSocketServer({
      port: 18766,
      host: 'localhost',
      maxConnections: 5,
      messageRateLimit: 50,
      authTimeout: 10000,
      enableX402: true,
      enableCoalitions: false,
      logLevel: 'debug'
    })

    await customServer.waitForReady()
    expect(customServer).toBeDefined()
    await customServer.close()
  })

  test('server uses default values for optional config', async () => {
    const minimalServer = new A2AWebSocketServer({
      port: 18767,
      host: 'localhost'
    })

    await minimalServer.waitForReady()
    expect(minimalServer).toBeDefined()
    await minimalServer.close()
  })
})

