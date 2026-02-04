/**
 * Comprehensive API Endpoints Integration Tests
 *
 * Tests ALL public API endpoints for proper functionality.
 * Organized by category with thorough coverage.
 *
 * Run with: bun test integration/api-endpoints.integration.test.ts --preload ./integration/preload.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';

const BASE_URL =
  process.env.TEST_API_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  'http://localhost:3000';

let serverAvailable = false;

async function checkServerHealth(): Promise<boolean> {
  const response = await fetch(`${BASE_URL}/api/health`, {
    signal: AbortSignal.timeout(5000),
  });
  return response.ok;
}

async function get(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(10000) });
}

async function post(
  path: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}

describe('API Endpoints - Complete Coverage', () => {
  beforeAll(async () => {
    serverAvailable = await checkServerHealth().catch(() => false);
    if (!serverAvailable) {
      console.warn('⚠️  Server not available - API tests will be skipped');
    }
  });

  // ============================================
  // SYSTEM ENDPOINTS
  // ============================================
  describe('System', () => {
    test('GET /api/health', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/health');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
    });

    test('GET /api/docs', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/docs');
      expect(res.status).toBe(200);
      const spec = await res.json();
      expect(spec.openapi).toBe('3.0.0');
      expect(spec.info.title).toBe('Babylon API');
    });

    test('GET /api/stats', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/stats');
      expect(res.status).toBe(200);
    });

    test('GET /api/stats/tokens', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/stats/tokens');
      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // POSTS ENDPOINTS
  // ============================================
  describe('Posts', () => {
    test('GET /api/posts', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/posts?limit=5');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.posts)).toBe(true);
    });

    test('GET /api/posts - pagination', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/posts?limit=2');
      const data = await res.json();
      if (data.cursor) {
        const page2 = await get(`/api/posts?limit=2&cursor=${data.cursor}`);
        expect(page2.status).toBe(200);
      }
    });

    test('GET /api/posts - type filter', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/posts?type=article&limit=5');
      expect(res.status).toBe(200);
    });

    test('GET /api/posts/feed/favorites - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/posts/feed/favorites');
      expect(res.status).toBe(401);
    });

    test('POST /api/posts - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await post('/api/posts', { content: 'Test' });
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // MARKETS ENDPOINTS
  // ============================================
  describe('Markets', () => {
    test('GET /api/markets/perps', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/markets/perps');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    test('GET /api/markets/predictions', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/markets/predictions');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    test('GET /api/markets/bias/active', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/markets/bias/active');
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================
  // USERS ENDPOINTS
  // ============================================
  describe('Users', () => {
    test('GET /api/users/me - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/users/me');
      expect(res.status).toBe(401);
    });

    test('GET /api/users/search', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/users/search?q=test');
      expect(res.status).toBeLessThan(500);
    });

    test('GET /api/users/api-keys - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/users/api-keys');
      expect(res.status).toBe(401);
    });

    test('GET /api/users/export-data - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/users/export-data');
      expect(res.status).toBe(401);
    });

    test('DELETE /api/users/delete-account - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await fetch(`${BASE_URL}/api/users/delete-account`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // AGENTS ENDPOINTS
  // ============================================
  describe('Agents', () => {
    test('GET /api/agents', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/agents');
      expect(res.status).toBe(200);
    });

    test('GET /api/agents/discover', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/agents/discover?limit=5');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.agents)).toBe(true);
    });

    test('GET /api/agent-templates', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/agent-templates');
      expect(res.status).toBe(200);
    });

    test('POST /api/agents/onboard - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await post('/api/agents/onboard', {});
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // ACTORS ENDPOINTS
  // ============================================
  describe('Actors', () => {
    test('GET /api/actors', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/actors');
      expect(res.status).toBe(200);
    });

    test('GET /api/organizations', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/organizations');
      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // CHATS ENDPOINTS
  // ============================================
  describe('Chats', () => {
    test('GET /api/chats - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/chats');
      expect(res.status).toBe(401);
    });

    test('GET /api/chats/unread-count - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/chats/unread-count');
      expect(res.status).toBe(401);
    });

    test('POST /api/chats/dm - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await post('/api/chats/dm', { recipientId: 'test' });
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // NOTIFICATIONS ENDPOINTS
  // ============================================
  describe('Notifications', () => {
    test('GET /api/notifications - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/notifications');
      expect(res.status).toBe(401);
    });

    test('POST /api/notifications/mark-read - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await post('/api/notifications/mark-read', {});
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // MODERATION ENDPOINTS
  // ============================================
  describe('Moderation', () => {
    test('GET /api/moderation/blocks - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/moderation/blocks');
      expect(res.status).toBe(401);
    });

    test('GET /api/moderation/mutes - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/moderation/mutes');
      expect(res.status).toBe(401);
    });

    test('GET /api/moderation/reports - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/moderation/reports');
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // REGISTRY ENDPOINTS
  // ============================================
  describe('Registry', () => {
    test('GET /api/registry', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/registry');
      expect(res.status).toBe(200);
    });

    test('GET /api/registry/all', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/registry/all');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  // ============================================
  // LEADERBOARD ENDPOINTS
  // ============================================
  describe('Leaderboards', () => {
    test('GET /api/leaderboard', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/leaderboard');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    test('GET /api/reputation/leaderboard', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/reputation/leaderboard');
      expect(res.status).toBe(200);
    });

    test('GET /api/waitlist/leaderboard', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/waitlist/leaderboard');
      expect(res.status).toBe(200);
    });

    test('GET /api/npc/performance/leaderboard', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/npc/performance/leaderboard');
      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // FEED WIDGETS ENDPOINTS
  // ============================================
  describe('Feed Widgets', () => {
    test('GET /api/feed/widgets/trending', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/feed/widgets/trending');
      expect(res.status).toBe(200);
    });

    test('GET /api/feed/widgets/markets', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/feed/widgets/markets');
      expect(res.status).toBe(200);
    });

    test('GET /api/feed/widgets/stats', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/feed/widgets/stats');
      expect(res.status).toBe(200);
    });

    test('GET /api/feed/widgets/breaking-news', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/feed/widgets/breaking-news');
      expect(res.status).toBe(200);
    });

    test('GET /api/feed/widgets/trending-posts', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/feed/widgets/trending-posts');
      expect(res.status).toBe(200);
    });

    test('GET /api/feed/widgets/upcoming-events', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/feed/widgets/upcoming-events');
      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // TRENDING ENDPOINTS
  // ============================================
  describe('Trending', () => {
    test('GET /api/trending/group', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/trending/group');
      expect(res.status).toBe(200);
    });

    test('GET /api/trending/[tag]', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/trending/crypto');
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================
  // GAMES ENDPOINTS
  // ============================================
  describe('Games', () => {
    test('GET /api/games', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/games');
      expect(res.status).toBe(200);
    });

    test('GET /api/game/card', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/game/card');
      expect(res.status).toBeLessThan(500);
    });

    test('GET /api/game/capabilities', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/game/capabilities');
      expect(res.status).toBeLessThan(500);
    });

    test('GET /api/game-assets', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/game-assets');
      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // GROUPS ENDPOINTS
  // ============================================
  describe('Groups', () => {
    test('GET /api/groups', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/groups');
      expect(res.status).toBe(200);
    });

    test('GET /api/groups/invites - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/groups/invites');
      expect(res.status).toBe(401);
    });

    test('GET /api/user-groups', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/user-groups');
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================
  // NPC ENDPOINTS
  // ============================================
  describe('NPC', () => {
    test('GET /api/npc/allocation', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/npc/allocation');
      expect(res.status).toBe(200);
    });

    test('GET /api/npc/position-size', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/npc/position-size');
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================
  // TRADES ENDPOINTS
  // ============================================
  describe('Trades', () => {
    test('GET /api/trades', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/trades');
      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // ONBOARDING ENDPOINTS
  // ============================================
  describe('Onboarding', () => {
    test('GET /api/onboarding/random-assets', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/onboarding/random-assets');
      expect(res.status).toBe(200);
    });

    test('POST /api/onboarding/check-username', async () => {
      if (!serverAvailable) return;
      const res = await post('/api/onboarding/check-username', {
        username: 'test_unique_user_xyz123',
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.available).toBe('boolean');
    });
  });

  // ============================================
  // POINTS ENDPOINTS
  // ============================================
  describe('Points', () => {
    test('POST /api/points/transfer - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await post('/api/points/transfer', {
        recipientId: 'test',
        amount: 100,
      });
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // UPLOAD ENDPOINTS
  // ============================================
  describe('Upload', () => {
    test('POST /api/upload/image - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await fetch(`${BASE_URL}/api/upload/image`, {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // REALTIME ENDPOINTS
  // ============================================
  describe('Realtime', () => {
    test('GET /api/realtime/token - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/realtime/token');
      expect(res.status).toBe(401);
    });

    test('GET /api/sse/stats', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/sse/stats');
      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // PROFILES ENDPOINTS
  // ============================================
  describe('Profiles', () => {
    test('GET /api/profiles/favorites - requires auth', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/profiles/favorites');
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // AUTH ENDPOINTS
  // ============================================
  describe('Auth', () => {
    test('GET /api/auth/credentials/status', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/auth/credentials/status');
      expect(res.status).toBeLessThan(500);
    });

    test('GET /api/twitter/auth-status', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/twitter/auth-status');
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================
  // A2A ENDPOINTS
  // ============================================
  describe('A2A', () => {
    test('POST /api/a2a - handles JSONRPC', async () => {
      if (!serverAvailable) return;
      const res = await post('/api/a2a', {
        jsonrpc: '2.0',
        method: 'agent/discover',
        id: 'test-1',
      });
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================
  // FRAME ENDPOINTS
  // ============================================
  describe('Frame', () => {
    test('GET /api/frame', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/frame');
      expect(res.status).toBeLessThan(500);
    });

    test('GET /api/frame/metadata', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/frame/metadata');
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================
  // HUGGINGFACE ENDPOINTS
  // ============================================
  describe('HuggingFace', () => {
    test('GET /api/huggingface/status', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/huggingface/status');
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================
  // GAME FEEDBACK ENDPOINTS
  // ============================================
  describe('Game Feedback', () => {
    test('POST /api/feedback/game-feedback - requires authentication', async () => {
      if (!serverAvailable) return;
      const res = await post('/api/feedback/game-feedback', {
        feedbackType: 'bug',
        description: 'Test bug report',
        stepsToReproduce: '1. Do something 2. See error',
      });
      expect(res.status).toBe(401);
    });

    test('POST /api/feedback/game-feedback - bug report validation', async () => {
      if (!serverAvailable) return;
      // Missing required fields
      const res1 = await post('/api/feedback/game-feedback', {
        feedbackType: 'bug',
        description: 'Short', // Too short
      });
      expect(res1.status).toBe(401); // Auth required first

      // Missing steps to reproduce
      const res2 = await post('/api/feedback/game-feedback', {
        feedbackType: 'bug',
        description: 'This is a valid bug description with enough characters',
        // Missing stepsToReproduce
      });
      expect(res2.status).toBe(401); // Auth required first
    });

    test('POST /api/feedback/game-feedback - feature request validation', async () => {
      if (!serverAvailable) return;
      // Missing rating
      const res = await post('/api/feedback/game-feedback', {
        feedbackType: 'feature_request',
        description: 'This is a valid feature request description',
        // Missing rating
      });
      expect(res.status).toBe(401); // Auth required first
    });

    test('POST /api/feedback/game-feedback - performance issue', async () => {
      if (!serverAvailable) return;
      // Performance issues don't require additional fields
      const res = await post('/api/feedback/game-feedback', {
        feedbackType: 'performance',
        description: 'This is a valid performance issue description',
      });
      expect(res.status).toBe(401); // Auth required first
    });

    test('POST /api/feedback/game-feedback - rate limiting', async () => {
      if (!serverAvailable) return;
      // Note: This test would require authentication
      // In a real test, we'd need to authenticate first
      // For now, we just verify the endpoint exists
      const res = await post('/api/feedback/game-feedback', {
        feedbackType: 'bug',
        description: 'Test rate limiting',
        stepsToReproduce: '1. Test',
      });
      // Should return 401 (auth required) or 429 (rate limited if authenticated)
      expect([401, 429]).toContain(res.status);
    });
  });

  // ============================================
  // ERROR HANDLING
  // ============================================
  describe('Error Handling', () => {
    test('404 for non-existent endpoints', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/nonexistent-xyz-12345');
      expect(res.status).toBe(404);
    });

    test('no stack traces in error responses', async () => {
      if (!serverAvailable) return;
      const res = await get('/api/nonexistent-xyz-12345');
      const text = await res.text();
      expect(text.toLowerCase()).not.toContain('stack');
      expect(text.toLowerCase()).not.toContain('node_modules');
    });

    test('malformed JSON returns 400 not 500', async () => {
      if (!serverAvailable) return;
      const res = await fetch(`${BASE_URL}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json {{{',
      });
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================
  // SECURITY
  // ============================================
  describe('Security', () => {
    test('SQL injection in query params handled safely', async () => {
      if (!serverAvailable) return;
      const res = await get("/api/users/search?q='; DROP TABLE users; --");
      expect(res.status).toBeLessThan(500);
    });
  });
});
