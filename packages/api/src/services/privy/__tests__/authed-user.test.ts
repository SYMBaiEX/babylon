import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { AuthenticationError } from '../../../errors';

function base64url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Creates a minimal unsigned JWT string (header.payload.signature). */
function buildJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  return `${base64url(header)}.${base64url(payload)}.fake-signature`;
}

const NOW_SECONDS = Math.floor(Date.now() / 1000);

const basePayload = {
  aud: 'test-app-id',
  iss: 'privy.io',
  iat: NOW_SECONDS - 60,
  exp: NOW_SECONDS + 3600,
};

const mockVerifyAuthToken = mock();
const mockDbLimit = mock();

mock.module('@babylon/shared', () => ({
  CHAIN: { id: 1 },
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

mock.module('../privy-node', () => ({
  getPrivyNodeClient: () => ({
    wallets: () => ({
      ethereum: () => ({
        sendTransaction: mock(() =>
          Promise.resolve({ hash: '0xabc', caip2: 'eip155:1' })
        ),
      }),
    }),
  }),
}));

mock.module('../../../auth-middleware', () => ({
  getPrivyClient: () => ({
    verifyAuthToken: mockVerifyAuthToken,
  }),
}));

mock.module('@babylon/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockDbLimit,
        }),
      }),
    }),
  },
  eq: () => ({}),
  users: {
    id: 'id',
    privyId: 'privyId',
    privyWalletId: 'privyWalletId',
    walletAddress: 'walletAddress',
    isAdmin: 'isAdmin',
  },
}));

// Dynamic import after mocks are set up.
const {
  getAuthedUserContextFromPrivyToken,
  getAuthedUserContextFromPrivyTokenBundle,
} = await import('../authed-user');

describe('getAuthedUserContextFromPrivyTokenBundle', () => {
  beforeEach(() => {
    mockVerifyAuthToken.mockReset();
    mockDbLimit.mockReset();
  });

  it('returns user context using the primary token', async () => {
    mockVerifyAuthToken.mockResolvedValue({ userId: 'did:privy:primary' });
    mockDbLimit.mockResolvedValue([
      {
        id: '1',
        privyWalletId: 'wallet_1',
        walletAddress: '0xabc',
        isAdmin: false,
      },
    ]);

    const primary = buildJwt({ ...basePayload, sub: 'did:privy:primary' });
    const fallback = buildJwt({ ...basePayload, sub: 'did:privy:primary' });

    const ctx = await getAuthedUserContextFromPrivyTokenBundle({
      primary,
      fallback,
    });

    expect(ctx.privyId).toBe('did:privy:primary');
    expect(mockVerifyAuthToken).toHaveBeenCalledTimes(1);
  });

  it('retries with fallback token when primary token is rejected as invalid/expired (same user)', async () => {
    mockVerifyAuthToken
      .mockRejectedValueOnce(
        new Error(
          '400 {"error":"Invalid JWT token provided","code":"invalid_data"}'
        )
      )
      .mockResolvedValueOnce({ userId: 'did:privy:user' });
    mockDbLimit.mockResolvedValue([
      {
        id: '1',
        privyWalletId: 'wallet_1',
        walletAddress: '0xabc',
        isAdmin: false,
      },
    ]);

    // Ensure tokens are different strings so the bundle path is exercised.
    const primary = buildJwt({
      ...basePayload,
      sub: 'did:privy:user',
      sid: 'p',
    });
    const fallback = buildJwt({
      ...basePayload,
      sub: 'did:privy:user',
      sid: 'f',
    });

    const { safeDecodeJwtPayload } = await import('../evm-send-transaction');
    expect(safeDecodeJwtPayload(primary)?.sub).toBe('did:privy:user');
    expect(safeDecodeJwtPayload(fallback)?.sub).toBe('did:privy:user');

    const ctx = await getAuthedUserContextFromPrivyTokenBundle({
      primary,
      fallback,
    });

    expect(ctx.privyId).toBe('did:privy:user');
    expect(mockVerifyAuthToken).toHaveBeenCalledTimes(2);
  });

  it('does not retry with fallback token when token subjects do not match', async () => {
    mockVerifyAuthToken.mockRejectedValueOnce(
      new Error(
        '400 {"error":"Invalid JWT token provided","code":"invalid_data"}'
      )
    );

    const primary = buildJwt({ ...basePayload, sub: 'did:privy:userA' });
    const fallback = buildJwt({ ...basePayload, sub: 'did:privy:userB' });

    await expect(
      getAuthedUserContextFromPrivyTokenBundle({
        primary,
        fallback,
      })
    ).rejects.toThrow('Invalid JWT token provided');
    expect(mockVerifyAuthToken).toHaveBeenCalledTimes(1);
  });

  it('does not retry with fallback token for non-token errors', async () => {
    mockVerifyAuthToken.mockRejectedValueOnce(new Error('network down'));

    const primary = buildJwt({ ...basePayload, sub: 'did:privy:user' });
    const fallback = buildJwt({ ...basePayload, sub: 'did:privy:user' });

    await expect(
      getAuthedUserContextFromPrivyTokenBundle({
        primary,
        fallback,
      })
    ).rejects.toThrow('network down');
    expect(mockVerifyAuthToken).toHaveBeenCalledTimes(1);
  });

  it('throws AuthenticationError when token missing (original function behavior)', async () => {
    await expect(getAuthedUserContextFromPrivyToken('')).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });
});
