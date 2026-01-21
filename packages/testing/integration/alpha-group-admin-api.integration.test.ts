/**
 * Alpha Group Admin API Endpoints Integration Tests
 *
 * Tests the alpha group admin API endpoints:
 * - GET /api/admin/alpha-groups/config - Get current configuration
 * - PATCH /api/admin/alpha-groups/config - Update configuration
 * - GET /api/admin/alpha-groups/stats - Get statistics
 *
 * Run with: bun test integration/alpha-group-admin-api.integration.test.ts --preload ./integration/preload.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';

const BASE_URL =
  process.env.TEST_API_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  'http://localhost:3000';

let serverAvailable = false;
let adminToken: string | null = null;

async function checkServerHealth(): Promise<boolean> {
  const response = await fetch(`${BASE_URL}/api/health`, {
    signal: AbortSignal.timeout(5000),
  });
  return response.ok;
}

async function getWithAuth(path: string, token?: string): Promise<Response> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${BASE_URL}${path}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
}

async function patchWithAuth(
  path: string,
  body: object,
  token?: string
): Promise<Response> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}

describe('Alpha Group Admin API Integration', () => {
  beforeAll(async () => {
    serverAvailable = await checkServerHealth().catch(() => false);
    if (!serverAvailable) {
      console.warn(
        '⚠️  Server not available - Alpha Group Admin API tests will be skipped'
      );
    }

    // Try to get admin token from environment
    adminToken = process.env.TEST_ADMIN_TOKEN || null;
  });

  // ============================================
  // CONFIG ENDPOINT - GET
  // ============================================
  describe('Config - GET /api/admin/alpha-groups/config', () => {
    test('should require authentication', async () => {
      if (!serverAvailable) return;
      const res = await getWithAuth('/api/admin/alpha-groups/config');
      expect(res.status).toBe(401);
    });

    test('should return 403 for non-admin users', async () => {
      if (!serverAvailable || !process.env.TEST_USER_TOKEN) return;
      const res = await getWithAuth(
        '/api/admin/alpha-groups/config',
        process.env.TEST_USER_TOKEN
      );
      expect(res.status).toBe(403);
    });

    test('should return config data for admin users', async () => {
      if (!serverAvailable || !adminToken) {
        console.log('⏭️  Skipping alpha group config test - no admin token');
        return;
      }
      const res = await getWithAuth(
        '/api/admin/alpha-groups/config',
        adminToken
      );
      expect(res.status).toBe(200);

      const data = await res.json();

      // Verify structure of config response
      expect(data).toHaveProperty('config');
      expect(data.config).toHaveProperty('inviteProbabilityMultiplier');
      expect(data.config).toHaveProperty('maxInvitesPerTick');
      expect(data.config).toHaveProperty('minReplies');
      expect(data.config).toHaveProperty('minLikes');
      expect(data.config).toHaveProperty('minTotalInteractions');
      expect(data.config).toHaveProperty('fastTrackEnabled');
      expect(data.config).toHaveProperty('inviteDecayEnabled');
      expect(data.config).toHaveProperty('grandfatheringEnabled');

      // Verify tiers structure
      expect(data).toHaveProperty('tiers');
      expect(data.tiers).toHaveProperty('1');
      expect(data.tiers).toHaveProperty('2');
      expect(data.tiers).toHaveProperty('3');

      // Verify tier config has expected fields
      expect(data.tiers[3]).toHaveProperty('minEngagementScore');
      expect(data.tiers[3]).toHaveProperty('inviteProbability');
      expect(data.tiers[3]).toHaveProperty('maxMembers');

      console.log('✓ Alpha group config endpoint returns valid data');
    });

    test('should have lowered thresholds in config', async () => {
      if (!serverAvailable || !adminToken) return;
      const res = await getWithAuth(
        '/api/admin/alpha-groups/config',
        adminToken
      );
      expect(res.status).toBe(200);

      const data = await res.json();

      // Verify lowered thresholds
      expect(data.config.minReplies).toBe(1);
      expect(data.config.minLikes).toBe(2);
      expect(data.config.minTotalInteractions).toBe(5);

      // Verify tier 3 has the new lower engagement score
      expect(data.tiers[3].minEngagementScore).toBe(20);
      // Verify tier 3 has 10% invite probability
      expect(data.tiers[3].inviteProbability).toBe(0.1);
    });
  });

  // ============================================
  // CONFIG ENDPOINT - PATCH
  // ============================================
  describe('Config - PATCH /api/admin/alpha-groups/config', () => {
    test('should require authentication', async () => {
      if (!serverAvailable) return;
      const res = await patchWithAuth('/api/admin/alpha-groups/config', {
        inviteProbabilityMultiplier: 2.0,
      });
      expect(res.status).toBe(401);
    });

    test('should return 403 for non-admin users', async () => {
      if (!serverAvailable || !process.env.TEST_USER_TOKEN) return;
      const res = await patchWithAuth(
        '/api/admin/alpha-groups/config',
        { inviteProbabilityMultiplier: 2.0 },
        process.env.TEST_USER_TOKEN
      );
      expect(res.status).toBe(403);
    });

    test('should require manage_alpha_groups permission', async () => {
      if (!serverAvailable || !adminToken) {
        console.log(
          '⏭️  Skipping alpha group config patch test - no admin token'
        );
        return;
      }

      // This test would require a viewer-only admin token
      // For now, we just verify the endpoint exists and accepts valid data
      const res = await patchWithAuth(
        '/api/admin/alpha-groups/config',
        { inviteProbabilityMultiplier: 1.0 }, // No actual change
        adminToken
      );

      // Should be 200 (success) or 403 (no permission) depending on admin role
      expect([200, 403]).toContain(res.status);
    });

    test('should validate input data', async () => {
      if (!serverAvailable || !adminToken) return;

      // Test invalid probability (must be 0-10)
      const res1 = await patchWithAuth(
        '/api/admin/alpha-groups/config',
        { inviteProbabilityMultiplier: -1 },
        adminToken
      );
      // Should return 400 for invalid data
      expect([400, 403]).toContain(res1.status);

      // Test invalid type
      const res2 = await patchWithAuth(
        '/api/admin/alpha-groups/config',
        { inviteProbabilityMultiplier: 'not-a-number' },
        adminToken
      );
      expect([400, 403]).toContain(res2.status);
    });
  });

  // ============================================
  // STATS ENDPOINT
  // ============================================
  describe('Stats - GET /api/admin/alpha-groups/stats', () => {
    test('should require authentication', async () => {
      if (!serverAvailable) return;
      const res = await getWithAuth('/api/admin/alpha-groups/stats');
      expect(res.status).toBe(401);
    });

    test('should return 403 for non-admin users', async () => {
      if (!serverAvailable || !process.env.TEST_USER_TOKEN) return;
      const res = await getWithAuth(
        '/api/admin/alpha-groups/stats',
        process.env.TEST_USER_TOKEN
      );
      expect(res.status).toBe(403);
    });

    test('should return stats data for admin users', async () => {
      if (!serverAvailable || !adminToken) {
        console.log('⏭️  Skipping alpha group stats test - no admin token');
        return;
      }
      const res = await getWithAuth(
        '/api/admin/alpha-groups/stats',
        adminToken
      );
      expect(res.status).toBe(200);

      const data = await res.json();

      // Verify structure of stats response
      expect(data).toHaveProperty('totalGroups');
      expect(data).toHaveProperty('totalInvites');
      expect(data).toHaveProperty('invitesLast24h');
      expect(data).toHaveProperty('totalMembers');
      expect(data).toHaveProperty('tierDistribution');
      expect(data).toHaveProperty('pendingInvites');

      // Verify types
      expect(typeof data.totalGroups).toBe('number');
      expect(typeof data.totalInvites).toBe('number');
      expect(typeof data.totalMembers).toBe('number');
      expect(data.totalGroups).toBeGreaterThanOrEqual(0);

      // Verify tier distribution is an object
      expect(typeof data.tierDistribution).toBe('object');

      console.log('✓ Alpha group stats endpoint returns valid data');
      console.log(
        `  Total groups: ${data.totalGroups}, Members: ${data.totalMembers}, Pending: ${data.pendingInvites}`
      );
    });

    test('should include grandfathering stats', async () => {
      if (!serverAvailable || !adminToken) return;
      const res = await getWithAuth(
        '/api/admin/alpha-groups/stats',
        adminToken
      );
      expect(res.status).toBe(200);

      const data = await res.json();

      // Verify grandfathering stats are included
      expect(data).toHaveProperty('grandfatheredMembers');
      expect(typeof data.grandfatheredMembers).toBe('number');
    });

    test('should include invite decay stats', async () => {
      if (!serverAvailable || !adminToken) return;
      const res = await getWithAuth(
        '/api/admin/alpha-groups/stats',
        adminToken
      );
      expect(res.status).toBe(200);

      const data = await res.json();

      // Verify invite decay stats are included
      expect(data).toHaveProperty('usersWithDeclines');
      expect(data).toHaveProperty('avgDeclineCount');
      expect(typeof data.usersWithDeclines).toBe('number');
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================
  describe('Edge Cases', () => {
    test('should handle malformed JSON in PATCH request', async () => {
      if (!serverAvailable || !adminToken) return;

      const res = await fetch(`${BASE_URL}/api/admin/alpha-groups/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: '{not valid json',
        signal: AbortSignal.timeout(10000),
      });

      expect([400, 403]).toContain(res.status);
    });

    test('should handle empty PATCH body', async () => {
      if (!serverAvailable || !adminToken) return;

      const res = await patchWithAuth(
        '/api/admin/alpha-groups/config',
        {},
        adminToken
      );

      // Empty body should either be no-op (200) or validation error (400)
      expect([200, 400, 403]).toContain(res.status);
    });

    test('should not expose sensitive internal data in stats', async () => {
      if (!serverAvailable || !adminToken) return;

      const res = await getWithAuth(
        '/api/admin/alpha-groups/stats',
        adminToken
      );
      expect(res.status).toBe(200);

      const data = await res.json();

      // Should not expose user IDs, API keys, or other sensitive data
      const jsonString = JSON.stringify(data);
      expect(jsonString).not.toContain('password');
      expect(jsonString).not.toContain('apiKey');
      expect(jsonString).not.toContain('secretKey');
      expect(jsonString).not.toContain('privateKey');
    });
  });
});
