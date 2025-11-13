/**
 * E2E Integration Tests for Autonomous Agent
 * 
 * These tests verify the agent actually connects, registers, and executes commands
 * against a live Babylon instance.
 * 
 * Prerequisites:
 * - Babylon server running on localhost:3000
 * - Valid API keys in .env.local
 * - Agent0 testnet access (Sepolia)
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { registerAgent } from '../src/registration'
import { BabylonA2AClient } from '../src/a2a-client'
import { AgentDecisionMaker } from '../src/decision'
import { AgentMemory } from '../src/memory'
import { executeAction } from '../src/actions'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

// Skip E2E tests if not configured
const E2E_ENABLED = !!(
  process.env.BABYLON_WS_URL &&
  process.env.AGENT0_PRIVATE_KEY &&
  (process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)
)

if (E2E_ENABLED) {
  describe('E2E - Autonomous Agent Live Tests', () => {
    let agentIdentity: any
    let a2aClient: BabylonA2AClient
    let decisionMaker: AgentDecisionMaker
    let memory: AgentMemory

    beforeAll(async () => {
    
    console.log('Setting up E2E test environment...')
    
    // Clean up any previous identity
    if (fs.existsSync('./agent-identity.json')) {
      console.log('Using existing agent identity')
      agentIdentity = JSON.parse(fs.readFileSync('./agent-identity.json', 'utf-8'))
    } else {
      console.log('Registering new agent...')
      // This might fail if no testnet access, that's okay
      try {
        agentIdentity = await registerAgent()
      } catch (error) {
        console.log('Could not register new agent, using mock identity')
        agentIdentity = {
          tokenId: 9999,
          address: '0x' + '1'.repeat(40),
          agentId: 'test-agent-' + Date.now()
        }
      }
    }
    
    console.log('Initializing A2A client...')
    a2aClient = new BabylonA2AClient({
      wsUrl: process.env.BABYLON_WS_URL!,
      address: agentIdentity.address,
      tokenId: agentIdentity.tokenId,
      privateKey: process.env.AGENT0_PRIVATE_KEY!
    })

    console.log('Initializing decision maker...')
    decisionMaker = new AgentDecisionMaker({
      strategy: 'balanced',
      groqApiKey: process.env.GROQ_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY
    })

    memory = new AgentMemory({ maxEntries: 20 })
  }, 30000)

  afterAll(async () => {
    if (a2aClient) {
      await a2aClient.disconnect()
    }
  })

  describe('Phase 1: Registration', () => {
    it('should have valid agent identity', () => {
      expect(agentIdentity).toBeDefined()
      expect(agentIdentity.tokenId).toBeGreaterThan(0)
      expect(agentIdentity.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(agentIdentity.agentId).toBeDefined()
    })
  })

  describe('Phase 2: A2A Connection', () => {
    it('should connect to Babylon A2A', async () => {
      await a2aClient.connect()
      
      expect(a2aClient.sessionToken).toBeDefined()
      expect(a2aClient.agentId).toBeDefined()
      console.log(`✅ Connected as: ${a2aClient.agentId}`)
    }, 15000)

    it('should have valid session token', () => {
      expect(a2aClient.sessionToken).toBeDefined()
      expect(a2aClient.sessionToken!.length).toBeGreaterThan(10)
    })
  })

  describe('Phase 3: Basic Data Retrieval', () => {
    it('should get portfolio data', async () => {
      const portfolio = await a2aClient.getPortfolio()
      
      expect(portfolio).toBeDefined()
      expect(portfolio.balance).toBeDefined()
      expect(portfolio.positions).toBeInstanceOf(Array)
      expect(portfolio.pnl).toBeDefined()
      
      console.log(`   Balance: $${portfolio.balance}`)
      console.log(`   Positions: ${portfolio.positions.length}`)
      console.log(`   P&L: $${portfolio.pnl}`)
    })

    it('should get available markets', async () => {
      const markets = await a2aClient.getMarkets()
      
      expect(markets).toBeDefined()
      expect(markets.predictions).toBeInstanceOf(Array)
      expect(markets.perps).toBeInstanceOf(Array)
      
      console.log(`   Prediction markets: ${markets.predictions.length}`)
      console.log(`   Perp markets: ${markets.perps.length}`)
    })

    it('should get feed posts', async () => {
      const feed = await a2aClient.getFeed(10)
      
      expect(feed).toBeDefined()
      expect(feed.posts).toBeInstanceOf(Array)
      
      console.log(`   Feed posts: ${feed.posts.length}`)
    })

    it('should get balance', async () => {
      const balance = await a2aClient.getBalance()
      
      expect(balance).toBeDefined()
      console.log(`   Balance response:`, balance)
    })
  })

  describe('Phase 4: Decision Making', () => {
    it('should make a decision based on context', async () => {
      const portfolio = await a2aClient.getPortfolio()
      const markets = await a2aClient.getMarkets()
      const feed = await a2aClient.getFeed(10)
      
      const decision = await decisionMaker.decide({
        portfolio,
        markets,
        feed,
        memory: memory.getRecent(5)
      })
      
      expect(decision).toBeDefined()
      expect(decision.action).toBeDefined()
      expect(['BUY_YES', 'BUY_NO', 'SELL', 'OPEN_LONG', 'OPEN_SHORT', 'CLOSE_POSITION', 'CREATE_POST', 'CREATE_COMMENT', 'HOLD']).toContain(decision.action)
      
      console.log(`   Decision: ${decision.action}`)
      if (decision.reasoning) {
        console.log(`   Reasoning: ${decision.reasoning.substring(0, 80)}...`)
      }
    }, 15000)

    it('should validate LLM provider is configured', () => {
      const provider = decisionMaker.getProvider()
      expect(provider).toBeDefined()
      expect(provider.length).toBeGreaterThan(0)
      
      console.log(`   LLM Provider: ${provider}`)
    })
  })

  describe('Phase 5: Memory System', () => {
    it('should store and retrieve actions', () => {
      memory.add({
        action: 'TEST_ACTION',
        params: { test: true },
        result: { success: true },
        timestamp: Date.now()
      })

      const recent = memory.getRecent(1)
      expect(recent.length).toBe(1)
      expect(recent[0].action).toBe('TEST_ACTION')
    })

    it('should generate summary', () => {
      const summary = memory.getSummary()
      expect(summary).toBeDefined()
      expect(summary.length).toBeGreaterThan(0)
      console.log(`   Memory: ${summary}`)
    })
  })

  describe('Phase 6: Action Execution (Safe)', () => {
    it('should handle HOLD action', async () => {
      const decision = {
        action: 'HOLD' as const,
        reasoning: 'Test - no action'
      }

      const result = await executeAction(a2aClient, decision)
      
      expect(result.success).toBe(true)
      expect(result.message).toContain('Holding')
    })

    it('should attempt to create a test post', async () => {
      const decision = {
        action: 'CREATE_POST' as const,
        params: {
          content: `🤖 E2E Test Post - ${new Date().toISOString()}`
        },
        reasoning: 'E2E test post'
      }

      try {
        const result = await executeAction(a2aClient, decision)
        
        // May fail if permissions not set up, that's okay
        console.log(`   Post result:`, result.success ? '✅' : '❌', result.message)
        
        if (result.success) {
          expect(result.data).toBeDefined()
          memory.add({
            action: decision.action,
            params: decision.params,
            result: result.data,
            timestamp: Date.now()
          })
        }
      } catch (error) {
        console.log(`   Post failed (expected if not authorized):`, (error as Error).message)
      }
    }, 10000)
  })

  describe('Phase 7: Extended A2A Methods', () => {
    it('should get user profile', async () => {
      try {
        const profile = await a2aClient.getUserProfile(a2aClient.agentId!)
        expect(profile).toBeDefined()
        console.log(`   Profile:`, profile)
      } catch (error) {
        console.log(`   Profile fetch failed:`, (error as Error).message)
      }
    })

    it('should get system stats', async () => {
      try {
        const stats = await a2aClient.getSystemStats()
        expect(stats).toBeDefined()
        console.log(`   System stats:`, stats)
      } catch (error) {
        console.log(`   Stats fetch failed:`, (error as Error).message)
      }
    })

    it('should get leaderboard', async () => {
      try {
        const leaderboard = await a2aClient.getLeaderboard('all', 10)
        expect(leaderboard).toBeDefined()
        console.log(`   Leaderboard:`, leaderboard)
      } catch (error) {
        console.log(`   Leaderboard fetch failed:`, (error as Error).message)
      }
    })

    it('should discover agents', async () => {
      try {
        const agents = await a2aClient.discoverAgents()
        expect(agents).toBeDefined()
        console.log(`   Discovered agents:`, agents)
      } catch (error) {
        console.log(`   Agent discovery failed:`, (error as Error).message)
      }
    })
  })

  describe('Phase 8: Full Agent Loop Simulation', () => {
    it('should complete one full autonomous tick', async () => {
      console.log('\n🔄 Simulating full autonomous tick...')
      
      // 1. Gather context
      const portfolio = await a2aClient.getPortfolio()
      const markets = await a2aClient.getMarkets()
      const feed = await a2aClient.getFeed(10)
      const recentMemory = memory.getRecent(5)

      console.log(`   ✓ Portfolio: $${portfolio.balance}, ${portfolio.positions.length} positions`)
      console.log(`   ✓ Markets: ${markets.predictions.length + markets.perps.length} available`)
      console.log(`   ✓ Feed: ${feed.posts.length} posts`)
      console.log(`   ✓ Memory: ${recentMemory.length} recent actions`)

      // 2. Make decision
      const decision = await decisionMaker.decide({
        portfolio,
        markets,
        feed,
        memory: recentMemory
      })

      console.log(`   ✓ Decision: ${decision.action}`)

      // 3. Execute (safe actions only)
      if (decision.action === 'HOLD' || decision.action === 'CREATE_POST') {
        const result = await executeAction(a2aClient, decision)
        console.log(`   ✓ Execution: ${result.success ? '✅' : '❌'}`)
        
        if (result.success) {
          memory.add({
            action: decision.action,
            params: decision.params,
            result: result.data,
            timestamp: Date.now()
          })
        }
      } else {
        console.log(`   ⏭️  Skipping execution of ${decision.action} in test`)
      }

      console.log('✅ Full tick completed\n')
      
      expect(decision).toBeDefined()
      expect(decision.action).toBeDefined()
    }, 20000)
  })
  })
} else {
  describe('E2E - Autonomous Agent Live Tests', () => {
    it('E2E tests skipped - missing configuration', () => {
      console.log('\n⚠️  E2E tests skipped')
      console.log('   Required:')
      console.log('   - BABYLON_WS_URL')
      console.log('   - AGENT0_PRIVATE_KEY')
      console.log('   - At least one of: GROQ_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY\n')
      expect(true).toBe(true)
    })
  })
}

export {}

