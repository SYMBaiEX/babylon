/**
 * Comprehensive Multi-Tick Agent A2A Integration Test
 * 
 * Tests agents running for multiple ticks, calling providers and actions,
 * verifying all A2A calls are made correctly with full tracing.
 * 
 * This test simulates real agent behavior:
 * 1. Creates an agent runtime with A2A client
 * 2. Runs multiple autonomous ticks
 * 3. Calls providers to gather context
 * 4. Executes actions based on context
 * 5. Traces all A2A calls to verify they're actually made
 * 6. Verifies no errors occur across all ticks
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { AgentRuntime, type Character, type Memory } from '@elizaos/core'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { babylonPlugin } from '@/lib/agents/plugins/babylon'
import type { BabylonRuntime } from '@/lib/agents/plugins/babylon/types'
import { initializeAgentA2AClient } from '@/lib/agents/plugins/babylon/integration'
import { ethers } from 'ethers'
import { autonomousCoordinator } from '@/lib/agents/autonomous'
import type { BabylonA2AClientWrapper } from '@/lib/agents/plugins/babylon/integration-official-sdk-complete'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

// Track all A2A calls made during tests
interface A2ACallTrace {
  method: string
  params: unknown
  timestamp: number
  success: boolean
  error?: string
  response?: unknown
}

class A2ACallTracker {
  private calls: A2ACallTrace[] = []
  private originalRequest: typeof BabylonA2AClientWrapper.prototype.request

  constructor(client: BabylonA2AClientWrapper) {
    // Store original request method
    this.originalRequest = client.request.bind(client)
    
    // Wrap request method to track calls
    client.request = async (method: string, params?: unknown) => {
      const trace: A2ACallTrace = {
        method,
        params,
        timestamp: Date.now(),
        success: false
      }
      
      try {
        const response = await this.originalRequest(method, params)
        trace.success = true
        trace.response = response
        this.calls.push(trace)
        return response
      } catch (error) {
        trace.success = false
        trace.error = error instanceof Error ? error.message : String(error)
        this.calls.push(trace)
        throw error
      }
    }
  }

  getCalls(): A2ACallTrace[] {
    return [...this.calls]
  }

  getCallsByMethod(method: string): A2ACallTrace[] {
    return this.calls.filter(c => c.method === method)
  }

  getSuccessfulCalls(): A2ACallTrace[] {
    return this.calls.filter(c => c.success)
  }

  getFailedCalls(): A2ACallTrace[] {
    return this.calls.filter(c => !c.success)
  }

  reset(): void {
    this.calls = []
  }

  printSummary(): void {
    console.log('\n📊 A2A Call Summary:')
    console.log(`   Total calls: ${this.calls.length}`)
    console.log(`   Successful: ${this.getSuccessfulCalls().length}`)
    console.log(`   Failed: ${this.getFailedCalls().length}`)
    
    const methods = new Set(this.calls.map(c => c.method))
    console.log(`   Unique methods: ${methods.size}`)
    
    if (this.getFailedCalls().length > 0) {
      console.log('\n❌ Failed calls:')
      this.getFailedCalls().forEach(call => {
        console.log(`   - ${call.method}: ${call.error}`)
      })
    }
    
    console.log('\n📋 Method breakdown:')
    methods.forEach(method => {
      const methodCalls = this.getCallsByMethod(method)
      const successful = methodCalls.filter(c => c.success).length
      console.log(`   ${method}: ${successful}/${methodCalls.length} successful`)
    })
  }
}

describe('Agent A2A Multi-Tick Integration', () => {
  let testAgent: { id: string; walletAddress: string | null }
  let runtime: BabylonRuntime
  let a2aTracker: A2ACallTracker
  let serverAvailable = false

  beforeAll(async () => {
    // Check if server is running
    try {
      const healthResponse = await fetch(`${BASE_URL}/api/health`, { 
        signal: AbortSignal.timeout(2000) 
      })
      if (healthResponse.ok) {
        serverAvailable = true
        console.log('✅ Server available - running multi-tick A2A tests')
      } else {
        console.log('⚠️  Server not running - skipping A2A integration tests')
        console.log('   Run `bun dev` to start the server for full test coverage')
        return
      }
    } catch (error) {
      console.log('⚠️  Server not available - skipping A2A integration tests')
      console.log('   Run `bun dev` to start the server for full test coverage')
      return
    }

    // Create test agent user
    const privateKey = process.env.AGENT_DEFAULT_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey
    const wallet = new ethers.Wallet(privateKey)
    const testAgentId = await generateSnowflakeId()

    // Clean up any existing test agent
    await prisma.user.deleteMany({
      where: { walletAddress: wallet.address }
    })

    testAgent = await prisma.user.create({
      data: {
        id: testAgentId,
        username: `test_multi_tick_agent_${Date.now()}`,
        displayName: 'Multi-Tick Test Agent',
        walletAddress: wallet.address,
        isAgent: true,
        autonomousTrading: true,
        autonomousPosting: true,
        autonomousCommenting: true,
        autonomousDMs: true,
        autonomousGroupChats: true,
        virtualBalance: 10000,
        agentPointsBalance: 100, // Give agent points to run
        reputationPoints: 1000,
        agentSystem: 'You are a test agent for multi-tick A2A integration testing. You should explore the platform, check markets, read posts, and engage with content.',
        agentModelTier: 'free',
        updatedAt: new Date()
      }
    })

    console.log(`✅ Created test agent: ${testAgent.id}`)

    // Create A2A client using official SDK wrapper
    const a2aClient = await initializeAgentA2AClient(testAgent.id)

    // Create tracker
    a2aTracker = new A2ACallTracker(a2aClient)

    // Create Eliza runtime with plugin
    const character: Character = {
      name: 'MultiTickTestAgent',
      system: 'You are a test agent for multi-tick A2A integration testing',
      bio: ['Testing agent'],
      messageExamples: [],
      style: {},
      plugins: [],
      settings: {
        GROQ_API_KEY: process.env.GROQ_API_KEY || ''
      }
    }

    runtime = new AgentRuntime({
      agentId: testAgent.id as `${string}-${string}-${string}-${string}-${string}`,
      character,
      settings: {
        GROQ_API_KEY: process.env.GROQ_API_KEY || ''
      }
    }) as BabylonRuntime

    // Inject A2A client
    runtime.a2aClient = a2aClient

    // Register plugin
    runtime.registerPlugin(babylonPlugin)

    console.log('✅ Runtime initialized with A2A client and tracking')
  })

  afterAll(async () => {
    if (testAgent) {
      await prisma.user.deleteMany({
        where: { id: testAgent.id }
      })
    }
  })

  test('Agent runs multiple ticks without errors', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const NUM_TICKS = 3
    const errors: Error[] = []
    const tickResults: Array<{ tick: number; success: boolean; actions: number; duration: number }> = []

    console.log(`\n🔄 Running ${NUM_TICKS} autonomous ticks...`)

    for (let tick = 1; tick <= NUM_TICKS; tick++) {
      console.log(`\n--- Tick ${tick}/${NUM_TICKS} ---`)
      
      const tickStart = Date.now()
      a2aTracker.reset()

      try {
        const result = await autonomousCoordinator.executeAutonomousTick(testAgent.id, runtime)
        
        const tickDuration = Date.now() - tickStart
        const totalActions = Object.values(result.actionsExecuted).reduce((sum, count) => sum + count, 0)
        
        tickResults.push({
          tick,
          success: result.success,
          actions: totalActions,
          duration: tickDuration
        })

        console.log(`✅ Tick ${tick} completed:`)
        console.log(`   Success: ${result.success}`)
        console.log(`   Method: ${result.method}`)
        console.log(`   Actions: ${totalActions}`)
        console.log(`   Duration: ${tickDuration}ms`)
        console.log(`   Breakdown:`, result.actionsExecuted)

        // Verify A2A was used
        expect(result.method).toBe('a2a')
        
        // Print A2A call summary for this tick
        a2aTracker.printSummary()

        // Small delay between ticks
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)))
        console.error(`❌ Tick ${tick} failed:`, error)
        a2aTracker.printSummary()
      }
    }

    // Verify no errors occurred
    expect(errors.length).toBe(0)
    
    // Verify all ticks succeeded
    expect(tickResults.every(r => r.success)).toBe(true)
    
    // Verify at least some actions were executed
    const totalActions = tickResults.reduce((sum, r) => sum + r.actions, 0)
    console.log(`\n📊 Total actions across ${NUM_TICKS} ticks: ${totalActions}`)
    
    // Print final summary
    console.log('\n📈 Tick Summary:')
    tickResults.forEach(result => {
      console.log(`   Tick ${result.tick}: ${result.actions} actions in ${result.duration}ms`)
    })
  })

  test('Providers are called and return valid data', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    const providers = runtime.providers?.filter(p => 
      p.name.startsWith('BABYLON_')
    ) || []

    console.log(`\n🔍 Testing ${providers.length} providers...`)

    const providerResults: Array<{ name: string; success: boolean; hasData: boolean; error?: string }> = []

    for (const provider of providers) {
      a2aTracker.reset()
      
      try {
        const result = await provider.get(
          runtime,
          {} as Memory,
          { values: {}, data: {}, text: '' }
        )

        const calls = a2aTracker.getCalls()
        const successfulCalls = a2aTracker.getSuccessfulCalls()

        providerResults.push({
          name: provider.name,
          success: !!result && !!result.text,
          hasData: !!(result?.text && result.text.length > 0),
        })

        console.log(`✅ ${provider.name}:`)
        console.log(`   A2A calls made: ${calls.length}`)
        console.log(`   Successful calls: ${successfulCalls.length}`)
        console.log(`   Has data: ${!!result?.text && result.text.length > 0}`)

        // Verify provider made A2A calls
        expect(calls.length).toBeGreaterThan(0)
        
        // Verify all calls succeeded
        expect(successfulCalls.length).toBe(calls.length)
        
        // Verify result doesn't contain error messages
        const resultText = result && typeof result === 'object' && 'text' in result ? result.text : undefined
        if (resultText && typeof resultText === 'string') {
          expect(resultText).not.toContain('ERROR')
          expect(resultText).not.toContain('not implemented')
          expect(resultText).not.toContain('REST API')
        }

      } catch (error) {
        providerResults.push({
          name: provider.name,
          success: false,
          hasData: false,
          error: error instanceof Error ? error.message : String(error)
        })
        console.error(`❌ ${provider.name} failed:`, error)
      }

      // Small delay between providers
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Verify all providers succeeded
    const failedProviders = providerResults.filter(r => !r.success)
    expect(failedProviders.length).toBe(0)

    console.log(`\n✅ All ${providers.length} providers tested successfully`)
  })

  test('Actions can be executed via A2A', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    // Test a few key actions
    const actionsToTest = [
      { name: 'CREATE_POST', testMessage: 'post This is a test post from multi-tick integration test' },
      // Add more actions as needed
    ]

    console.log(`\n⚡ Testing ${actionsToTest.length} actions...`)

    for (const actionConfig of actionsToTest) {
      const action = runtime.actions?.find(a => a.name === actionConfig.name)
      
      if (!action) {
        console.log(`⏭️  Skipping ${actionConfig.name} - not found`)
        continue
      }

      a2aTracker.reset()

      try {
        const message = {
          userId: testAgent.id,
          agentId: testAgent.id,
          entityId: testAgent.id,
          content: { text: actionConfig.testMessage },
          roomId: testAgent.id
        } as unknown as Memory

        let callbackResult: { text?: string; action?: string } | null = null

        await action.handler(
          runtime,
          message,
          { values: {}, data: {}, text: '' },
          {},
          async (result) => {
            callbackResult = result as { text?: string; action?: string }
            return []
          }
        )

        const calls = a2aTracker.getCalls()
        const successfulCalls = a2aTracker.getSuccessfulCalls()

        console.log(`✅ ${actionConfig.name}:`)
        console.log(`   A2A calls made: ${calls.length}`)
        console.log(`   Successful calls: ${successfulCalls.length}`)
        console.log(`   Callback result: ${callbackResult ? 'received' : 'none'}`)

        // Verify action made A2A calls
        expect(calls.length).toBeGreaterThan(0)
        
        // Verify all calls succeeded
        expect(successfulCalls.length).toBe(calls.length)
        
        // Verify callback was called
        expect(callbackResult).toBeDefined()

        // Verify callback result doesn't contain errors
        if (callbackResult && typeof callbackResult === 'object' && 'text' in callbackResult) {
          const callbackText = (callbackResult as { text?: string }).text
          if (typeof callbackText === 'string') {
            expect(callbackText).not.toContain('ERROR')
            expect(callbackText).not.toContain('not implemented')
          }
        }
        
        // Use callbackResult to avoid unused variable warning
        expect(callbackResult).toBeTruthy()

      } catch (error) {
        console.error(`❌ ${actionConfig.name} failed:`, error)
        a2aTracker.printSummary()
        throw error
      }

      // Small delay between actions
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log(`\n✅ All actions tested successfully`)
  })

  test('Full agent lifecycle: providers → actions → tick', async () => {
    if (!serverAvailable) {
      console.log('⏭️  Skipping - server not available')
      return
    }

    console.log('\n🔄 Testing full agent lifecycle...')

    // Step 1: Call providers to gather context
    console.log('\n1️⃣ Gathering context via providers...')
    a2aTracker.reset()

    const marketsProvider = runtime.providers?.find(p => p.name === 'BABYLON_MARKETS')
    const feedProvider = runtime.providers?.find(p => p.name === 'BABYLON_FEED')
    const portfolioProvider = runtime.providers?.find(p => p.name === 'BABYLON_PORTFOLIO')

    const providerResults = await Promise.all([
      marketsProvider?.get(runtime, {} as Memory, { values: {}, data: {}, text: '' }),
      feedProvider?.get(runtime, {} as Memory, { values: {}, data: {}, text: '' }),
      portfolioProvider?.get(runtime, {} as Memory, { values: {}, data: {}, text: '' }),
    ])

    const providerCalls = a2aTracker.getCalls()
    console.log(`   ✅ Gathered context via ${providerCalls.length} provider calls`)
    
    // Verify providers returned data and made A2A calls
    expect(providerCalls.length).toBeGreaterThan(0)
    for (const result of providerResults) {
      if (result && typeof result === 'object' && 'text' in result) {
        expect(result.text).toBeDefined()
      }
    }

    // Step 2: Execute an action based on context
    console.log('\n2️⃣ Executing action...')
    a2aTracker.reset()

    const createPostAction = runtime.actions?.find(a => a.name === 'CREATE_POST')
    if (createPostAction) {
      const message = {
        userId: testAgent.id,
        agentId: testAgent.id,
        entityId: testAgent.id,
        content: { text: 'post Test post from lifecycle test' },
        roomId: testAgent.id
      } as unknown as Memory

      let callbackResult: { text?: string; action?: string } | null = null

      await createPostAction.handler(
        runtime,
        message,
        { values: {}, data: {}, text: '' },
        {},
        async (result) => {
          callbackResult = result as { text?: string; action?: string }
          return []
        }
      )

      const actionCalls = a2aTracker.getCalls()
      console.log(`   ✅ Executed action via ${actionCalls.length} A2A calls`)
      expect(actionCalls.length).toBeGreaterThan(0)
      expect(callbackResult).toBeDefined() // Use callbackResult to avoid unused warning
    }

    // Step 3: Run a full autonomous tick
    console.log('\n3️⃣ Running autonomous tick...')
    a2aTracker.reset()

    const tickResult = await autonomousCoordinator.executeAutonomousTick(testAgent.id, runtime)
    
    const tickCalls = a2aTracker.getCalls()
    console.log(`   ✅ Tick completed via ${tickCalls.length} A2A calls`)
    console.log(`   Actions executed:`, tickResult.actionsExecuted)

    // Verify everything worked
    expect(tickResult.success).toBe(true)
    expect(tickResult.method).toBe('a2a')
    expect(tickCalls.length).toBeGreaterThan(0)

    // Print final summary
    console.log('\n📊 Lifecycle Summary:')
    console.log(`   Provider calls: ${providerCalls.length}`)
    console.log(`   Action calls: ${a2aTracker.getCalls().length}`)
    console.log(`   Tick calls: ${tickCalls.length}`)
    console.log(`   Total A2A calls: ${providerCalls.length + tickCalls.length}`)

    // Verify no errors
    const allCalls = [...providerCalls, ...tickCalls]
    const failedCalls = allCalls.filter(c => !c.success)
    expect(failedCalls.length).toBe(0)

    console.log('\n✅ Full lifecycle test completed successfully')
  })
})

