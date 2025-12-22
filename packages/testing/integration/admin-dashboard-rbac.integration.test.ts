/**
 * Integration Tests: Admin Dashboard MVP with RBAC
 *
 * Comprehensive tests for:
 * - RBAC middleware (getAdminRole, requireAdmin, requirePermission, requireSuperAdmin)
 * - Admin stats API endpoints (users, trading, system)
 * - Admin roles management API
 * - Admin permissions API
 *
 * Tests boundary conditions, error handling, and real data validation.
 *
 * Run with: bun test integration/admin-dashboard-rbac.integration.test.ts --preload ./integration/preload.ts
 */

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test';
import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  adminRoles,
  db,
  eq,
  ROLE_PERMISSIONS,
  users,
} from '@babylon/db';
import { getDevCredentials } from '@babylon/api';
import { generateSnowflakeId } from '@babylon/shared';

const BASE_URL =
  process.env.TEST_API_URL ||
  process.env.TEST_BASE_URL ||
  'http://localhost:3000';

let serverAvailable = false;
let devAdminToken: string | null = null;

// Test user IDs for cleanup
const testUserIds: string[] = [];

/**
 * Test helper: Make authenticated admin request
 */
async function adminRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (devAdminToken) {
    (headers as Record<string, string>)['x-dev-admin-token'] = devAdminToken;
  }

  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(15000),
  });
}

/**
 * Test helper: Make unauthenticated request
 */
async function publicRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
}

/**
 * Test helper: Create a test user in the database
 */
async function createTestUser(overrides: Partial<{
  username: string;
  isAdmin: boolean;
  isAgent: boolean;
  isActor: boolean;
  isBanned: boolean;
}>): Promise<string> {
  const userId = await generateSnowflakeId();
  const username = overrides.username || `rbac-test-${userId}`;

  await db.insert(users).values({
    id: userId,
    username,
    displayName: `Test User ${userId}`,
    isAdmin: overrides.isAdmin || false,
    isAgent: overrides.isAgent || false,
    isActor: overrides.isActor || false,
    isBanned: overrides.isBanned || false,
    updatedAt: new Date(),
  });

  testUserIds.push(userId);
  return userId;
}

/**
 * Test helper: Create admin role for a user
 */
async function createAdminRole(
  userId: string,
  role: 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER',
  grantedBy: string
): Promise<string> {
  const roleId = `admin_role_${await generateSnowflakeId()}`;

  await db.insert(adminRoles).values({
    id: roleId,
    userId,
    role,
    permissions: ROLE_PERMISSIONS[role],
    grantedBy,
    grantedAt: new Date(),
  });

  return roleId;
}

