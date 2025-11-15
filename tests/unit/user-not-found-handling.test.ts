/**
 * Test for handling users not found in database but authenticated via Privy
 * Tests the fix for the error: "User not found: did:privy:cmhyl4q360160jm0cbhzltoyn"
 */

import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { NextRequest } from 'next/server';
import { NotFoundError } from '@/lib/errors/base.errors';

// Mock modules before importing the module under test
const mockVerifyAuthToken = mock(() => Promise.resolve({ userId: 'did:privy:testuser123' }));
const mockVerifyAgentSession = mock(() => Promise.resolve(null));
const mockFindUnique = mock<(args?: any) => Promise<{ id: string; walletAddress: string } | null>>(() => Promise.resolve(null));

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

// Mock database (auth-middleware imports from @/lib/prisma, not database-service)
mock.module('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

describe('User Not Found Handling', () => {
  beforeEach(() => {
    // Reset all mocks
    mockVerifyAuthToken.mockClear();
    mockVerifyAgentSession.mockClear();
    mockFindUnique.mockClear();
    
    // Set default mock implementations
    mockVerifyAuthToken.mockImplementation(() => Promise.resolve({ userId: 'did:privy:testuser123' }));
    mockVerifyAgentSession.mockImplementation(() => Promise.resolve(null));
    
    // Set required env vars
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-app-id';
    process.env.PRIVY_APP_SECRET = 'test-secret';
  });

  describe('authenticate()', () => {
    it('should return Privy DID when user does not exist in database', async () => {
      mockFindUnique.mockImplementation(() => Promise.resolve(null));
      
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
      // Mock findUnique to return user when queried by privyId
      mockFindUnique.mockImplementation((args: any) => {
        if (args?.where?.privyId === 'did:privy:testuser123') {
          return Promise.resolve({
            id: 'db-user-123',
            walletAddress: '0x1234567890123456789012345678901234567890',
          });
        }
        return Promise.resolve(null);
      });
      
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
      expect(result.walletAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(result.isAgent).toBe(false);
    });
  });

  describe('authenticateWithDbUser()', () => {
    it('should throw error when user does not exist in database', async () => {
      mockFindUnique.mockImplementation(() => Promise.resolve(null));
      
      const { authenticateWithDbUser } = await import('@/lib/api/auth-middleware');

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
      // Mock findUnique to return user when queried by privyId
      mockFindUnique.mockImplementation((args: any) => {
        if (args?.where?.privyId === 'did:privy:testuser123') {
          return Promise.resolve({
            id: 'db-user-123',
            walletAddress: '0x1234567890123456789012345678901234567890',
          });
        }
        return Promise.resolve(null);
      });
      
      const { authenticateWithDbUser } = await import('@/lib/api/auth-middleware');

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
      const error = new NotFoundError('User', 'did:privy:testuser123', 'User profile not found. Please complete onboarding first.');
      
      expect(error.message).toBe('User profile not found. Please complete onboarding first.');
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

