import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { NextRequest } from 'next/server';
import { authenticate } from '../auth-middleware';

// Type for mock request
interface MockNextRequest {
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
const mockPrivyClient = mock(() => ({
  verifyAuthToken: mockVerifyAuthToken,
}));

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
  users: {
    id: 'id',
    privyId: 'privyId',
    walletAddress: 'walletAddress',
  },
}));

mock.module('@privy-io/server-auth', () => ({
  PrivyClient: mockPrivyClient,
}));

const createRequest = (token: string): NextRequest =>
  ({
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'authorization' ? `Bearer ${token}` : null,
    },
    cookies: {
      get: () => undefined,
    },
  }) as MockNextRequest as NextRequest;

describe('authenticate middleware', () => {
  beforeAll(async () => {
    // authenticate is now statically imported
  });

  beforeEach(() => {
    mockVerifyAgentSession.mockReset();
    mockVerifyAuthToken.mockReset();
    mockSelect.mockReset();
    mockPrivyClient.mockReset();
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-app';
    process.env.PRIVY_APP_SECRET = 'test-secret';

    // Default mock chain for db.select().from().where().limit()
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });
  });

  it('returns agent user when session token is valid', async () => {
    mockVerifyAgentSession.mockReturnValueOnce({ agentId: 'agent-123' });

    const request = createRequest('agent-session-token');
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

    // Mock empty db result
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    const request = createRequest('privy-token');
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
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: 'db-user-id',
                walletAddress: '0xabc',
              },
            ]),
        }),
      }),
    });

    const request = createRequest('privy-token');
    const result = await authenticate(request);

    expect(result).toMatchObject({
      userId: 'db-user-id',
      dbUserId: 'db-user-id',
      privyId: 'privy-user',
      walletAddress: '0xabc',
    });
  });

  it('throws descriptive error when privy token is expired', async () => {
    mockVerifyAgentSession.mockReturnValueOnce(null);
    mockVerifyAuthToken.mockRejectedValueOnce(
      new Error('token expired: exp mismatch')
    );

    const request = createRequest('expired-token');

    await expect(authenticate(request)).rejects.toMatchObject({
      message: 'Authentication token has expired. Please refresh your session.',
      code: 'AUTH_FAILED',
    });
  });
});
