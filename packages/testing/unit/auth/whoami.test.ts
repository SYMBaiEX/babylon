/**
 * /api/auth/whoami Endpoint Unit Tests
 *
 * Tests for the API key user info endpoint used by external clients
 * to discover their contextId for A2A requests.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';

// Mock user data (minimal: only id and username)
const mockUsers = new Map([
  ['user-123', { id: 'user-123', username: 'testuser' }],
  ['user-456', { id: 'user-456', username: 'anotheruser' }],
]);

// Mock validateUserApiKey
const mockValidateUserApiKey = mock(async (apiKey: string) => {
  if (apiKey === 'bab_live_valid123') {
    return { userId: 'user-123' };
  }
  if (apiKey === 'bab_live_valid456') {
    return { userId: 'user-456' };
  }
  if (apiKey === 'bab_live_deleted_user') {
    return { userId: 'user-deleted' }; // User doesn't exist in DB
  }
  // Invalid/expired/revoked keys return null
  return null;
});

// Mock db query
const mockDbSelect = mock(() => ({
  from: () => ({
    where: () => ({
      limit: (n: number) => {
        // Return based on last query context
        const lastCall = mockDbSelect.mock.calls.at(-1) as
          | [{ userId?: string }]
          | undefined;
        const userId = lastCall?.[0]?.userId;
        const user = userId ? mockUsers.get(userId) : undefined;
        return Promise.resolve(user ? [user] : []);
      },
    }),
  }),
}));

// Track the userId being queried
let lastQueriedUserId: string | null = null;

// Mock @babylon/api
mock.module('@babylon/api', () => ({
  validateUserApiKey: mockValidateUserApiKey,
}));

// Mock @babylon/db
mock.module('@babylon/db', () => ({
  db: {
    select: (fields: { id: unknown; username: unknown }) => ({
      from: () => ({
        where: (condition: unknown) => ({
          limit: () => {
            // Extract userId from the mock call context
            const user = mockUsers.get(lastQueriedUserId || '');
            return Promise.resolve(user ? [user] : []);
          },
        }),
      }),
    }),
  },
  eq: (field: unknown, value: string) => {
    lastQueriedUserId = value;
    return { field, value };
  },
  users: {
    id: 'users.id',
    username: 'users.username',
  },
}));

// Mock @babylon/shared
mock.module('@babylon/shared', () => ({
  logger: {
    debug: () => {},
    warn: () => {},
    error: () => {},
    info: () => {},
  },
}));

// Expected headers for all auth responses
const noCacheHeaders = { 'Cache-Control': 'no-store' };

// Mock NextResponse
const mockJsonResponse = mock(
  (
    body: unknown,
    init?: { status?: number; headers?: Record<string, string> }
  ) => ({
    body,
    status: init?.status || 200,
    headers: init?.headers,
  })
);

mock.module('next/server', () => ({
  NextResponse: {
    json: mockJsonResponse,
  },
}));

// Import the route handler after mocks are set up
const { GET } = await import(
  '../../../../apps/web/src/app/api/auth/whoami/route'
);

// Helper to create mock NextRequest
const createMockRequest = (apiKey: string | null): Request => {
  const headers = new Headers();
  if (apiKey) {
    headers.set('x-babylon-api-key', apiKey);
  }
  return {
    headers: {
      get: (name: string) => headers.get(name),
    },
  } as unknown as Request;
};

describe('/api/auth/whoami endpoint', () => {
  beforeEach(() => {
    mockValidateUserApiKey.mockClear();
    mockJsonResponse.mockClear();
    lastQueriedUserId = null;
  });

  describe('Valid API key scenarios', () => {
    it('should return correct user info for valid API key', async () => {
      const request = createMockRequest('bab_live_valid123');
      await GET(request as never);

      expect(mockValidateUserApiKey).toHaveBeenCalledWith('bab_live_valid123');
      expect(mockJsonResponse).toHaveBeenCalledWith(
        { userId: 'user-123', username: 'testuser' },
        { headers: noCacheHeaders }
      );
    });

    it('should return correct user info for different valid API key', async () => {
      const request = createMockRequest('bab_live_valid456');
      await GET(request as never);

      expect(mockValidateUserApiKey).toHaveBeenCalledWith('bab_live_valid456');
      expect(mockJsonResponse).toHaveBeenCalledWith(
        { userId: 'user-456', username: 'anotheruser' },
        { headers: noCacheHeaders }
      );
    });
  });

  describe('Invalid API key scenarios', () => {
    it('should return 401 for invalid API key', async () => {
      const request = createMockRequest('bab_live_invalid_key');
      await GET(request as never);

      expect(mockValidateUserApiKey).toHaveBeenCalledWith(
        'bab_live_invalid_key'
      );
      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'Invalid or expired API key' },
        { status: 401, headers: noCacheHeaders }
      );
    });

    it('should return 401 for expired API key', async () => {
      const request = createMockRequest('bab_live_expired_key_xyz');
      await GET(request as never);

      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'Invalid or expired API key' },
        { status: 401, headers: noCacheHeaders }
      );
    });

    it('should return 401 for revoked API key', async () => {
      const request = createMockRequest('bab_live_revoked_key_abc');
      await GET(request as never);

      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'Invalid or expired API key' },
        { status: 401, headers: noCacheHeaders }
      );
    });
  });

  describe('Missing API key scenarios', () => {
    it('should return 401 when API key header is missing', async () => {
      const request = createMockRequest(null);
      await GET(request as never);

      // Should not even call validateUserApiKey
      expect(mockValidateUserApiKey).not.toHaveBeenCalled();
      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'X-Babylon-Api-Key header is required' },
        { status: 401, headers: noCacheHeaders }
      );
    });

    it('should return 401 when API key header is empty string', async () => {
      const request = createMockRequest('');
      await GET(request as never);

      // Empty string is falsy, should not call validateUserApiKey
      expect(mockValidateUserApiKey).not.toHaveBeenCalled();
      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'X-Babylon-Api-Key header is required' },
        { status: 401, headers: noCacheHeaders }
      );
    });
  });

  describe('User not found scenarios', () => {
    it('should return 404 when API key is valid but user does not exist', async () => {
      const request = createMockRequest('bab_live_deleted_user');
      await GET(request as never);

      // API key validation passes
      expect(mockValidateUserApiKey).toHaveBeenCalledWith(
        'bab_live_deleted_user'
      );
      // But user lookup fails
      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'User not found' },
        { status: 404, headers: noCacheHeaders }
      );
    });
  });

  describe('Security considerations', () => {
    it('should only expose userId and username (minimal data)', async () => {
      const request = createMockRequest('bab_live_valid123');
      await GET(request as never);

      const responseBody = mockJsonResponse.mock.calls[0]?.[0];

      // Should only contain these two fields (minimal for contextId use case)
      expect(Object.keys(responseBody as object)).toEqual([
        'userId',
        'username',
      ]);

      // Should not contain PII or sensitive fields
      expect(responseBody).not.toHaveProperty('displayName');
      expect(responseBody).not.toHaveProperty('email');
      expect(responseBody).not.toHaveProperty('walletAddress');
      expect(responseBody).not.toHaveProperty('apiKeys');
      expect(responseBody).not.toHaveProperty('password');
      expect(responseBody).not.toHaveProperty('bio');
    });

    it('should validate API key before any database queries', async () => {
      const request = createMockRequest('bab_live_invalid_key');
      await GET(request as never);

      // Should call validateUserApiKey first
      expect(mockValidateUserApiKey).toHaveBeenCalledTimes(1);
      // Should not query DB for invalid keys
      expect(lastQueriedUserId).toBeNull();
    });

    it('should set Cache-Control: no-store header on all responses', async () => {
      // Test success response
      const successRequest = createMockRequest('bab_live_valid123');
      await GET(successRequest as never);
      expect(mockJsonResponse.mock.calls[0]?.[1]?.headers).toEqual(
        noCacheHeaders
      );

      mockJsonResponse.mockClear();

      // Test error response
      const errorRequest = createMockRequest('invalid_key');
      await GET(errorRequest as never);
      expect(mockJsonResponse.mock.calls[0]?.[1]?.headers).toEqual(
        noCacheHeaders
      );
    });
  });
});
