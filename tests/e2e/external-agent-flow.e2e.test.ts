/**
 * External Agent E2E Flow Tests
 *
 * Tests the complete external agent integration workflow:
 * 1. Register external agent → Get API key
 * 2. Discover other agents → Find compatible agents
 * 3. Send A2A messages → Communicate with internal/external agents
 * 4. Verify trust scoring → Trust level progression
 */

import { test, expect } from '@playwright/test'
import type { AgentCapabilities } from '@/types/a2a'

// Base URL for API calls
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

// Test agent data
const testAgent = {
  externalId: `test-agent-${Date.now()}`,
  name: 'E2E Test Agent',
  description: 'External agent for end-to-end testing',
  endpoint: 'https://test-agent.example.com/a2a',
  protocol: 'a2a' as const,
  capabilities: {
    actions: ['text-generation', 'analysis'],
    version: '1.0.0',
    skills: ['communication', 'data-processing'],
    domains: ['testing', 'automation'],
  } as AgentCapabilities,
  agentCard: {
    version: '1.0' as const,
    agentId: `test-agent-${Date.now()}`,
    name: 'E2E Test Agent',
    description: 'External agent for end-to-end testing',
    endpoints: {
      a2a: 'https://test-agent.example.com/a2a',
    },
    capabilities: {
      actions: ['text-generation', 'analysis'],
      version: '1.0.0',
      skills: ['communication', 'data-processing'],
      domains: ['testing', 'automation'],
    } as AgentCapabilities,
  },
}

let apiKey: string
let agentId: string

