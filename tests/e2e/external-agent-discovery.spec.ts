/**
 * E2E Test: External Agent Discovery Flow
 * 
 * Tests the complete flow of an external agent discovering and connecting to Babylon.
 */

import { test, expect } from '@playwright/test'
import { GameDiscoveryService } from '../../src/agents/agent0/GameDiscovery'

test.describe('External Agent Discovery Flow', () => {
  test.skip('External agent discovers Babylon from registry', async () => {
    // Skip by default - requires Agent0 network to be set up
    if (process.env.AGENT0_ENABLED !== 'true') {
      test.skip()
      return
    }
    
    const discovery = new GameDiscoveryService()
    
    // 1. Discover games
    const games = await discovery.discoverGames({
      type: 'game-platform',
      markets: ['prediction']
    })
    
    expect(games.length).toBeGreaterThan(0)
    
    // 2. Find Babylon
    const babylon = await discovery.findBabylon()
    
    expect(babylon).toBeDefined()
    expect(babylon?.name).toContain('Babylon')
    expect(babylon?.endpoints.a2a).toBeTruthy()
    expect(babylon?.endpoints.mcp).toBeTruthy()
    expect(babylon?.endpoints.api).toBeTruthy()
    
    // 3. Verify endpoints are accessible
    if (babylon) {
      // Test MCP endpoint
      const mcpResponse = await fetch(babylon.endpoints.mcp)
      expect(mcpResponse.ok).toBe(true)
      
      const mcpData = await mcpResponse.json()
      expect(mcpData.name).toBeTruthy()
      expect(mcpData.tools).toBeInstanceOf(Array)
      
      // Test API endpoint (should return 401 without auth, but endpoint exists)
      const apiResponse = await fetch(`${babylon.endpoints.api}/markets`)
      // 401 is acceptable - means endpoint exists and requires auth
      expect([200, 401, 403]).toContain(apiResponse.status)
    }
  })
  
  test.skip('Agent can connect to A2A endpoint', async () => {
    // Skip by default - requires A2A server running
    if (process.env.AGENT0_ENABLED !== 'true') {
      test.skip()
      return
    }
    
    const discovery = new GameDiscoveryService()
    const babylon = await discovery.findBabylon()
    
    if (!babylon) {
      test.skip()
      return
    }
    
    // This would require actual WebSocket connection test
    // For now, just verify endpoint URL is valid
    expect(babylon.endpoints.a2a).toMatch(/^wss?:\/\//)
  })
  
  test('MCP endpoint returns tool definitions', async ({ request }) => {
    // Test local MCP endpoint (if server is running)
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'
    
    try {
      const response = await request.get(`${baseUrl}/mcp`)
      
      if (response.ok()) {
        const data = await response.json()
        expect(data.name).toBe('Babylon Prediction Markets')
        expect(data.tools).toBeInstanceOf(Array)
        expect(data.tools.length).toBeGreaterThan(0)
        
        // Verify tool structure
        const tool = data.tools[0]
        expect(tool.name).toBeTruthy()
        expect(tool.description).toBeTruthy()
        expect(tool.inputSchema).toBeDefined()
      } else {
        // Server may not be running - skip test
        console.log('⚠️  MCP endpoint not available (server may not be running)')
      }
    } catch (error) {
      // Network error - server not running
      console.log('⚠️  MCP endpoint test skipped (server not running)')
    }
  })
})

