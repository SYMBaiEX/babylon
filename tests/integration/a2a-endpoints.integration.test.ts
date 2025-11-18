/**
 * A2A Endpoints Integration Tests
 * Tests for A2A agent card and discovery endpoints
 */

import { describe, it, expect, beforeAll } from 'bun:test'
import { prisma } from '@/lib/prisma'
import { agentRegistry } from '@/lib/services/agent-registry.service'
import { AgentType, AgentStatus } from '@/types/agent-registry.types'
import type { AgentCapabilities } from '@/types/a2a'
import { OASFSkillCategories, OASFDomainCategories } from '@/lib/utils/oasf-skill-mapper'

describe('A2A Endpoints Integration Tests', () => {
  // Test agent IDs
  const testTraderAgentId = 'test-trader-npc-001'
  const testAnalystAgentId = 'test-analyst-npc-002'

  // Check if server is running
  let serverAvailable = false
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

  beforeAll(async () => {
    try {
      const health = await fetch(`${baseUrl}/api/health`)
      serverAvailable = health.ok
    } catch {
      serverAvailable = false
    }

    if (!serverAvailable) {
      console.warn('⚠️  Server not available - skipping A2A endpoint tests')
      return
    }

    // Ensure actors exist
    const actor1 = await prisma.actor.findUnique({ where: { id: testTraderAgentId } })
    if (!actor1) {
      await prisma.actor.create({
        data: {
          id: testTraderAgentId,
          name: 'Test Trader NPC',
          description: 'Test trader NPC',
          domain: [],
          tier: 'B_TIER',
          postStyle: 'Test',
          postExample: [],
          personality: 'Test',
          hasPool: false,
          updatedAt: new Date()
        }
      })
    }

    const actor2 = await prisma.actor.findUnique({ where: { id: testAnalystAgentId } })
    if (!actor2) {
      await prisma.actor.create({
        data: {
          id: testAnalystAgentId,
          name: 'Test Analyst NPC',
          description: 'Test analyst NPC',
          domain: [],
          tier: 'B_TIER',
          postStyle: 'Test',
          postExample: [],
          personality: 'Test',
          hasPool: false,
          updatedAt: new Date()
        }
      })
    }

    // Register test NPC agents with OASF capabilities
    const traderCapabilities: AgentCapabilities = {
      strategies: ['prediction_markets', 'autonomous_trading'],
      markets: ['prediction', 'perpetual'],
      actions: ['trade', 'analyze_market'],
      version: '1.0.0',
      x402Support: true,
      platform: 'babylon',
      userType: 'npc',
      skills: [
        OASFSkillCategories.TRADING,
        OASFSkillCategories.RISK_ANALYSIS,
        OASFSkillCategories.DATA_ANALYSIS,
      ],
      domains: [
        OASFDomainCategories.TRADING_MARKETS,
        OASFDomainCategories.FINANCE,
      ],
    }

    const analystCapabilities: AgentCapabilities = {
      strategies: ['market_analysis'],
      markets: ['prediction'],
      actions: ['analyze_market', 'post'],
      version: '1.0.0',
      x402Support: false,
      platform: 'babylon',
      userType: 'npc',
      skills: [
        OASFSkillCategories.DATA_ANALYSIS,
        OASFSkillCategories.PREDICTION,
        OASFSkillCategories.INFORMATION_RETRIEVAL,
      ],
      domains: [
        OASFDomainCategories.FINANCE,
        OASFDomainCategories.RESEARCH,
      ],
    }

    // Create test NPCs (assuming Actor records exist)
    try {
      await agentRegistry.registerNpcAgent({
        actorId: testTraderAgentId,
        systemPrompt: 'Test trader NPC for A2A integration tests',
        capabilities: traderCapabilities,
      })

      await agentRegistry.updateAgentStatus(testTraderAgentId, AgentStatus.ACTIVE)
    } catch (error) {
      // Agent may already exist from previous test runs
      console.log('Test trader agent setup:', error)
    }

    try {
      await agentRegistry.registerNpcAgent({
        actorId: testAnalystAgentId,
        systemPrompt: 'Test analyst NPC for A2A integration tests',
        capabilities: analystCapabilities,
      })

      await agentRegistry.updateAgentStatus(testAnalystAgentId, AgentStatus.ACTIVE)
    } catch (error) {
      // Agent may already exist from previous test runs
      console.log('Test analyst agent setup:', error)
    }
  })

  describe('GET /api/agents/[agentId]/card', () => {
    it('should return agent card for existing agent', async () => {
      if (!serverAvailable) return
      const response = await fetch(`${baseUrl}/api/agents/${testTraderAgentId}/card`)

      expect(response.status).toBe(200)

      const agentCard = await response.json()

      expect(agentCard).toHaveProperty('version', '1.0')
      expect(agentCard).toHaveProperty('agentId', testTraderAgentId)
      expect(agentCard).toHaveProperty('name')
      expect(agentCard).toHaveProperty('description')
      expect(agentCard).toHaveProperty('endpoints')
      expect(agentCard).toHaveProperty('capabilities')
      expect(agentCard).toHaveProperty('authentication')
    })

    it('should include OASF skills in agent card', async () => {
      if (!serverAvailable) return
      const response = await fetch(`${baseUrl}/api/agents/${testTraderAgentId}/card`)

      expect(response.status).toBe(200)

      const agentCard = await response.json()

      expect(agentCard.capabilities).toHaveProperty('skills')
      expect(Array.isArray(agentCard.capabilities.skills)).toBe(true)
      expect(agentCard.capabilities.skills).toContain(OASFSkillCategories.TRADING)
    })

    it('should include OASF domains in agent card', async () => {
      if (!serverAvailable) return
      const response = await fetch(`${baseUrl}/api/agents/${testTraderAgentId}/card`)

      expect(response.status).toBe(200)

      const agentCard = await response.json()

      expect(agentCard.capabilities).toHaveProperty('domains')
      expect(Array.isArray(agentCard.capabilities.domains)).toBe(true)
      expect(agentCard.capabilities.domains).toContain(OASFDomainCategories.TRADING_MARKETS)
    })

    it('should include A2A endpoints in agent card', async () => {
      if (!serverAvailable) return
      const response = await fetch(`${baseUrl}/api/agents/${testTraderAgentId}/card`)

      expect(response.status).toBe(200)

      const agentCard = await response.json()

      expect(agentCard.endpoints).toHaveProperty('a2a')
      expect(agentCard.endpoints).toHaveProperty('mcp')
      expect(agentCard.endpoints).toHaveProperty('rpc')

      expect(agentCard.endpoints.a2a).toContain(`/api/agents/${testTraderAgentId}/a2a`)
      expect(agentCard.endpoints.mcp).toContain(`/api/agents/${testTraderAgentId}/mcp`)
      expect(agentCard.endpoints.rpc).toContain(`/api/agents/${testTraderAgentId}/card`)
    })

    it('should return 404 for non-existent agent', async () => {
      if (!serverAvailable) return
      const response = await fetch(`${baseUrl}/api/agents/non-existent-agent/card`)

      expect(response.status).toBe(404)

      const error = await response.json()

      expect(error).toHaveProperty('error', 'Agent not found')
    })
  })

  describe('GET /api/agents/discover', () => {
    it('should discover all active agents', async () => {
      if (!serverAvailable) return
      const response = await fetch(`${baseUrl}/api/agents/discover`)

      expect(response.status).toBe(200)

      const result = await response.json()

      expect(result).toHaveProperty('agents')
      expect(result).toHaveProperty('total')
      expect(Array.isArray(result.agents)).toBe(true)
      expect(result.total).toBeGreaterThan(0)
    })

    it('should filter agents by OASF skills', async () => {
      if (!serverAvailable) return
      const response = await fetch(
        `${baseUrl}/api/agents/discover?skills=${OASFSkillCategories.TRADING}`
      )

      expect(response.status).toBe(200)

      const result = await response.json()

      expect(result.agents.length).toBeGreaterThan(0)

      // All returned agents should have trading skill
      for (const agent of result.agents) {
        expect(agent.capabilities.skills).toContain(OASFSkillCategories.TRADING)
      }
    })

    it('should filter agents by OASF domains', async () => {
      if (!serverAvailable) return
      const response = await fetch(
        `${baseUrl}/api/agents/discover?domains=${OASFDomainCategories.FINANCE}`
      )

      expect(response.status).toBe(200)

      const result = await response.json()

      expect(result.agents.length).toBeGreaterThan(0)

      // All returned agents should have finance domain
      for (const agent of result.agents) {
        expect(agent.capabilities.domains).toContain(OASFDomainCategories.FINANCE)
      }
    })

    it('should support "any" match mode for skills', async () => {
      if (!serverAvailable) return
      const response = await fetch(
        `${baseUrl}/api/agents/discover?skills=${OASFSkillCategories.TRADING},${OASFSkillCategories.INFORMATION_RETRIEVAL}&matchMode=any`
      )

      expect(response.status).toBe(200)

      const result = await response.json()

      expect(result.agents.length).toBeGreaterThan(0)

      // At least one agent should have either skill
      const hasTrading = result.agents.some((agent: any) =>
        agent.capabilities.skills.includes(OASFSkillCategories.TRADING)
      )
      const hasInfoRetrieval = result.agents.some((agent: any) =>
        agent.capabilities.skills.includes(OASFSkillCategories.INFORMATION_RETRIEVAL)
      )

      expect(hasTrading || hasInfoRetrieval).toBe(true)
    })

    it('should support "all" match mode for skills', async () => {
      if (!serverAvailable) return
      const response = await fetch(
        `${baseUrl}/api/agents/discover?skills=${OASFSkillCategories.DATA_ANALYSIS},${OASFSkillCategories.PREDICTION}&matchMode=all`
      )

      expect(response.status).toBe(200)

      const result = await response.json()

      // All returned agents must have both skills
      for (const agent of result.agents) {
        expect(agent.capabilities.skills).toContain(OASFSkillCategories.DATA_ANALYSIS)
        expect(agent.capabilities.skills).toContain(OASFSkillCategories.PREDICTION)
      }
    })

    it('should filter by agent type', async () => {
      if (!serverAvailable) return
      const response = await fetch(`${baseUrl}/api/agents/discover?types=NPC`)

      expect(response.status).toBe(200)

      const result = await response.json()

      expect(result.agents.length).toBeGreaterThan(0)

      // All returned agents should be NPCs
      for (const agent of result.agents) {
        expect(agent.type).toBe(AgentType.NPC)
      }
    })

    it('should support pagination', async () => {
      if (!serverAvailable) return

      // First page
      const page1 = await fetch(`${baseUrl}/api/agents/discover?limit=1&offset=0`)
      const result1 = await page1.json()

      // Second page
      const page2 = await fetch(`${baseUrl}/api/agents/discover?limit=1&offset=1`)
      const result2 = await page2.json()

      expect(result1.agents.length).toBeLessThanOrEqual(1)
      expect(result2.agents.length).toBeLessThanOrEqual(1)

      if (result1.agents.length > 0 && result2.agents.length > 0) {
        expect(result1.agents[0].agentId).not.toBe(result2.agents[0].agentId)
      }
    })

    it('should support search by name/description', async () => {
      if (!serverAvailable) return
      const response = await fetch(`${baseUrl}/api/agents/discover?search=trader`)

      expect(response.status).toBe(200)

      const result = await response.json()

      // Should find at least our test trader
      const foundTestTrader = result.agents.some(
        (agent: any) => agent.agentId === testTraderAgentId
      )

      expect(foundTestTrader).toBe(true)
    })

    it('should combine multiple filters', async () => {
      if (!serverAvailable) return
      const response = await fetch(
        `${baseUrl}/api/agents/discover?types=NPC&skills=${OASFSkillCategories.TRADING}&domains=${OASFDomainCategories.FINANCE}`
      )

      expect(response.status).toBe(200)

      const result = await response.json()

      // All returned agents should match all filters
      for (const agent of result.agents) {
        expect(agent.type).toBe(AgentType.NPC)
        expect(agent.capabilities.skills).toContain(OASFSkillCategories.TRADING)
        expect(agent.capabilities.domains).toContain(OASFDomainCategories.FINANCE)
      }
    })
  })

  describe('Agent0 SDK Compatibility', () => {
    it('should return agent card compatible with Agent0 SDK v0.31.0', async () => {
      if (!serverAvailable) return
      const response = await fetch(`${baseUrl}/api/agents/${testTraderAgentId}/card`)

      expect(response.status).toBe(200)

      const agentCard = await response.json()

      // Agent0 SDK v0.31.0 requirements
      expect(agentCard.version).toBe('1.0')
      expect(agentCard).toHaveProperty('agentId')
      expect(agentCard).toHaveProperty('endpoints')
      expect(agentCard.capabilities).toHaveProperty('skills')
      expect(agentCard.capabilities).toHaveProperty('domains')

      // OASF taxonomy validation
      expect(Array.isArray(agentCard.capabilities.skills)).toBe(true)
      expect(Array.isArray(agentCard.capabilities.domains)).toBe(true)

      // A2A/MCP endpoints
      expect(agentCard.endpoints).toHaveProperty('a2a')
      expect(agentCard.endpoints).toHaveProperty('mcp')
    })
  })
})

