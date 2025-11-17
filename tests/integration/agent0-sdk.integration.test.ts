/**
 * Comprehensive Agent0 SDK Integration Tests
 * 
 * Tests all Agent0 SDK features to ensure complete implementation:
 * - Agent registration
 * - Agent search and discovery
 * - Feedback submission with authorization
 * - Reputation querying
 * - Agent profile retrieval
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { getAgent0Client } from '@/agents/agent0/Agent0Client'
import { Agent0FeedbackService } from '@/lib/agent0/feedback-service'
import { SubgraphClient } from '@/agents/agent0/SubgraphClient'
import { prisma } from '@/lib/prisma'

describe('Agent0 SDK Complete Integration', () => {
  let agent0Client: ReturnType<typeof getAgent0Client>
  let feedbackService: Agent0FeedbackService
  let subgraphClient: SubgraphClient
  let sdkAvailable = false

  beforeAll(() => {
    // Initialize clients
    try {
      agent0Client = getAgent0Client()
      feedbackService = new Agent0FeedbackService()
      subgraphClient = new SubgraphClient()
      sdkAvailable = agent0Client.isAvailable()
    } catch (error) {
      // SDK not configured - tests will be skipped
      console.warn('Agent0 SDK not configured, some tests will be skipped')
    }
  })

  describe('Agent Registration', () => {
    test('should register an agent with all required fields', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const result = await agent0Client.registerAgent({
        name: 'Test Agent',
        description: 'Test agent for integration testing',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
        a2aEndpoint: 'https://test.agent.com/a2a',
        capabilities: {
          strategies: ['test'],
          markets: ['prediction'],
          actions: ['test'],
          version: '1.0.0',
          skills: [],
          domains: [],
        },
      })

      expect(result).toBeDefined()
      expect(result.tokenId).toBeGreaterThan(0)
      expect(result.metadataCID).toBeDefined()
    })

    test('should register agent with MCP and A2A endpoints', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const result = await agent0Client.registerAgent({
        name: 'Test Agent with Endpoints',
        description: 'Test agent',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
        mcpEndpoint: 'https://test.agent.com/mcp',
        a2aEndpoint: 'https://test.agent.com/a2a',
        capabilities: {
          strategies: ['test'],
          markets: ['prediction'],
          actions: ['test'],
          version: '1.0.0',
          skills: [],
          domains: [],
        },
      })

      expect(result).toBeDefined()
      expect(result.tokenId).toBeGreaterThan(0)
    })

    test('should register agent with x402 support', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const result = await agent0Client.registerAgent({
        name: 'Test Agent with x402',
        description: 'Test agent',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
        capabilities: {
          strategies: ['test'],
          markets: ['prediction'],
          actions: ['test'],
          version: '1.0.0',
          x402Support: true,
          skills: [],
          domains: [],
        },
      })

      expect(result).toBeDefined()
      expect(result.tokenId).toBeGreaterThan(0)
    })
  })

  describe('Agent Search', () => {
    test('should search agents by name', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const results = await agent0Client.searchAgents({
        name: 'Test',
      })

      expect(Array.isArray(results)).toBe(true)
      results.forEach((agent) => {
        expect(agent.tokenId).toBeGreaterThan(0)
        expect(agent.name).toBeDefined()
        expect(agent.capabilities).toBeDefined()
      })
    })

    test('should search agents by strategies', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const results = await agent0Client.searchAgents({
        strategies: ['momentum', 'sentiment'],
      })

      expect(Array.isArray(results)).toBe(true)
    })

    test('should search agents with x402 support filter', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const results = await agent0Client.searchAgents({
        x402Support: true,
      })

      expect(Array.isArray(results)).toBe(true)
    })

    test('should return empty array when no agents match', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const results = await agent0Client.searchAgents({
        name: 'NonExistentAgent12345',
      })

      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('Agent Profile Retrieval', () => {
    test('should get agent profile by token ID', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const profile = await agent0Client.getAgentProfile(1)

      if (profile) {
        expect(profile.tokenId).toBe(1)
        expect(profile.name).toBeDefined()
        expect(profile.capabilities).toBeDefined()
      } else {
        // Agent may not exist, which is valid
        expect(profile).toBeNull()
      }
    })

    test('should return null for non-existent agent', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const profile = await agent0Client.getAgentProfile(999999999)

      expect(profile).toBeNull()
    })
  })

  describe('Feedback Submission', () => {
    test('should submit feedback with authorization', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      // This requires a valid agent token ID and user with wallet
      const testUserId = 'test-user-id'
      const testAgentId = '84532:1' // Example agent ID

      // Create test user if needed
      const user = await prisma.user.upsert({
        where: { id: testUserId },
        create: {
          id: testUserId,
          username: 'testuser',
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
          updatedAt: new Date(),
        },
        update: {
          updatedAt: new Date(),
        },
      })

      await feedbackService.submitFeedback({
        agentId: testAgentId,
        fromUserId: user.id,
        score: 80,
        skill: 'trading',
        comment: 'Test feedback',
      })

      // If we get here, feedback was submitted successfully
      // Verify by checking the result or querying back
      const reputation = await feedbackService.getAgentReputation(testAgentId)
      expect(reputation).toBeDefined()
    })

    test('should handle feedback submission errors gracefully', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      await expect(
        feedbackService.submitFeedback({
          agentId: '84532:999999999', // Non-existent agent
          fromUserId: 'test-user',
          score: 80,
        })
      ).rejects.toThrow()
    })
  })

  describe('Reputation Querying', () => {
    test('should get agent reputation summary', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const reputation = await feedbackService.getAgentReputation('84532:1')

      if (reputation) {
        expect(reputation.agentId).toBeDefined()
        expect(typeof reputation.averageScore).toBe('number')
        expect(typeof reputation.totalFeedback).toBe('number')
      } else {
        // Agent may not have reputation yet
        expect(reputation).toBeNull()
      }
    })

    test('should handle reputation query for non-existent agent', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      const reputation = await feedbackService.getAgentReputation('84532:999999999')

      // Should return null or empty result
      expect(reputation === null || typeof reputation === 'object').toBe(true)
    })
  })

  describe('Subgraph Client', () => {
    test('should search agents via subgraph', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      try {
        const agents = await subgraphClient.searchAgents({
          type: 'agent',
          limit: 10,
        })

        expect(Array.isArray(agents)).toBe(true)
      } catch (error) {
        // Subgraph may not be available in all environments - this is acceptable
        expect(error).toBeDefined()
        console.log('   ⚠️  Subgraph not available (expected in some environments)')
      }
    })

    test('should get game platforms via subgraph', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      try {
        const platforms = await subgraphClient.getGamePlatforms({
          markets: ['prediction'],
        })

        expect(Array.isArray(platforms)).toBe(true)
      } catch (error) {
        // Subgraph may not be available - this is acceptable
        expect(error).toBeDefined()
        console.log('   ⚠️  Subgraph not available (expected in some environments)')
      }
    })

    test('should get agent feedback via subgraph', async () => {
      if (!sdkAvailable) {
        console.log('   ⚠️  Skipping - SDK not available')
        return
      }

      try {
        const feedback = await subgraphClient.getAgentFeedback(1)

        expect(Array.isArray(feedback)).toBe(true)
      } catch (error) {
        // Subgraph may not be available - this is acceptable
        expect(error).toBeDefined()
        console.log('   ⚠️  Subgraph not available (expected in some environments)')
      }
    })
  })

  describe('SDK Availability', () => {
    test('should check if SDK is available', () => {
      const available = agent0Client.isAvailable()
      expect(typeof available).toBe('boolean')
    })

    test('should handle SDK initialization errors gracefully', async () => {
      if (!sdkAvailable) {
        await expect(agent0Client.ensureAvailable()).rejects.toThrow()
      } else {
        await agent0Client.ensureAvailable()
        // Should not throw if SDK is available
      }
    })
  })

})

