import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { NextRequest } from 'next/server';

// Type for mock request
interface MockNextRequest {
  url: string;
  headers: {
    get: (name: string) => string | null;
  };
  cookies: {
    get: (name: string) => { value: string } | undefined;
  };
}

const mockVerifyAgentSession = mock();
const mockVerifyAuthToken = mock();
const mockSelect = mock();

const usersTable = {
  id: 'id',
  privyId: 'privyId',
  walletAddress: 'walletAddress',
  isAdmin: 'isAdmin',
};

const nftSnapshotTable = {
  userId: 'userId',
  hasMinted: 'hasMinted',
};

// Mock the local agent-auth module
mock.module('../agent-auth', () => ({
  verifyAgentSession: mockVerifyAgentSession,
}));

// Mock @babylon/db with Drizzle-style API
mock.module('@babylon/db', () => ({
  db: {
    select: mockSelect,
  },
  eq: (field: unknown, value: unknown) => ({ field, value }),
  users: usersTable,
  nftSnapshot: nftSnapshotTable,
}));

// Mock @privy-io/server-auth - PrivyClient is a class that gets instantiated
mock.module('@privy-io/server-auth', () => ({
  PrivyClient: class MockPrivyClient {
    verifyAuthToken = mockVerifyAuthToken;
  },
}));

// Import after mocks are set up
import { authenticate } from '../auth-middleware';

let usersRows: Array<{ id: string; walletAddress: string; isAdmin?: boolean }> =
  [];
let snapshotRows: Array<{ hasMinted: boolean }> = [];

const createRequest = (token: string, pathname: string): NextRequest =>
  ({
    url: `https://example.com${pathname}`,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'authorization' ? `Bearer ${token}` : null,
    },
    cookies: {
      get: () => undefined,
    },
  }) as MockNextRequest as NextRequest;

describe('authenticate middleware', () => {
  beforeEach(() => {
    mockVerifyAgentSession.mockReset();
    mockVerifyAuthToken.mockReset();
    mockSelect.mockReset();
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-app';
    process.env.PRIVY_APP_SECRET = 'test-secret';
    process.env.NFT_GATING_ENABLED = 'false';
    usersRows = [];
    snapshotRows = [];

    // Default mock chain for db.select().from().where().limit()
    mockSelect.mockImplementation(() => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => {
            if (table === usersTable) return Promise.resolve(usersRows);
            if (table === nftSnapshotTable)
              return Promise.resolve(snapshotRows);
            return Promise.resolve([]);
          },
        }),
      }),
    }));
  });

  it('returns agent user when session token is valid', async () => {
    mockVerifyAgentSession.mockReturnValueOnce({ agentId: 'agent-123' });

    const request = createRequest('agent-session-token', '/api/posts');
    const result = await authenticate(request);

    expect(result).toEqual({
      userId: 'agent-123',
      privyId: 'agent-123',
      isAgent: true,
    });
    expect(mockVerifyAuthToken).not.toHaveBeenCalled();
  });

  it('falls back to privy claims when agent session missing and db user absent', async () => {
    mockVerifyAgentSession.mockReturnValueOnce(null);
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-user' });

    usersRows = [];

    const request = createRequest('privy-token', '/api/users/me');
    const result = await authenticate(request);

    expect(result).toMatchObject({
      userId: 'privy-user',
      dbUserId: undefined,
      privyId: 'privy-user',
      isAgent: false,
    });
  });

  it('returns canonical id when privy user exists in db', async () => {
    mockVerifyAgentSession.mockReturnValueOnce(null);
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-user' });

    // Mock db user found
    usersRows = [{ id: 'db-user-id', walletAddress: '0xabc', isAdmin: false }];

    const request = createRequest('privy-token', '/api/users/me');
    const result = await authenticate(request);

    expect(result).toMatchObject({
      userId: 'db-user-id',
      dbUserId: 'db-user-id',
      privyId: 'privy-user',
      walletAddress: '0xabc',
      isAdmin: false,
    });
  });

  it('throws descriptive error when privy token is expired', async () => {
    mockVerifyAgentSession.mockReturnValueOnce(null);
    mockVerifyAuthToken.mockRejectedValueOnce(
      new Error('token expired: exp mismatch')
    );

    const request = createRequest('expired-token', '/api/users/me');

    try {
      await authenticate(request);
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'Authentication token has expired. Please refresh your session.'
      );
      expect((error as { code: string }).code).toBe('AUTH_FAILED');
    }
  });

  it('enforces NFT gating when enabled for non-allowlisted API paths', async () => {
    process.env.NFT_GATING_ENABLED = 'true';

    mockVerifyAgentSession.mockReturnValueOnce(null);
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-user' });
    usersRows = [{ id: 'db-user-id', walletAddress: '0xabc', isAdmin: false }];
    snapshotRows = [{ hasMinted: false }];

    const request = createRequest('privy-token', '/api/posts');

    try {
      await authenticate(request);
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('NFT access required');
      expect((error as { code: string }).code).toBe('FORBIDDEN');
    }
  });

  it('does not enforce NFT gating for allowlisted paths', async () => {
    process.env.NFT_GATING_ENABLED = 'true';

    mockVerifyAgentSession.mockReturnValueOnce(null);
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-user' });
    usersRows = [{ id: 'db-user-id', walletAddress: '0xabc', isAdmin: false }];
    snapshotRows = [{ hasMinted: false }];

    const request = createRequest('privy-token', '/api/users/me');
    const result = await authenticate(request);

    expect(result).toMatchObject({
      userId: 'db-user-id',
      dbUserId: 'db-user-id',
    });
  });

  it('bypasses NFT gating for admins', async () => {
    process.env.NFT_GATING_ENABLED = 'true';

    mockVerifyAgentSession.mockReturnValueOnce(null);
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-user' });
    usersRows = [{ id: 'db-user-id', walletAddress: '0xabc', isAdmin: true }];
    snapshotRows = [{ hasMinted: false }];

    const request = createRequest('privy-token', '/api/posts');
    const result = await authenticate(request);

    expect(result).toMatchObject({
      userId: 'db-user-id',
      isAdmin: true,
    });
  });
});
