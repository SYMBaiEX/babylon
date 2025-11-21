
import { describe, test, expect, mock } from 'bun:test'
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

// Mock prisma with a mutable state we can control in tests
let mockGame: any = null;

mock.module('@/lib/prisma', () => ({
  prisma: {
    game: {
      findFirst: async () => mockGame
    },
    user: {
      findUnique: async () => null
    }
  }
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

// Mock other services to avoid errors if they are imported
mock.module('@/lib/agents/runtime/AgentRuntimeManager', () => ({
  agentRuntimeManager: {
    getRuntime: async () => ({})
  }
}))

mock.module('@/lib/agents/services/AgentService', () => ({
  agentService: {
    deductPoints: async () => {},
    createLog: async () => {}
  }
}))

mock.module('@/lib/agents/autonomous', () => ({
  autonomousCoordinator: {
    executeAutonomousTick: async () => ({
      success: true,
      method: 'test',
      actionsExecuted: { trades: 0, posts: 0, comments: 0, messages: 0, groupMessages: 0 }
    })
  }
}))

mock.module('@/lib/services/cron-relay-service', () => ({
  relayCronToStaging: async () => ({ forwarded: false })
}))

// Import the route handler
import { POST } from '@/app/api/cron/agent-tick/route'

describe('Agent Tick Cron - DB State', () => {
  
  test('should be skipped when no continuous game exists', async () => {
    mockGame = null;
    
    const req = new NextRequest('http://localhost/api/cron/agent-tick', { method: 'POST' })
    const res = await POST(req)
    const data = await res.json()
    
    expect(data.success).toBe(true)
    expect(data.skipped).toBe(true)
    expect(data.reason).toBe('No continuous game found')
  })

  test('should be paused when game.isRunning is false', async () => {
    mockGame = {
      id: 'game-123',
      isContinuous: true,
      isRunning: false
    }
    
    const req = new NextRequest('http://localhost/api/cron/agent-tick', { method: 'POST' })
    const res = await POST(req)
    const data = await res.json()
    
    expect(data.success).toBe(true)
    expect(data.skipped).toBe(true)
    expect(data.reason).toBe('Game is paused')
    expect(data.gameId).toBe('game-123')
  })

  test('should proceed when game.isRunning is true', async () => {
    mockGame = {
      id: 'game-123',
      isContinuous: true,
      isRunning: true
    }
    
    const req = new NextRequest('http://localhost/api/cron/agent-tick', { method: 'POST' })
    const res = await POST(req)
    const data = await res.json()
    
    expect(data.skipped).toBeUndefined()
    expect(data.success).toBe(true)
    // Since we mocked discoverAgents to return [], it should handle 0 agents
    expect(data.processed).toBe(0)
  })
})

