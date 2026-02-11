import { beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  PrivyJwtPayloadSchema,
  safeDecodeJwtHeader,
  safeDecodeJwtPayload,
} from '../evm-send-transaction';

// ---------------------------------------------------------------------------
// Helpers: build unsigned JWTs for decode-only tests
// ---------------------------------------------------------------------------

function base64url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Creates a minimal unsigned JWT string (header.payload.signature). */
function buildJwt(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT' }
): string {
  return `${base64url(header)}.${base64url(payload)}.fake-signature`;
}

const NOW_SECONDS = Math.floor(Date.now() / 1000);

const VALID_PAYLOAD = {
  aud: 'test-app-id',
  sub: 'did:privy:abc123',
  iss: 'privy.io',
  iat: NOW_SECONDS - 60,
  exp: NOW_SECONDS + 3600,
};

// ---------------------------------------------------------------------------
// safeDecodeJwtPayload
// ---------------------------------------------------------------------------

describe('safeDecodeJwtPayload', () => {
  it('decodes a valid Privy JWT payload', () => {
    const token = buildJwt(VALID_PAYLOAD);
    const result = safeDecodeJwtPayload(token);

    expect(result).not.toBeNull();
    expect(result!.sub).toBe('did:privy:abc123');
    expect(result!.aud).toBe('test-app-id');
    expect(result!.iss).toBe('privy.io');
    expect(result!.exp).toBe(VALID_PAYLOAD.exp);
  });

  it('accepts payload with aud as an array', () => {
    const token = buildJwt({ ...VALID_PAYLOAD, aud: ['app-1', 'app-2'] });
    const result = safeDecodeJwtPayload(token);

    expect(result).not.toBeNull();
    expect(result!.aud).toEqual(['app-1', 'app-2']);
  });

  it('includes optional sid when present', () => {
    const token = buildJwt({ ...VALID_PAYLOAD, sid: 'session-xyz' });
    const result = safeDecodeJwtPayload(token);

    expect(result).not.toBeNull();
    expect(result!.sid).toBe('session-xyz');
  });

  it('returns null for a completely invalid string', () => {
    expect(safeDecodeJwtPayload('not-a-jwt')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(safeDecodeJwtPayload('')).toBeNull();
  });

  it('returns null when required claim "sub" is missing', () => {
    const { sub: _, ...incomplete } = VALID_PAYLOAD;
    const token = buildJwt(incomplete);
    expect(safeDecodeJwtPayload(token)).toBeNull();
  });

  it('returns null when required claim "exp" is missing', () => {
    const { exp: _, ...incomplete } = VALID_PAYLOAD;
    const token = buildJwt(incomplete);
    expect(safeDecodeJwtPayload(token)).toBeNull();
  });

  it('returns null when required claim "iss" is missing', () => {
    const { iss: _, ...incomplete } = VALID_PAYLOAD;
    const token = buildJwt(incomplete);
    expect(safeDecodeJwtPayload(token)).toBeNull();
  });

  it('returns null when exp is not a number', () => {
    const token = buildJwt({ ...VALID_PAYLOAD, exp: 'never' });
    expect(safeDecodeJwtPayload(token)).toBeNull();
  });

  it('returns null when aud is not a string or string array', () => {
    const token = buildJwt({ ...VALID_PAYLOAD, aud: 123 });
    expect(safeDecodeJwtPayload(token)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// safeDecodeJwtHeader
// ---------------------------------------------------------------------------

describe('safeDecodeJwtHeader', () => {
  it('decodes a valid JWT header', () => {
    const token = buildJwt(VALID_PAYLOAD, {
      alg: 'RS256',
      typ: 'JWT',
      kid: 'key-1',
    });
    const header = safeDecodeJwtHeader(token);

    expect(header).not.toBeNull();
    expect(header!.alg).toBe('RS256');
    expect(header!.typ).toBe('JWT');
    expect(header!.kid).toBe('key-1');
  });

  it('returns null for an invalid token', () => {
    expect(safeDecodeJwtHeader('garbage')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(safeDecodeJwtHeader('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PrivyJwtPayloadSchema (Zod validation)
// ---------------------------------------------------------------------------

describe('PrivyJwtPayloadSchema', () => {
  it('accepts a valid payload', () => {
    const result = PrivyJwtPayloadSchema.safeParse(VALID_PAYLOAD);
    expect(result.success).toBe(true);
  });

  it('rejects payload missing aud', () => {
    const { aud: _, ...incomplete } = VALID_PAYLOAD;
    const result = PrivyJwtPayloadSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects payload with wrong type for iat', () => {
    const result = PrivyJwtPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      iat: 'now',
    });
    expect(result.success).toBe(false);
  });

  it('allows extra fields (passthrough)', () => {
    const result = PrivyJwtPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      custom_claim: 'hello',
    });
    // Zod strips extra keys by default but should still succeed
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sendSponsoredEvmTransaction – offline delegated path
// ---------------------------------------------------------------------------

// Mock the Privy client and shared modules so we can unit-test the function
// without real network calls.
const mockSendTransaction = mock(() =>
  Promise.resolve({ hash: '0xabc', caip2: 'eip155:1' })
);

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
        sendTransaction: mockSendTransaction,
      }),
    }),
  }),
}));

// Dynamic import after mocks are set up
const { sendSponsoredEvmTransaction } = await import('../evm-send-transaction');

describe('sendSponsoredEvmTransaction – offline delegated path', () => {
  const validAddress = '0x0000000000000000000000000000000000000001' as const;

  beforeEach(() => {
    mockSendTransaction.mockClear();
    process.env.PRIVY_APP_ID = 'test-app-id';
    process.env.PRIVY_APP_SECRET = 'test-secret';
    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY = 'test-authorization-key';
    process.env.PRIVY_OFFLINE_SIGNER_ID = 'test-offline-signer-id';
    process.env.PRIVY_OFFLINE_POLICY_ID = 'test-offline-policy-id';
    delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  });

  it('submits transaction with authorization private key context only', async () => {
    await sendSponsoredEvmTransaction({
      walletId: 'wallet-1',
      to: validAddress,
      valueWei: 0n,
    });

    expect(mockSendTransaction).toHaveBeenCalledTimes(1);
    expect(mockSendTransaction).toHaveBeenCalledWith('wallet-1', {
      caip2: 'eip155:1',
      sponsor: true,
      authorization_context: {
        authorization_private_keys: ['test-authorization-key'],
      },
      params: {
        transaction: {
          to: validAddress,
          chain_id: 1,
        },
      },
    });
  });

  it('fails fast when offline configuration is incomplete', async () => {
    delete process.env.PRIVY_APP_ID;
    delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    await expect(
      sendSponsoredEvmTransaction({
        walletId: 'wallet-1',
        to: validAddress,
      })
    ).rejects.toThrow(
      'Privy offline configuration is incomplete: missing PRIVY_APP_ID (or NEXT_PUBLIC_PRIVY_APP_ID)'
    );
  });

  it('passes idempotency key when provided', async () => {
    await sendSponsoredEvmTransaction({
      walletId: 'wallet-1',
      to: validAddress,
      idempotencyKey: 'idem-123',
    });

    expect(mockSendTransaction).toHaveBeenCalledTimes(1);
    expect(mockSendTransaction).toHaveBeenCalledWith('wallet-1', {
      caip2: 'eip155:1',
      sponsor: true,
      authorization_context: {
        authorization_private_keys: ['test-authorization-key'],
      },
      idempotency_key: 'idem-123',
      params: {
        transaction: {
          to: validAddress,
          chain_id: 1,
        },
      },
    });
  });

  it('propagates wallet endpoint errors', async () => {
    mockSendTransaction.mockImplementationOnce(() =>
      Promise.reject(new Error('upstream failed'))
    );

    await expect(
      sendSponsoredEvmTransaction({
        walletId: 'wallet-1',
        to: validAddress,
      })
    ).rejects.toThrow('upstream failed');
  });
});