test.describe('External Agent E2E Flow', () => {
  test.describe('Phase 1: Agent Registration', () => {
    test('should register a new external agent', async () => {
      const response = await fetch(`${BASE_URL}/api/agents/external/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testAgent),
      })

      expect(response.status).toBe(201)

      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.registration).toBeDefined()
      expect(data.registration.agentId).toBeDefined()
      expect(data.registration.name).toBe(testAgent.name)
      expect(data.registration.status).toBeDefined()
      expect(data.registration.trustLevel).toBeDefined()
      expect(data.apiKey).toBeDefined()
      expect(data.apiKey).toMatch(/^bab_live_[a-f0-9]{64}$/)

      // Store for subsequent tests
      apiKey = data.apiKey
      agentId = data.registration.agentId

      console.log(`Registered agent: ${agentId}`)
      console.log(`API Key: ${apiKey.substring(0, 20)}...`)
    })

    test('should reject duplicate registration', async () => {
      const response = await fetch(`${BASE_URL}/api/agents/external/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testAgent),
      })

      expect(response.status).toBe(409)

      const data = await response.json()

      expect(data.success).toBe(false)
      expect(data.error).toBe('Agent already registered')
    })

    test('should reject registration with invalid data', async () => {
      const invalidAgent = {
        ...testAgent,
        externalId: `invalid-${Date.now()}`,
        endpoint: 'not-a-url', // Invalid URL
      }

      const response = await fetch(`${BASE_URL}/api/agents/external/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidAgent),
      })

      expect(response.status).toBe(400)

      const data = await response.json()

      expect(data.success).toBe(false)
      expect(data.error).toBe('Validation error')
      expect(data.details).toBeDefined()
    })
  })

  test.describe('Phase 2: Agent Discovery', () => {
    test('should discover agents with valid API key', async () => {
      const response = await fetch(`${BASE_URL}/api/agents/external/discover?limit=10`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })

      expect(response.status).toBe(200)

      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.agents).toBeDefined()
      expect(Array.isArray(data.agents)).toBe(true)
      expect(data.pagination).toBeDefined()
      expect(data.pagination.limit).toBe(10)
      expect(data.pagination.offset).toBe(0)
    })

    test('should reject discovery without API key', async () => {
      const response = await fetch(`${BASE_URL}/api/agents/external/discover`, {
        method: 'GET',
      })

      expect(response.status).toBe(401)

      const data = await response.json()

      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized')
    })

    test('should filter agents by capabilities', async () => {
      const response = await fetch(
        `${BASE_URL}/api/agents/external/discover?capabilities=text-generation&limit=10`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        }
      )

      expect(response.status).toBe(200)

      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.agents).toBeDefined()

      // All returned agents should have text-generation capability
      data.agents.forEach((agent: any) => {
        expect(
          agent.capabilities?.actions?.includes('text-generation')
        ).toBe(true)
      })
    })

    test('should filter agents by trust level', async () => {
      const response = await fetch(
        `${BASE_URL}/api/agents/external/discover?minTrustLevel=1`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        }
      )

      expect(response.status).toBe(200)

      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.agents).toBeDefined()

      // All returned agents should have trust level >= 1
      data.agents.forEach((agent: any) => {
        expect(agent.trustLevel).toBeGreaterThanOrEqual(1)
      })
    })

    test('should support POST-based discovery with complex filters', async () => {
      const filter = {
        types: ['EXTERNAL', 'NPC'],
        statuses: ['ACTIVE'],
        minTrustLevel: 1,
        requiredCapabilities: ['text-generation'],
        matchMode: 'all',
        limit: 5,
        offset: 0,
      }

      const response = await fetch(`${BASE_URL}/api/agents/external/discover`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filter),
      })

      expect(response.status).toBe(200)

      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.agents).toBeDefined()
      expect(data.filters).toEqual(filter)
    })
  })

  test.describe('Phase 3: A2A Messaging', () => {
    test('should send A2A message with valid API key', async () => {
      const message = {
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {
          to: agentId, // Send message to self for testing
          parts: [
            {
              type: 'text',
              content: 'Hello from E2E test!',
            },
          ],
          contextId: `test-context-${Date.now()}`,
          metadata: {
            testRun: true,
            timestamp: Date.now(),
          },
        },
      }

      const response = await fetch(`${BASE_URL}/api/a2a/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      })

      expect(response.status).toBe(200)

      const data = await response.json()

      expect(data.jsonrpc).toBe('2.0')
      expect(data.id).toBe(1)
      expect(data.result).toBeDefined()
      expect(data.result.messageId).toBeDefined()
      expect(data.result.status).toBe('delivered')
    })

    test('should reject A2A message without API key', async () => {
      const message = {
        jsonrpc: '2.0',
        id: 2,
        method: 'message/send',
        params: {
          to: agentId,
          parts: [
            {
              type: 'text',
              content: 'Unauthorized message',
            },
          ],
        },
      }

      const response = await fetch(`${BASE_URL}/api/a2a/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      })

      expect(response.status).toBe(200) // JSON-RPC always returns 200

      const data = await response.json()

      expect(data.jsonrpc).toBe('2.0')
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe(-32000) // NOT_AUTHENTICATED
      expect(data.error.message).toContain('API key')
    })

    test('should handle invalid JSON-RPC request', async () => {
      const invalidMessage = {
        jsonrpc: '2.0',
        id: 3,
        method: 'message/send',
        // Missing required params
      }

      const response = await fetch(`${BASE_URL}/api/a2a/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidMessage),
      })

      expect(response.status).toBe(200)

      const data = await response.json()

      expect(data.jsonrpc).toBe('2.0')
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe(-32602) // INVALID_PARAMS
    })

    test('should return error for unknown method', async () => {
      const message = {
        jsonrpc: '2.0',
        id: 4,
        method: 'unknown/method',
        params: {},
      }

      const response = await fetch(`${BASE_URL}/api/a2a/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      })

      expect(response.status).toBe(200)

      const data = await response.json()

      expect(data.jsonrpc).toBe('2.0')
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe(-32601) // METHOD_NOT_FOUND
    })
  })

  test.describe('Phase 4: API Documentation', () => {
    test('should return A2A endpoint documentation', async () => {
      const response = await fetch(`${BASE_URL}/api/a2a/message`, {
        method: 'GET',
      })

      expect(response.status).toBe(200)

      const data = await response.json()

      expect(data.endpoint).toBe('/api/a2a/message')
      expect(data.protocol).toBe('A2A (Agent-to-Agent)')
      expect(data.version).toBeDefined()
      expect(data.methods).toBeDefined()
      expect(data.example).toBeDefined()
    })
  })
})
