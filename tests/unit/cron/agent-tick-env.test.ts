
import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test'
import { NextRequest } from 'next/server'

// Mock dependencies
mock.module('@/lib/logger', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  }
}))

mock.module('@/lib/prisma', () => ({
  prisma: {}
}))

mock.module('@/lib/services/agent-registry.service', () => ({
  agentRegistry: {
    discoverAgents: async () => []
  }
}))

mock.module('@/lib/services/agent-lock-service', () => ({
  acquireAgentLock: async () => true,
  releaseAgentLock: async () => {}
}))

// Import the route handler
import { POST } from '@/app/api/cron/agent-tick/route'

describe('Agent Tick Cron - GAME_START Env Var', () => {
  const originalEnv = process.env

  beforeAll(() => {
    // Save original env
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('should be paused when GAME_START is unset', async () => {
    delete process.env.GAME_START
    
    const req = new NextRequest('http://localhost/api/cron/agent-tick', { method: 'POST' })
    const res = await POST(req)
    const data = await res.json()
    
    expect(data.success).toBe(true)
    expect(data.skipped).toBe(true)
    expect(data.reason).toBe('Agents paused (GAME_START env var)')
  })

  test('should be paused when GAME_START is false', async () => {
    process.env.GAME_START = 'false'
    
    const req = new NextRequest('http://localhost/api/cron/agent-tick', { method: 'POST' })
    const res = await POST(req)
    const data = await res.json()
    
    expect(data.success).toBe(true)
    expect(data.skipped).toBe(true)
    expect(data.reason).toBe('Agents paused (GAME_START env var)')
  })

  test('should proceed when GAME_START is start', async () => {
    process.env.GAME_START = 'start'
    
    const req = new NextRequest('http://localhost/api/cron/agent-tick', { method: 'POST' })
    const res = await POST(req)
    const data = await res.json()
    
    // Should NOT be skipped due to env var
    if (data.skipped) {
        expect(data.reason).not.toBe('Agents paused (GAME_START env var)')
    } else {
        expect(data.success).toBe(true)
        // Since we mocked discoverAgents to return [], it should handle 0 agents
        expect(data.processed).toBe(0)
    }
  })
  
  test('should proceed when GAME_START is running', async () => {
    process.env.GAME_START = 'running'
    
    const req = new NextRequest('http://localhost/api/cron/agent-tick', { method: 'POST' })
    const res = await POST(req)
    const data = await res.json()
    
    if (data.skipped) {
        expect(data.reason).not.toBe('Agents paused (GAME_START env var)')
    } else {
        expect(data.success).toBe(true)
        expect(data.processed).toBe(0)
    }
  })
})

