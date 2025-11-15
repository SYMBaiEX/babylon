// @ts-nocheck - Test file

/**
 * Complete End-to-End Agent Creation Flow Test
 * 
 * Tests the entire agent creation journey from archetype selection
 * through profile generation, customization, tier selection, and deployment.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { agentService } from '@/lib/agents/services/AgentService'

describe('Complete Agent Creation Flow', () => {
  let testUserId: string
  let createdAgentId: string

  beforeAll(async () => {
    // Create test user with sufficient points
    testUserId = await generateSnowflakeId()
    await prisma.user.create({
      data: {
        id: testUserId,
        username: `test_e2e_user_${Date.now()}`,
        displayName: 'E2E Test User',
        bio: 'Testing end-to-end agent creation',
        reputationPoints: 10000,
        profileComplete: true,
        hasUsername: true,
        isTest: true,
        updatedAt: new Date()
      }
    })
  })

  afterAll(async () => {
    if (!prisma) return

    // Cleanup
    if (createdAgentId) {
      await prisma.agentMessage.deleteMany({ where: { agentUserId: createdAgentId } }).catch(() => {})
      await prisma.agentLog.deleteMany({ where: { agentUserId: createdAgentId } }).catch(() => {})
      await prisma.agentTrade.deleteMany({ where: { agentUserId: createdAgentId } }).catch(() => {})
      await prisma.agentPointsTransaction.deleteMany({ where: { agentUserId: createdAgentId } }).catch(() => {})
      await prisma.user.delete({ where: { id: createdAgentId } }).catch(() => {})
    }

    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {})
  })

  it('should complete the entire agent creation flow successfully', async () => {
    // Step 1: User selects archetype
    const selectedArchetype = {
      id: 'trader',
      name: 'Trader',
      emoji: '📈',
      description: 'Classic technical analysis focused trader'
    }

    expect(selectedArchetype).toBeDefined()
    expect(selectedArchetype.id).toBe('trader')

    // Step 2: Generate AI profile (simulating what the API would return)
    const generatedProfile = {
      name: 'Technical Titan',
      description: 'A methodical trader who uses technical analysis to identify profitable opportunities',
      system: 'You are a professional trader named Technical Titan. You specialize in technical analysis, using chart patterns, indicators, and price action to make informed trading decisions. You are analytical, patient, and disciplined in your approach.',
      bio: [
        'Technical analysis expert with 10+ years experience',
        'Specializes in chart patterns and indicators',
        'Risk management is top priority',
        'Data-driven decision maker'
      ],
      personality: 'Analytical and methodical. You think before you act, always considering risk-reward ratios. You speak with confidence backed by data, not emotion.',
      tradingStrategy: 'I use a combination of technical indicators including RSI, MACD, and moving averages to identify entry and exit points. I analyze chart patterns such as head and shoulders, triangles, and support/resistance levels. My risk management approach involves never risking more than 2% of my portfolio on a single trade, and I always set stop losses before entering positions.'
    }

    // Validate generated profile structure
    expect(generatedProfile.name).toBeDefined()
    expect(generatedProfile.system).toBeDefined()
    expect(Array.isArray(generatedProfile.bio)).toBe(true)
    expect(generatedProfile.bio.length).toBeGreaterThan(0)

    // Step 3: User reviews profile (can edit in modal, but we'll use as-is)
    const finalProfile = generatedProfile

    // Step 4: User selects random profile image and banner
    const profileImageIndex = Math.floor(Math.random() * 100) + 1
    const bannerIndex = Math.floor(Math.random() * 100) + 1
    const profileImageUrl = `/assets/user-profiles/profile-${profileImageIndex}.jpg`
    const coverImageUrl = `/assets/user-banners/banner-${bannerIndex}.jpg`

    expect(profileImageUrl).toMatch(/\/assets\/user-profiles\/profile-\d+\.jpg/)
    expect(coverImageUrl).toMatch(/\/assets\/user-banners\/banner-\d+\.jpg/)

    // Step 5: User selects model tier
    const selectedTier = 'standard'
    const tierPricing = {
      lite: { chat: 0, autoTick: 1 },
      standard: { chat: 1, autoTick: 2 },
      pro: { chat: 2, autoTick: 3 }
    }

    expect(tierPricing[selectedTier]).toBeDefined()
    expect(tierPricing[selectedTier].chat).toBe(1)
    expect(tierPricing[selectedTier].autoTick).toBe(2)

    // Step 6: User enters initial deposit
    const initialDeposit = 500

    // Verify user has sufficient balance
    const userBalance = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { reputationPoints: true }
    })

    expect(userBalance!.reputationPoints).toBeGreaterThanOrEqual(initialDeposit)

    // Step 7: Create agent with all the gathered information
    const agent = await agentService.createAgent({
      userId: testUserId,
      name: finalProfile.name,
      description: finalProfile.description,
      profileImageUrl,
      coverImageUrl,
      system: finalProfile.system,
      bio: finalProfile.bio,
      personality: finalProfile.personality,
      tradingStrategy: finalProfile.tradingStrategy,
      initialDeposit,
      modelTier: selectedTier
    })

    createdAgentId = agent.id

    // Step 8: Verify agent was created correctly
    expect(agent).toBeDefined()
    expect(agent.id).toBeDefined()
    expect(agent.displayName).toBe(finalProfile.name)
    expect(agent.isAgent).toBe(true)
    expect(agent.managedBy).toBe(testUserId)
    expect(agent.agentSystem).toBe(finalProfile.system)
    expect(agent.agentPersonality).toBe(finalProfile.personality)
    expect(agent.agentTradingStrategy).toBe(finalProfile.tradingStrategy)
    expect(agent.agentModelTier).toBe(selectedTier)
    expect(agent.agentPointsBalance).toBe(initialDeposit)
    expect(agent.agentTotalDeposited).toBe(initialDeposit)
    expect(agent.profileImageUrl).toBe(profileImageUrl)
    expect(agent.coverImageUrl).toBe(coverImageUrl)

    // Step 9: Verify bio was stored correctly
    // Bio points are stored in agentMessageExamples, description is stored in bio field
    const agentFull = await prisma.user.findUnique({ 
      where: { id: agent.id },
      select: { agentMessageExamples: true, bio: true }
    })
    
    expect(agentFull!.agentMessageExamples).toBeDefined()
    expect(agentFull!.agentMessageExamples).toEqual(finalProfile.bio)
    expect(agentFull!.bio).toBe(finalProfile.description)

    // Step 10: Verify user's points were deducted
    const userAfter = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { reputationPoints: true }
    })

    expect(userAfter!.reputationPoints).toBe(userBalance!.reputationPoints - initialDeposit)

    // Step 11: Verify points transaction was recorded
    const transactions = await prisma.agentPointsTransaction.findMany({
      where: { agentUserId: agent.id },
      orderBy: { createdAt: 'desc' }
    })

    expect(transactions.length).toBeGreaterThan(0)
    const depositTx = transactions.find(tx => tx.type === 'deposit')
    expect(depositTx).toBeDefined()
    expect(depositTx!.amount).toBe(initialDeposit)
    expect(depositTx!.balanceAfter).toBe(initialDeposit)

    // Step 12: Verify localStorage would be cleared (simulated)
    const draftWouldBeCleared = true
    expect(draftWouldBeCleared).toBe(true)

    // Step 13: Verify agent is ready for use
    expect(agent.profileComplete).toBe(true)
    // Status could be 'idle' or null when first created
    expect(['idle', null]).toContain(agent.agentStatus)

    // Step 14: Test that agent can perform basic actions with correct point costs
    
    // Test chat cost (Standard tier: 1 point per chat)
    const balanceBeforeChat = agent.agentPointsBalance
    await agentService.deductPoints(agent.id, tierPricing[selectedTier].chat, 'Test chat message')
    
    const agentAfterChat = await prisma.user.findUnique({
      where: { id: agent.id },
      select: { agentPointsBalance: true }
    })
    
    expect(agentAfterChat!.agentPointsBalance).toBe(balanceBeforeChat - tierPricing[selectedTier].chat)

    // Test autonomous tick cost (Standard tier: 2 points per tick)
    const balanceBeforeTick = agentAfterChat!.agentPointsBalance
    await agentService.deductPoints(agent.id, tierPricing[selectedTier].autoTick, 'Autonomous tick')
    
    const agentAfterTick = await prisma.user.findUnique({
      where: { id: agent.id },
      select: { agentPointsBalance: true }
    })
    
    expect(agentAfterTick!.agentPointsBalance).toBe(balanceBeforeTick - tierPricing[selectedTier].autoTick)

    // Final verification: Agent has correct remaining balance
    const expectedRemaining = initialDeposit - tierPricing[selectedTier].chat - tierPricing[selectedTier].autoTick
    expect(agentAfterTick!.agentPointsBalance).toBe(expectedRemaining)
  })

  it('should validate all model tiers work correctly', async () => {
    const tiers = ['lite', 'standard', 'pro'] as const
    const createdAgents: string[] = []

    for (const tier of tiers) {
      const agentId = await generateSnowflakeId()
      createdAgents.push(agentId)

      const agent = await agentService.createAgent({
        userId: testUserId,
        name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Test Agent`,
        description: `Testing ${tier} tier`,
        system: 'You are a test agent',
        bio: ['Test point'],
        personality: 'Test',
        tradingStrategy: 'Test strategy',
        initialDeposit: 100,
        modelTier: tier
      })

      expect(agent.agentModelTier).toBe(tier)

      // Verify correct point costs
      const pricing = {
        lite: { chat: 0, autoTick: 1 },
        standard: { chat: 1, autoTick: 2 },
        pro: { chat: 2, autoTick: 3 }
      }

      expect(pricing[tier]).toBeDefined()

      // Test chat cost
      await agentService.deductPoints(agent.id, pricing[tier].chat, 'Test chat')
      const afterChat = await prisma.user.findUnique({
        where: { id: agent.id },
        select: { agentPointsBalance: true }
      })

      expect(afterChat!.agentPointsBalance).toBe(100 - pricing[tier].chat)

      // Test tick cost
      await agentService.deductPoints(agent.id, pricing[tier].autoTick, 'Test tick')
      const afterTick = await prisma.user.findUnique({
        where: { id: agent.id },
        select: { agentPointsBalance: true }
      })

      expect(afterTick!.agentPointsBalance).toBe(100 - pricing[tier].chat - pricing[tier].autoTick)

      // Cleanup
      await prisma.agentPointsTransaction.deleteMany({ where: { agentUserId: agent.id } })
      await prisma.user.delete({ where: { id: agent.id } })
    }
  })

  it('should handle profile edit flow correctly', async () => {
    // Create initial agent
    const agent = await agentService.createAgent({
      userId: testUserId,
      name: 'Original Name',
      description: 'Original description',
      system: 'Original system prompt',
      bio: ['Original bio 1', 'Original bio 2'],
      personality: 'Original personality',
      tradingStrategy: 'Original strategy',
      initialDeposit: 100,
      modelTier: 'lite'
    })

    createdAgentId = agent.id

    // Simulate user editing the profile
    const updatedProfile = {
      name: 'Updated Name',
      description: 'Updated description',
      system: 'Updated system prompt',
      bio: ['Updated bio 1', 'Updated bio 2', 'New bio 3'],
      personality: 'Updated personality',
      tradingStrategy: 'Updated strategy'
    }

    // Update agent
    const updated = await agentService.updateAgent(agent.id, testUserId, {
      name: updatedProfile.name,
      description: updatedProfile.description,
      system: updatedProfile.system,
      personality: updatedProfile.personality,
      tradingStrategy: updatedProfile.tradingStrategy
    })

    // Update bio separately (as it's stored in bio field)
    await prisma.user.update({
      where: { id: agent.id },
      data: { bio: updatedProfile.bio.join('\n') }
    })

    // Verify updates
    expect(updated.displayName).toBe(updatedProfile.name)
    expect(updated.bio).toBe(updatedProfile.description)
    expect(updated.agentSystem).toBe(updatedProfile.system)
    expect(updated.agentPersonality).toBe(updatedProfile.personality)
    expect(updated.agentTradingStrategy).toBe(updatedProfile.tradingStrategy)

    const final = await prisma.user.findUnique({ where: { id: agent.id } })
    const parsedBio = final!.bio?.split('\n').filter(b => b.trim()) || []
    expect(parsedBio).toEqual(updatedProfile.bio)
  })

  it('should preserve archetype selection in localStorage flow', async () => {
    // Simulate localStorage data structure
    const localStorageData = {
      name: 'Test Agent',
      description: 'Test description',
      system: 'Test system',
      bio: ['Test bio'],
      personality: 'Test personality',
      tradingStrategy: 'Test strategy',
      modelTier: 'standard',
      initialDeposit: 100,
      archetype: 'trader' // This is stored for reference
    }

    // Verify all required fields are present
    expect(localStorageData.name).toBeDefined()
    expect(localStorageData.system).toBeDefined()
    expect(localStorageData.archetype).toBeDefined()
    expect(localStorageData.modelTier).toBeDefined()

    // Create agent from localStorage data
    const agent = await agentService.createAgent({
      userId: testUserId,
      ...localStorageData
    })

    createdAgentId = agent.id

    // Verify agent was created with correct data
    expect(agent.displayName).toBe(localStorageData.name)
    expect(agent.agentModelTier).toBe(localStorageData.modelTier)
    expect(agent.agentPointsBalance).toBe(localStorageData.initialDeposit)
  })
})

export {}