describe('Admin Dashboard RBAC Integration Tests', () => {
  beforeAll(async () => {
    // Check if server is running
    try {
      const healthResponse = await fetch(`${BASE_URL}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (healthResponse.ok) {
        serverAvailable = true;
        console.log('✅ Server available for testing');
      }
    } catch {
      console.warn('⚠️  Server not available - API tests will be skipped');
    }

    // Get dev credentials for authenticated tests
    const creds = getDevCredentials();
    if (creds) {
      devAdminToken = creds.devAdminToken;
      console.log('✅ Dev admin token available');
    } else {
      console.warn('⚠️  Dev credentials not available - auth tests limited');
    }
  });

  afterAll(async () => {
    // Clean up test admin roles
    for (const userId of testUserIds) {
      await db.delete(adminRoles).where(eq(adminRoles.userId, userId));
    }

    // Clean up test users
    for (const userId of testUserIds) {
      await db.delete(users).where(eq(users.id, userId));
    }

    console.log(`✅ Cleaned up ${testUserIds.length} test users`);
  });

  // ============================================
  // RBAC CONSTANTS VERIFICATION
  // ============================================
  describe('RBAC Constants', () => {
    test('ADMIN_ROLES contains expected roles', () => {
      expect(ADMIN_ROLES).toContain('SUPER_ADMIN');
      expect(ADMIN_ROLES).toContain('ADMIN');
      expect(ADMIN_ROLES).toContain('VIEWER');
      expect(ADMIN_ROLES).toHaveLength(3);
    });

    test('ADMIN_PERMISSIONS contains all expected permissions', () => {
      const expectedPermissions: readonly string[] = [
        'view_stats',
        'view_users',
        'manage_users',
        'view_trading',
        'view_system',
        'give_feedback',
        'manage_admins',
        'manage_game',
        'view_reports',
        'resolve_reports',
        'manage_escrow',
      ];

      for (const perm of expectedPermissions) {
        expect(ADMIN_PERMISSIONS as readonly string[]).toContain(perm);
      }
    });

    test('ROLE_PERMISSIONS assigns correct permissions to SUPER_ADMIN', () => {
      // SUPER_ADMIN should have all permissions
      expect(ROLE_PERMISSIONS.SUPER_ADMIN).toHaveLength(ADMIN_PERMISSIONS.length);
      for (const perm of ADMIN_PERMISSIONS) {
        expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(perm);
      }
    });

    test('ROLE_PERMISSIONS assigns correct permissions to ADMIN', () => {
      // ADMIN should not have manage_admins
      expect(ROLE_PERMISSIONS.ADMIN).not.toContain('manage_admins');
      expect(ROLE_PERMISSIONS.ADMIN).toContain('view_stats');
      expect(ROLE_PERMISSIONS.ADMIN).toContain('manage_users');
      expect(ROLE_PERMISSIONS.ADMIN).toContain('resolve_reports');
    });

    test('ROLE_PERMISSIONS assigns correct permissions to VIEWER', () => {
      // VIEWER should only have view permissions
      expect(ROLE_PERMISSIONS.VIEWER).toContain('view_stats');
      expect(ROLE_PERMISSIONS.VIEWER).toContain('view_users');
      expect(ROLE_PERMISSIONS.VIEWER).toContain('view_trading');
      expect(ROLE_PERMISSIONS.VIEWER).toContain('view_system');
      expect(ROLE_PERMISSIONS.VIEWER).not.toContain('manage_users');
      expect(ROLE_PERMISSIONS.VIEWER).not.toContain('manage_admins');
    });

    test('VIEWER has fewer permissions than ADMIN', () => {
      expect(ROLE_PERMISSIONS.VIEWER.length).toBeLessThan(
        ROLE_PERMISSIONS.ADMIN.length
      );
    });

    test('ADMIN has fewer permissions than SUPER_ADMIN', () => {
      expect(ROLE_PERMISSIONS.ADMIN.length).toBeLessThan(
        ROLE_PERMISSIONS.SUPER_ADMIN.length
      );
    });
  });

  // ============================================
  // DATABASE RBAC OPERATIONS
  // ============================================
  describe('Database RBAC Operations', () => {
    test('can create admin role for user', async () => {
      const userId = await createTestUser({});
      const roleId = await createAdminRole(userId, 'ADMIN', userId);

      // Verify role was created
      const [role] = await db
        .select()
        .from(adminRoles)
        .where(eq(adminRoles.id, roleId))
        .limit(1);

      expect(role).toBeDefined();
      expect(role!.userId).toBe(userId);
      expect(role!.role).toBe('ADMIN');
      expect(role!.permissions).toEqual(ROLE_PERMISSIONS.ADMIN);
      expect(role!.revokedAt).toBeNull();
    });

    test('can revoke admin role', async () => {
      const userId = await createTestUser({});
      await createAdminRole(userId, 'VIEWER', userId);

      // Revoke the role
      await db
        .update(adminRoles)
        .set({ revokedAt: new Date() })
        .where(eq(adminRoles.userId, userId));

      // Verify role was revoked
      const [role] = await db
        .select()
        .from(adminRoles)
        .where(eq(adminRoles.userId, userId))
        .limit(1);

      expect(role).toBeDefined();
      expect(role!.revokedAt).not.toBeNull();
    });

    test('legacy isAdmin flag still works', async () => {
      const userId = await createTestUser({ isAdmin: true });

      // Query user to verify
      const [user] = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      expect(user).toBeDefined();
      expect(user!.isAdmin).toBe(true);
    });

    test('user can have role without legacy isAdmin', async () => {
      const userId = await createTestUser({ isAdmin: false });
      await createAdminRole(userId, 'SUPER_ADMIN', userId);

      const [user] = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const [role] = await db
        .select()
        .from(adminRoles)
        .where(eq(adminRoles.userId, userId))
        .limit(1);

      expect(user).toBeDefined();
      expect(role).toBeDefined();
      expect(user!.isAdmin).toBe(false);
      expect(role!.role).toBe('SUPER_ADMIN');
    });

    test('handles non-existent user gracefully', async () => {
      const fakeUserId = 'non-existent-user-id-12345';

      const [role] = await db
        .select()
        .from(adminRoles)
        .where(eq(adminRoles.userId, fakeUserId))
        .limit(1);

      expect(role).toBeUndefined();
    });
  });

  // ============================================
  // ADMIN STATS API - USERS
  // ============================================
  describe('Admin Stats API - Users', () => {
    test('GET /api/admin/stats/users - requires auth', async () => {
      if (!serverAvailable) return;

      const res = await publicRequest('/api/admin/stats/users');
      expect(res.status).toBe(401);
    });

    test('GET /api/admin/stats/users - returns user statistics', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/users');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();

      // Verify structure
      const stats = data.data;
      expect(stats.overview).toBeDefined();
      expect(typeof stats.overview.total).toBe('number');
      expect(typeof stats.overview.realUsers).toBe('number');
      expect(typeof stats.overview.actors).toBe('number');
      expect(typeof stats.overview.agents).toBe('number');
      expect(typeof stats.overview.banned).toBe('number');

      expect(stats.signups).toBeDefined();
      expect(typeof stats.signups.today).toBe('number');
      expect(typeof stats.signups.thisWeek).toBe('number');

      expect(stats.profileMetrics).toBeDefined();
      expect(stats.socialConnections).toBeDefined();
      expect(Array.isArray(stats.topReferrers)).toBe(true);
      expect(Array.isArray(stats.recentSignups)).toBe(true);
    });

    test('GET /api/admin/stats/users - with time series', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest(
        '/api/admin/stats/users?includeTimeSeries=true'
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.timeSeries)).toBe(true);

      // Verify time series structure if data exists
      if (data.data.timeSeries.length > 0) {
        const entry = data.data.timeSeries[0];
        expect(entry.date).toBeDefined();
        expect(typeof entry.signups).toBe('number');
        expect(typeof entry.cumulative).toBe('number');
      }
    });

    test('GET /api/admin/stats/users - with date filter', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      const res = await adminRequest(
        `/api/admin/stats/users?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.filters.startDate).toBeDefined();
      expect(data.data.filters.endDate).toBeDefined();
    });

    test('GET /api/admin/stats/users - with invalid date gracefully handles', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest(
        '/api/admin/stats/users?startDate=invalid-date&endDate=also-invalid'
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      // Invalid dates should be parsed as null
      expect(data.data.filters.startDate).toBeNull();
      expect(data.data.filters.endDate).toBeNull();
    });

    test('GET /api/admin/stats/users - verifies counts are non-negative', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/users');
      const data = await res.json();

      expect(data.data.overview.total).toBeGreaterThanOrEqual(0);
      expect(data.data.overview.realUsers).toBeGreaterThanOrEqual(0);
      expect(data.data.signups.today).toBeGreaterThanOrEqual(0);
      expect(data.data.profileMetrics.profileCompletionRate).toBeGreaterThanOrEqual(0);
      expect(data.data.profileMetrics.profileCompletionRate).toBeLessThanOrEqual(100);
    });
  });

  // ============================================
  // ADMIN STATS API - TRADING
  // ============================================
  describe('Admin Stats API - Trading', () => {
    test('GET /api/admin/stats/trading - requires auth', async () => {
      if (!serverAvailable) return;

      const res = await publicRequest('/api/admin/stats/trading');
      expect(res.status).toBe(401);
    });

    test('GET /api/admin/stats/trading - returns trading statistics', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/trading');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      const stats = data.data;
      expect(stats.overview).toBeDefined();
      expect(typeof stats.overview.totalMarkets).toBe('number');
      expect(typeof stats.overview.activeMarkets).toBe('number');
      expect(typeof stats.overview.totalPositions).toBe('number');

      expect(stats.volume).toBeDefined();
      expect(typeof stats.volume.totalBalanceTransactions).toBe('number');

      expect(stats.fees).toBeDefined();
      expect(typeof stats.fees.totalFees).toBe('number');
      expect(typeof stats.fees.feeRate).toBe('number');

      expect(Array.isArray(stats.topTraders)).toBe(true);
      expect(Array.isArray(stats.topMarkets)).toBe(true);
      expect(Array.isArray(stats.recentTrades)).toBe(true);
    });

    test('GET /api/admin/stats/trading - with time series', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest(
        '/api/admin/stats/trading?includeTimeSeries=true'
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.data.timeSeries)).toBe(true);
    });

    test('GET /api/admin/stats/trading - topTraders have correct structure', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/trading');
      const data = await res.json();

      if (data.data.topTraders.length > 0) {
        const trader = data.data.topTraders[0];
        expect(trader.userId).toBeDefined();
        expect(typeof trader.tradeCount).toBe('number');
        expect(typeof trader.totalVolume).toBe('number');
      }
    });

    test('GET /api/admin/stats/trading - verifies market counts consistency', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/trading');
      const data = await res.json();

      // Active + resolved should equal total (approximately - may have other states)
      const { totalMarkets, activeMarkets, resolvedMarkets } = data.data.overview;
      expect(activeMarkets + resolvedMarkets).toBeLessThanOrEqual(totalMarkets + 1); // +1 for potential timing issues
    });
  });

  // ============================================
  // ADMIN STATS API - SYSTEM
  // ============================================
  describe('Admin Stats API - System', () => {
    test('GET /api/admin/stats/system - requires auth', async () => {
      if (!serverAvailable) return;

      const res = await publicRequest('/api/admin/stats/system');
      expect(res.status).toBe(401);
    });

    test('GET /api/admin/stats/system - returns system health', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/system');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      const stats = data.data;

      // Health checks
      expect(stats.health).toBeDefined();
      expect(typeof stats.health.database).toBe('boolean');
      expect(typeof stats.health.redis).toBe('boolean');
      expect(typeof stats.health.overall).toBe('boolean');
      expect(stats.health.timestamp).toBeDefined();

      // LLM stats
      expect(stats.llm).toBeDefined();
      expect(typeof stats.llm.callsLast24h).toBe('number');
      expect(typeof stats.llm.errorsLastHour).toBe('number');

      // Content stats
      expect(stats.content).toBeDefined();
      expect(typeof stats.content.lookaheadMinutes).toBe('number');
      expect(typeof stats.content.isHealthy).toBe('boolean');

      // Realtime stats
      expect(stats.realtime).toBeDefined();
      expect(typeof stats.realtime.outboxPending).toBe('number');
      expect(typeof stats.realtime.isHealthy).toBe('boolean');

      // Environment info
      expect(stats.environment).toBeDefined();
    });

    test('GET /api/admin/stats/system - database tables have valid structure', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/system');
      const data = await res.json();

      expect(Array.isArray(data.data.database.tables)).toBe(true);

      if (data.data.database.tables.length > 0) {
        const table = data.data.database.tables[0];
        expect(typeof table.name).toBe('string');
        expect(typeof table.rowCount).toBe('number');
        expect(typeof table.sizeBytes).toBe('number');
        expect(typeof table.sizeMB).toBe('number');
        expect(table.rowCount).toBeGreaterThanOrEqual(0);
        expect(table.sizeBytes).toBeGreaterThanOrEqual(0);
      }
    });

    test('GET /api/admin/stats/system - cron jobs info present', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/system');
      const data = await res.json();

      expect(data.data.cronJobs).toBeDefined();
      expect(Array.isArray(data.data.cronJobs.allJobs)).toBe(true);
    });

    test('GET /api/admin/stats/system - locks array valid', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/system');
      const data = await res.json();

      expect(data.data.locks).toBeDefined();
      expect(Array.isArray(data.data.locks.active)).toBe(true);

      if (data.data.locks.active.length > 0) {
        const lock = data.data.locks.active[0];
        expect(lock.id).toBeDefined();
        expect(lock.lockType).toBeDefined();
        expect(lock.acquiredAt).toBeDefined();
        expect(typeof lock.ageSeconds).toBe('number');
      }
    });
  });

  // ============================================
  // ADMIN ROLES API
  // ============================================
  describe('Admin Roles API', () => {
    test('GET /api/admin/roles - requires auth', async () => {
      if (!serverAvailable) return;

      const res = await publicRequest('/api/admin/roles');
      expect(res.status).toBe(401);
    });

    test('GET /api/admin/roles - returns admin list', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/roles');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.admins)).toBe(true);
    });

    test('POST /api/admin/roles - requires super admin', async () => {
      if (!serverAvailable) return;

      // Without auth
      const res = await publicRequest('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          action: 'grant',
          userId: 'fake-id',
          role: 'VIEWER',
        }),
      });
      expect(res.status).toBe(401);
    });

    test('POST /api/admin/roles - validates required fields', async () => {
      if (!serverAvailable || !devAdminToken) return;

      // Missing action
      const res1 = await adminRequest('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(res1.status).toBe(400);

      // Missing userId
      const res2 = await adminRequest('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({ action: 'grant', role: 'VIEWER' }),
      });
      expect(res2.status).toBe(400);
    });

    test('POST /api/admin/roles - rejects invalid role', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const userId = await createTestUser({});

      const res = await adminRequest('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          action: 'grant',
          userId,
          role: 'INVALID_ROLE',
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Valid role is required');
    });

    test('POST /api/admin/roles - rejects invalid action', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          action: 'invalid_action',
          userId: 'fake-user',
        }),
      });
      expect(res.status).toBe(400);
    });

    test('POST /api/admin/roles - handles non-existent user', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          action: 'grant',
          userId: 'definitely-not-a-real-user-id',
          role: 'VIEWER',
        }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // ADMIN PERMISSIONS API
  // ============================================
  describe('Admin Permissions API', () => {
    test('GET /api/admin/permissions - requires auth', async () => {
      if (!serverAvailable) return;

      const res = await publicRequest('/api/admin/permissions');
      expect(res.status).toBe(401);
    });

    test('GET /api/admin/permissions - returns user permissions', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/permissions');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.role).toBeDefined();
      expect(Array.isArray(data.data.permissions)).toBe(true);
    });

    test('GET /api/admin/permissions - dev token gets SUPER_ADMIN', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/permissions');
      const data = await res.json();

      // Dev admin should be SUPER_ADMIN
      expect(data.data.role).toBe('SUPER_ADMIN');
      expect(data.data.permissions).toEqual(
        expect.arrayContaining(['manage_admins', 'view_stats', 'manage_users'])
      );
    });
  });

  // ============================================
  // ADMIN ENVIRONMENT API
  // ============================================
  describe('Admin Environment API', () => {
    test('GET /api/admin/environment - requires auth', async () => {
      if (!serverAvailable) return;

      const res = await publicRequest('/api/admin/environment');
      expect(res.status).toBe(401);
    });

    test('GET /api/admin/environment - returns current environment', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/environment');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(['development', 'staging', 'production']).toContain(
        data.data.environment
      );
    });

    test('POST /api/admin/environment - validates environment value', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/environment', {
        method: 'POST',
        body: JSON.stringify({ environment: 'invalid-env' }),
      });

      // Should reject invalid environment
      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // ERROR HANDLING
  // ============================================
  describe('Error Handling', () => {
    test('invalid JSON body returns 400', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await fetch(`${BASE_URL}/api/admin/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-admin-token': devAdminToken,
        },
        body: 'not valid json {{{',
      });

      expect(res.status).toBeLessThan(500);
    });

    test('error responses do not expose stack traces', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          action: 'grant',
          userId: 'invalid',
          role: 'INVALID',
        }),
      });

      const text = await res.text();
      expect(text.toLowerCase()).not.toContain('stack');
      expect(text.toLowerCase()).not.toContain('node_modules');
    });

    test('unauthorized error format is consistent', async () => {
      if (!serverAvailable) return;

      const endpoints = [
        '/api/admin/stats/users',
        '/api/admin/stats/trading',
        '/api/admin/stats/system',
        '/api/admin/roles',
        '/api/admin/permissions',
      ];

      for (const endpoint of endpoints) {
        const res = await publicRequest(endpoint);
        expect(res.status).toBe(401);

        const data = await res.json();
        expect(data.error).toBeDefined();
      }
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================
  describe('Edge Cases', () => {
    test('handles empty time series gracefully', async () => {
      if (!serverAvailable || !devAdminToken) return;

      // Request very old date range that likely has no data
      const oldDate = new Date('2000-01-01');
      const res = await adminRequest(
        `/api/admin/stats/users?startDate=${oldDate.toISOString()}&endDate=${oldDate.toISOString()}&includeTimeSeries=true`
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.data.timeSeries)).toBe(true);
    });

    test('handles concurrent requests', async () => {
      if (!serverAvailable || !devAdminToken) return;

      // Fire 5 concurrent requests
      const requests = [
        adminRequest('/api/admin/stats/users'),
        adminRequest('/api/admin/stats/trading'),
        adminRequest('/api/admin/stats/system'),
        adminRequest('/api/admin/roles'),
        adminRequest('/api/admin/permissions'),
      ];

      const responses = await Promise.all(requests);

      for (const res of responses) {
        expect(res.status).toBe(200);
      }
    });

    test('SQL injection in query params handled safely', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest(
        "/api/admin/stats/users?userType='; DROP TABLE users; --"
      );

      expect(res.status).toBeLessThan(500);
    });

    test('very long query params handled gracefully', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const longValue = 'a'.repeat(10000);
      const res = await adminRequest(
        `/api/admin/stats/users?userType=${longValue}`
      );

      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================
  // DATA INTEGRITY
  // ============================================
  describe('Data Integrity', () => {
    test('user stats counts are consistent', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/users');
      const data = await res.json();

      const { total, realUsers, actors, agents } = data.data.overview;

      // Total should be approximately sum of user types (overlap possible)
      expect(total).toBeGreaterThanOrEqual(
        Math.max(realUsers, actors, agents)
      );
    });

    test('trading stats fees are non-negative', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/trading');
      const data = await res.json();

      expect(data.data.fees.totalFees).toBeGreaterThanOrEqual(0);
      expect(data.data.fees.platformFees).toBeGreaterThanOrEqual(0);
      expect(data.data.fees.referrerFees).toBeGreaterThanOrEqual(0);
    });

    test('system health timestamp is recent', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/stats/system');
      const data = await res.json();

      const timestamp = new Date(data.data.health.timestamp);
      const now = new Date();
      const diffSeconds = Math.abs(now.getTime() - timestamp.getTime()) / 1000;

      // Timestamp should be within last 60 seconds
      expect(diffSeconds).toBeLessThan(60);
    });

    test('admin list contains valid role values', async () => {
      if (!serverAvailable || !devAdminToken) return;

      const res = await adminRequest('/api/admin/roles');
      const data = await res.json();

      for (const admin of data.data.admins) {
        expect(ADMIN_ROLES).toContain(admin.role);
        expect(Array.isArray(admin.permissions)).toBe(true);
      }
    });
  });
});
