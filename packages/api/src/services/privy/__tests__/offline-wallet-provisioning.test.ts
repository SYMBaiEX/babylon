import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockGetUser = mock();
const mockCreateWallets = mock();
const mockWalletGet = mock();
const mockWalletUpdate = mock();

mock.module('@babylon/shared', () => ({
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

mock.module('../../../auth-middleware', () => ({
  getPrivyClient: () => ({
    getUser: mockGetUser,
    createWallets: mockCreateWallets,
  }),
}));

mock.module('../privy-node', () => ({
  getPrivyNodeClient: () => ({
    wallets: () => ({
      get: mockWalletGet,
      update: mockWalletUpdate,
    }),
  }),
}));

const { ensureOfflineWalletReady } = await import(
  '../offline-wallet-provisioning'
);

const EMBEDDED_WALLET = {
  id: 'wallet-1',
  address: '0x0000000000000000000000000000000000000001',
  chain_type: 'ethereum',
  wallet_client: 'privy',
};

describe('ensureOfflineWalletReady', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockCreateWallets.mockReset();
    mockWalletGet.mockReset();
    mockWalletUpdate.mockReset();

    process.env.PRIVY_APP_ID = 'test-app-id';
    process.env.PRIVY_APP_SECRET = 'test-secret';
    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY = 'test-authorization-key';
    process.env.PRIVY_OFFLINE_SIGNER_ID = 'offline-signer-id';
    process.env.PRIVY_OFFLINE_POLICY_ID = 'offline-policy-id';
  });

  it('returns ready state when wallet already has signer policy attached', async () => {
    mockGetUser.mockResolvedValue({
      id: 'did:privy:user-1',
      wallet: EMBEDDED_WALLET,
      linkedAccounts: [],
    });
    mockWalletGet.mockResolvedValue({
      additional_signers: [
        {
          signer_id: 'offline-signer-id',
          override_policy_ids: ['offline-policy-id'],
        },
      ],
    });

    const result = await ensureOfflineWalletReady({
      privyId: 'did:privy:user-1',
      userJwt: 'jwt-token',
    });

    expect(result.offlineWalletReady).toBe(true);
    expect(result.createdWallet).toBe(false);
    expect(result.updatedSigner).toBe(false);
    expect(result.privyWalletId).toBe('wallet-1');
    expect(mockCreateWallets).not.toHaveBeenCalled();
    expect(mockWalletUpdate).not.toHaveBeenCalled();
  });

  it('creates wallet when embedded wallet is missing', async () => {
    mockGetUser
      .mockResolvedValueOnce({
        id: 'did:privy:user-2',
        wallet: null,
        linkedAccounts: [],
      })
      .mockResolvedValueOnce({
        id: 'did:privy:user-2',
        wallet: EMBEDDED_WALLET,
        linkedAccounts: [],
      });
    mockWalletGet.mockResolvedValue({
      additional_signers: [
        {
          signer_id: 'offline-signer-id',
          override_policy_ids: ['offline-policy-id'],
        },
      ],
    });

    const result = await ensureOfflineWalletReady({
      privyId: 'did:privy:user-2',
      userJwt: 'jwt-token',
    });

    expect(result.createdWallet).toBe(true);
    expect(result.updatedSigner).toBe(false);
    expect(mockCreateWallets).toHaveBeenCalledTimes(1);
  });

  it('updates wallet signers when signer policy is missing', async () => {
    mockGetUser.mockResolvedValue({
      id: 'did:privy:user-3',
      wallet: EMBEDDED_WALLET,
      linkedAccounts: [],
    });
    mockWalletGet
      .mockResolvedValueOnce({
        additional_signers: [],
      })
      .mockResolvedValueOnce({
        additional_signers: [
          {
            signer_id: 'offline-signer-id',
            override_policy_ids: ['offline-policy-id'],
          },
        ],
      });

    const result = await ensureOfflineWalletReady({
      privyId: 'did:privy:user-3',
      userJwt: 'jwt-token',
    });

    expect(result.createdWallet).toBe(false);
    expect(result.updatedSigner).toBe(true);
    expect(mockWalletUpdate).toHaveBeenCalledTimes(1);
    expect(mockWalletUpdate).toHaveBeenCalledWith('wallet-1', {
      additional_signers: [
        {
          signer_id: 'offline-signer-id',
          override_policy_ids: ['offline-policy-id'],
        },
      ],
      authorization_context: {
        user_jwts: ['jwt-token'],
        authorization_private_keys: ['test-authorization-key'],
      },
    });
  });

  it('rejects when user JWT is missing', async () => {
    await expect(
      ensureOfflineWalletReady({
        privyId: 'did:privy:user-4',
        userJwt: '',
      })
    ).rejects.toThrow(
      'Cannot provision offline wallet readiness without an authenticated Privy JWT'
    );
  });
});
