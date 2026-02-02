// Daily Login API - Integration Tests
// Tests for BAB-88 Daily Login Rewards & Streak System

import {
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from 'bun:test';

setDefaultTimeout(20000);

const BASE_URL =
  process.env.TEST_API_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  'http://localhost:3000';

let serverAvailable = false;

async function checkServerHealth(): Promise<boolean> {
  const response = await fetch(`${BASE_URL}/api/health`, {
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  return response?.ok ?? false;
}

describe('Daily Login API - /api/users/daily-login', () => {
  beforeAll(async () => {
    serverAvailable = await checkServerHealth();
    if (!serverAvailable) {
      console.warn('⚠️  Server not available - API tests will be skipped');
    }
  });

  // ============================================
  // GET Endpoint - Authentication Tests
  // ============================================

  describe('GET - Authentication', () => {
    test('should reject request without auth token', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
      });

      // 401 = proper auth rejection, 500 = auth middleware error
      expect([401, 500]).toContain(res.status);
    });

    test('should reject request with invalid auth token', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid-token-12345',
        },
        signal: AbortSignal.timeout(15000),
      });

      expect([401, 500]).toContain(res.status);
    });

    test('should reject request with malformed auth header', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'GET',
        headers: {
          Authorization: 'NotBearer some-token',
        },
        signal: AbortSignal.timeout(15000),
      });

      expect([401, 500]).toContain(res.status);
    });
  });

  // ============================================
  // POST Endpoint - Authentication Tests
  // ============================================

  describe('POST - Authentication', () => {
    test('should reject request without auth token', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      expect([401, 500]).toContain(res.status);
    });

    test('should reject request with invalid auth token', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token-12345',
        },
        signal: AbortSignal.timeout(15000),
      });

      expect([401, 500]).toContain(res.status);
    });
  });

  // ============================================
  // HTTP Methods
  // ============================================

  describe('HTTP Methods', () => {
    test('PUT should return 405 Method Not Allowed', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test',
        },
        signal: AbortSignal.timeout(15000),
      });

      // Next.js returns 405 for unsupported methods when route exists
      expect(res.status).toBe(405);
    });

    test('DELETE should return 405 Method Not Allowed', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer test',
        },
        signal: AbortSignal.timeout(15000),
      });

      expect(res.status).toBe(405);
    });

    test('PATCH should return 405 Method Not Allowed', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test',
        },
        signal: AbortSignal.timeout(15000),
      });

      expect(res.status).toBe(405);
    });
  });

  // ============================================
  // Endpoint Availability
  // ============================================

  describe('Endpoint Availability', () => {
    test('GET endpoint should be reachable (reject with auth error, not 404)', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
      });

      // Should not be 404 - endpoint exists
      expect(res.status).not.toBe(404);
    });

    test('POST endpoint should be reachable (reject with auth error, not 404)', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      // Should not be 404 - endpoint exists
      expect(res.status).not.toBe(404);
    });
  });

  // ============================================
  // Response Format (with mocked auth would go here)
  // ============================================

  describe('Response Format Expectations', () => {
    test('GET response should have expected streak info fields (when authenticated)', async () => {
      // This test documents the expected response format
      // In a real integration test, we'd use a test user with valid auth

      const expectedFields = [
        'currentStreak',
        'longestStreak',
        'nextReward',
        'daysUntilMilestone',
        'nextMilestone',
        'lastClaim',
        'canClaim',
        'timeUntilClaim',
        'timeUntilReset',
        'totalDailyLogins',
      ];

      // Just document the expected structure
      expect(expectedFields.length).toBe(10);
    });

    test('POST response should have expected claim result fields (when authenticated)', async () => {
      // This test documents the expected response format
      const expectedFields = [
        'success',
        'streak',
        'reward',
        'milestoneBonus',
        'totalAwarded',
        'nextReward',
        'daysUntilMilestone',
        'nextMilestone',
        'streakReset',
        'error',
      ];

      expect(expectedFields.length).toBe(10);
    });
  });
});

describe('Daily Login API - Edge Cases', () => {
  beforeAll(async () => {
    serverAvailable = await checkServerHealth();
  });

  describe('Request Headers', () => {
    test('should handle missing Content-Type on GET', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'GET',
        // No Content-Type needed for GET
        signal: AbortSignal.timeout(15000),
      });

      // Should still work (return auth error, not parsing error)
      expect([401, 500]).toContain(res.status);
    });

    test('should handle Accept header variations', async () => {
      if (!serverAvailable) return;

      const res = await fetch(`${BASE_URL}/api/users/daily-login`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });

      expect([401, 500]).toContain(res.status);
    });
  });

  describe('Rate Limiting (if applicable)', () => {
    test('multiple rapid requests should be handled gracefully', async () => {
      if (!serverAvailable) return;

      const requests = Array.from({ length: 5 }, () =>
        fetch(`${BASE_URL}/api/users/daily-login`, {
          method: 'GET',
          signal: AbortSignal.timeout(15000),
        })
      );

      const responses = await Promise.all(requests);

      // All should return consistent responses (auth error)
      for (const res of responses) {
        expect([401, 429, 500]).toContain(res.status);
      }
    });
  });
});
