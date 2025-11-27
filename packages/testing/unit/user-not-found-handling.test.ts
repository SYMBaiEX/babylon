import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';
import { NotFoundError } from '@/lib/errors/base.errors';
import type { MockUserRecord, UserFindUniqueArgs } from '../types/test-types';

// Mock result storage - will be set by tests
let mockDbResult: MockUserRecord | null = null;

// Create a chainable mock that mimics Drizzle's query builder
const createChainableMock = () => ({
  from: () => createChainableMock(),
  where: () => createChainableMock(),
  limit: () => Promise.resolve(mockDbResult ? [mockDbResult] : []),
});

const mockSelect = mock(() => createChainableMock());

// Mock modules before importing the module under test
const mockVerifyAuthToken = mock(() =>
  Promise.resolve({ userId: 'did:privy:testuser123' })
);
const mockVerifyAgentSession = mock(() => Promise.resolve(null));
const mockFindUnique = mock<
  (args?: UserFindUniqueArgs) => Promise<MockUserRecord | null>
>(() => Promise.resolve(null));

// Mock Privy client
mock.module('@privy-io/server-auth', () => ({
  PrivyClient: class {
    verifyAuthToken = mockVerifyAuthToken;
  },
}));

// Mock agent auth
mock.module('@/lib/auth/agent-auth', () => ({
  verifyAgentSession: mockVerifyAgentSession,
}));

// Mock database (auth-middleware uses Drizzle query builder)
// Include all exports that may be needed by dependencies
mock.module('@/db', () => ({
  db: {
    select: mockSelect,
    user: {
      findUnique: mockFindUnique,
    },
  },
  // Tables
  users: {
    id: 'id',
    privyId: 'privyId',
    walletAddress: 'walletAddress',
  },
  actors: {},
  agentLogs: {},
  agentMessages: {},
  agentRegistries: {},
  llmCallLogs: {},
  trajectories: {},
  worldFacts: {},
  referrals: {},
  pointsTransactions: {},
  // Operators
  eq: () => ({}),
  and: () => ({}),
  or: () => ({}),
  ne: () => ({}),
  gt: () => ({}),
  gte: () => ({}),
  lt: () => ({}),
  lte: () => ({}),
  desc: () => ({}),
  asc: () => ({}),
  like: () => ({}),
  ilike: () => ({}),
  inArray: () => ({}),
  notInArray: () => ({}),
  isNull: () => ({}),
  isNotNull: () => ({}),
  not: () => ({}),
  count: () => ({}),
  sql: () => ({}),
}));

describe('User Not Found Handling', () => {
  beforeEach(() => {
    // Reset all mocks
    mockVerifyAuthToken.mockClear();
    mockVerifyAgentSession.mockClear();
    mockFindUnique.mockClear();
    mockSelect.mockClear();
    mockDbResult = null;

    // Set default mock implementations
    mockVerifyAuthToken.mockImplementation(() =>
      Promise.resolve({ userId: 'did:privy:testuser123' })
    );
    mockVerifyAgentSession.mockImplementation(() => Promise.resolve(null));

    // Reset select mock to return chainable object
    mockSelect.mockImplementation(() => createChainableMock());

    // Set required env vars
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-app-id';
    process.env.PRIVY_APP_SECRET = 'test-secret';
  });

  describe('authenticate()', () => {
    it('should return Privy DID when user does not exist in database', async () => {
      mockDbResult = null; // No user in DB

      const { authenticate } = await import('@/lib/api/auth-middleware');

      const request = new NextRequest('https://babylon.market/api/test', {
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      const result = await authenticate(request);

      expect(result.userId).toBe('did:privy:testuser123');
      expect(result.privyId).toBe('did:privy:testuser123');
      expect(result.dbUserId).toBeUndefined();
      expect(result.isAgent).toBe(false);
    });

    it('should return database user ID when user exists in database', async () => {
      // Set mock to return user
      mockDbResult = {
        id: 'db-user-123',
        walletAddress: '0x1234567890123456789012345678901234567890',
      };

      const { authenticate } = await import('@/lib/api/auth-middleware');

      const request = new NextRequest('https://babylon.market/api/test', {
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      const result = await authenticate(request);

      expect(result.userId).toBe('db-user-123');
      expect(result.dbUserId).toBe('db-user-123');
      expect(result.privyId).toBe('did:privy:testuser123');
      expect(result.walletAddress).toBe(
        '0x1234567890123456789012345678901234567890'
      );
      expect(result.isAgent).toBe(false);
    });
  });

  describe('authenticateWithDbUser()', () => {
    it('should throw error when user does not exist in database', async () => {
      mockDbResult = null; // No user in DB

      const { authenticateWithDbUser } = await import(
        '@/lib/api/auth-middleware'
      );

      const request = new NextRequest('https://babylon.market/api/test', {
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      await expect(authenticateWithDbUser(request)).rejects.toThrow(
        'User profile not found. Please complete onboarding first.'
      );
    });

    it('should return user with dbUserId when user exists in database', async () => {
      // Set mock to return user
      mockDbResult = {
        id: 'db-user-123',
        walletAddress: '0x1234567890123456789012345678901234567890',
      };

      const { authenticateWithDbUser } = await import(
        '@/lib/api/auth-middleware'
      );

      const request = new NextRequest('https://babylon.market/api/test', {
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      const result = await authenticateWithDbUser(request);

      expect(result.userId).toBe('db-user-123');
      expect(result.dbUserId).toBe('db-user-123');
      expect(result.privyId).toBe('did:privy:testuser123');
    });
  });

  describe('NotFoundError', () => {
    it('should support custom messages', () => {
      const error = new NotFoundError(
        'User',
        'did:privy:testuser123',
        'User profile not found. Please complete onboarding first.'
      );

      expect(error.message).toBe(
        'User profile not found. Please complete onboarding first.'
      );
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.context?.resource).toBe('User');
      expect(error.context?.identifier).toBe('did:privy:testuser123');
    });

    it('should work with default message format', () => {
      const error = new NotFoundError('User', 'did:privy:testuser123');

      expect(error.message).toBe('User not found: did:privy:testuser123');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('should work with only resource name', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });
  });
});
