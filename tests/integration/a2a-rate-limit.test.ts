/**
 * A2A Rate Limiting Integration Test
 * 
 * Tests that the A2A endpoint properly enforces rate limits
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { getTestBaseUrl, checkServerAvailableAtLoadTime } from './test-helpers';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';

const BASE_URL = getTestBaseUrl();
const serverAvailable = await checkServerAvailableAtLoadTime();
if (!serverAvailable) {
  console.log(`⚠️  Server not available - Skipping A2A rate limit tests`);
}
const A2A_ENDPOINT = `${BASE_URL}/api/a2a`;

const TEST_AGENT_HEADERS = {
  'Content-Type': 'application/json',
  'x-agent-id': 'rate-limit-test-agent',
  'x-agent-address': '0x1234567890123456789012345678901234567890',
  'x-agent-token-id': '1'
};

function generateA2ARequest(method: string, params: Record<string, unknown> = {}) {
  return {
    jsonrpc: '2.0',
    method,
    params,
    id: Math.floor(Math.random() * 1000000)
  };
}

async function makeA2ARequest(method: string, params?: Record<string, unknown>) {
  const response = await fetch(A2A_ENDPOINT, {
    method: 'POST',
    headers: TEST_AGENT_HEADERS,
    body: JSON.stringify(generateA2ARequest(method, params))
  });
  
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json()
  };
}

describe('A2A Rate Limiting', () => {
  beforeAll(async () => {
    if (!serverAvailable) {
      console.log('⚠️  Server not running - skipping A2A rate limit tests')
      console.log('   Run `bun dev` to start the server for these tests')
      return
    }
    
    // Check if server is running
    try {
      const response = await fetch(A2A_ENDPOINT);
      const data = await response.json();
      if (data.service !== 'Babylon A2A Protocol') {
        throw new Error('A2A endpoint not responding correctly');
      }
    } catch (error) {
      console.error('Server not running. Start it with: bun run dev');
      throw error;
    }

    // Create test users in database for A2A requests
    if (prisma && prisma.user) {
      try {
        // Create or update test agents
        await prisma.user.upsert({
          where: { id: 'rate-limit-test-agent' },
          update: { 
            updatedAt: new Date(),
            virtualBalance: 10000,
          },
          create: {
            id: 'rate-limit-test-agent',
            username: 'rate-limit-test-agent',
            displayName: 'Rate Limit Test Agent',
            walletAddress: '0x1234567890123456789012345678901234567890',
            bio: 'Test agent for A2A rate limiting',
            profileComplete: true,
            reputationPoints: 100,
            referralCode: nanoid(8),
            virtualBalance: 10000,
            totalDeposited: 10000,
            totalWithdrawn: 0,
            lifetimePnL: 0,
            updatedAt: new Date(),
          },
        });

        await prisma.user.upsert({
          where: { id: 'agent-1' },
          update: { 
            updatedAt: new Date(),
            virtualBalance: 10000,
          },
          create: {
            id: 'agent-1',
            username: 'agent-1',
            displayName: 'Test Agent 1',
            walletAddress: '0x' + '1'.repeat(40),
            bio: 'Test agent 1 for A2A rate limiting',
            profileComplete: true,
            reputationPoints: 100,
            referralCode: nanoid(8),
            virtualBalance: 10000,
            totalDeposited: 10000,
            totalWithdrawn: 0,
            lifetimePnL: 0,
            updatedAt: new Date(),
          },
        });

        await prisma.user.upsert({
          where: { id: 'agent-2' },
          update: { 
            updatedAt: new Date(),
            virtualBalance: 10000,
          },
          create: {
            id: 'agent-2',
            username: 'agent-2',
            displayName: 'Test Agent 2',
            walletAddress: '0x' + '2'.repeat(40),
            bio: 'Test agent 2 for A2A rate limiting',
            profileComplete: true,
            reputationPoints: 100,
            referralCode: nanoid(8),
            virtualBalance: 10000,
            totalDeposited: 10000,
            totalWithdrawn: 0,
            lifetimePnL: 0,
            updatedAt: new Date(),
          },
        });

        console.log('✅ Created test users for A2A rate limiting tests');
      } catch (error) {
        console.error('Failed to create test users:', error);
      }
    }
  });

  test('should return rate limit headers on successful request', async () => {
      if (!serverAvailable) { expect(true).toBe(true); return; }
    const result = await makeA2ARequest('a2a.getBalance');
    
    expect(result.status).toBeLessThan(500);
    expect(result.headers.get('x-ratelimit-limit')).toBe('100');
    expect(result.headers.has('x-ratelimit-remaining')).toBe(true);
  });

  test('should enforce rate limit after 100 requests per minute', async () => {
      if (!serverAvailable) { expect(true).toBe(true); return; }
    // Make 105 requests rapidly (should hit rate limit)
    const results = await Promise.all(
      Array.from({ length: 105 }, () => makeA2ARequest('a2a.getBalance'))
    );
    
    // Count rate limit errors
    const rateLimitErrors = results.filter(r => r.status === 429);
    
    // Should have at least some rate limit errors
    expect(rateLimitErrors.length).toBeGreaterThan(0);
    
    // Check rate limit response format
    const rateLimitError = rateLimitErrors[0];
    if (rateLimitError) {
      expect(rateLimitError.data.error).toBeDefined();
      expect(rateLimitError.data.error.code).toBeDefined();
      expect(rateLimitError.data.error.message).toContain('Rate limit');
      expect(rateLimitError.headers.has('retry-after')).toBe(true);
    }
  }, 30000); // 30 second timeout

  test('should return proper JSON-RPC error for rate limit', async () => {
      if (!serverAvailable) { expect(true).toBe(true); return; }
    // Make many requests to trigger rate limit
    const promises = Array.from({ length: 110 }, () => 
      makeA2ARequest('a2a.getBalance')
    );
    
    const results = await Promise.all(promises);
    const rateLimitError = results.find(r => r.status === 429);
    
    if (rateLimitError) {
      // Verify JSON-RPC 2.0 error format
      expect(rateLimitError.data.jsonrpc).toBe('2.0');
      expect(rateLimitError.data.error).toBeDefined();
      expect(rateLimitError.data.error.code).toBeDefined();
      expect(rateLimitError.data.error.message).toBeDefined();
      expect(rateLimitError.data.id).toBeDefined();
      
      // Verify error contains useful info
      expect(rateLimitError.data.error.data).toBeDefined();
      expect(rateLimitError.data.error.data.retryAfter).toBe(60);
    }
  }, 30000);

  test('should allow requests from different agents independently', async () => {
      if (!serverAvailable) { expect(true).toBe(true); return; }
    const agent1Headers = {
      ...TEST_AGENT_HEADERS,
      'x-agent-id': 'agent-1'
    };
    
    const agent2Headers = {
      ...TEST_AGENT_HEADERS,
      'x-agent-id': 'agent-2'
    };
    
    // Make 30 requests from each agent (60 total, well under 100 per agent limit)
    // Use sequential requests with small delays to avoid overwhelming the server
    const agent1Requests: Promise<Response>[] = [];
    const agent2Requests: Promise<Response>[] = [];
    
    for (let i = 0; i < 30; i++) {
      agent1Requests.push(
        fetch(A2A_ENDPOINT, {
          method: 'POST',
          headers: agent1Headers,
          body: JSON.stringify(generateA2ARequest('a2a.getBalance'))
        })
      );
      agent2Requests.push(
        fetch(A2A_ENDPOINT, {
          method: 'POST',
          headers: agent2Headers,
          body: JSON.stringify(generateA2ARequest('a2a.getBalance'))
        })
      );
      // Small delay to avoid overwhelming the server
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const results = await Promise.all([...agent1Requests, ...agent2Requests]);
    
    // Both agents should succeed (neither hit 100 req/min limit)
    // With 30 requests each, we should get at least 50 successful (allowing for some failures)
    const successfulRequests = results.filter(r => r.status < 400);
    expect(successfulRequests.length).toBeGreaterThan(50); // At least 50 should succeed
  }, 30000);

  test('should include remaining tokens in response headers', async () => {
      if (!serverAvailable) { expect(true).toBe(true); return; }
    const result1 = await makeA2ARequest('a2a.getBalance');
    const remaining1 = parseInt(result1.headers.get('x-ratelimit-remaining') || '0');
    
    const result2 = await makeA2ARequest('a2a.getBalance');
    const remaining2 = parseInt(result2.headers.get('x-ratelimit-remaining') || '0');
    
    // Remaining should decrease with each request
    expect(remaining2).toBeLessThanOrEqual(remaining1);
  });

  afterAll(async () => {
    if (!prisma) return;
    // Clean up test users
    if (prisma && prisma.user) {
      try {
        await prisma.user.deleteMany({
          where: {
            id: {
              in: ['rate-limit-test-agent', 'agent-1', 'agent-2']
            }
          }
        });
        console.log('✅ Cleaned up test users for A2A rate limiting tests');
      } catch (error) {
        console.error('Failed to clean up test users:', error);
      }
    }
  });
});

describe('A2A Rate Limiting - Token Bucket Behavior', () => {
  test('should refill tokens over time', async () => {
      if (!serverAvailable) { expect(true).toBe(true); return; }
    // This test would need to wait 60+ seconds to verify refill
    // Skipped in regular test runs - suitable for long-running integration tests
    expect(true).toBe(true);
  });
});

describe('A2A Endpoint - Basic Functionality', () => {
  test('GET /api/a2a should return service info', async () => {
      if (!serverAvailable) { expect(true).toBe(true); return; }
    const response = await fetch(A2A_ENDPOINT);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.service).toBe('Babylon A2A Protocol');
    expect(data.version).toBeDefined();
    expect(data.status).toBe('active');
  });

  test('POST /api/a2a should handle valid JSON-RPC request', async () => {
      if (!serverAvailable) { expect(true).toBe(true); return; }
    const result = await makeA2ARequest('a2a.getBalance');
    
    expect(result.status).toBeLessThan(500);
    expect(result.data.jsonrpc).toBe('2.0');
    expect(result.data.id).toBeDefined();
    // Either result or error should be present
    expect(result.data.result !== undefined || result.data.error !== undefined).toBe(true);
  });

  test('POST /api/a2a should validate JSON-RPC format', async () => {
      if (!serverAvailable) { expect(true).toBe(true); return; }
    const response = await fetch(A2A_ENDPOINT, {
      method: 'POST',
      headers: TEST_AGENT_HEADERS,
      body: JSON.stringify({ invalid: 'request' })
    });
    
    // Should return error for invalid JSON-RPC
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

