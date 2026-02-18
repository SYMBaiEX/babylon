import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockGetUser = mock();
const mockCreateWallets = mock();
const mockWalletGet = mock();

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
    });

    expect(result.offlineWalletReady).toBe(true);
    expect(result.createdWallet).toBe(false);
    expect(result.updatedSigner).toBe(false);
    expect(result.privyWalletId).toBe('wallet-1');
    expect(mockCreateWallets).not.toHaveBeenCalled();
  });

  it('creates wallet when embedded wallet is missing', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'did:privy:user-2',
      wallet: null,
      linkedAccounts: [],
    });
    mockCreateWallets.mockResolvedValueOnce({
      id: 'did:privy:user-2',
      wallet: { ...EMBEDDED_WALLET, id: 'wallet-2' },
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
    });

    expect(result.createdWallet).toBe(true);
    expect(result.updatedSigner).toBe(false);
    expect(result.privyWalletId).toBe('wallet-2');
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockCreateWallets).toHaveBeenCalledTimes(1);
    expect(mockCreateWallets).toHaveBeenCalledWith({
      userId: 'did:privy:user-2',
      wallets: [
        {
          chainType: 'ethereum',
          additionalSigners: [
            {
              signerId: 'offline-signer-id',
              policyIds: ['offline-policy-id'],
            },
          ],
          policyIds: [],
        },
      ],
    });
  });

  it('retries wallet discovery after create when Privy user read is eventually consistent', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      mockGetUser
        .mockResolvedValueOnce({
          id: 'did:privy:user-2b',
          wallet: null,
          linkedAccounts: [],
        })
        .mockResolvedValueOnce({
          id: 'did:privy:user-2b',
          wallet: null,
          linkedAccounts: [],
        })
        .mockResolvedValueOnce({
          id: 'did:privy:user-2b',
          wallet: null,
          linkedAccounts: [
            {
              ...EMBEDDED_WALLET,
              id: 'wallet-2b',
              address: EMBEDDED_WALLET.address,
              type: 'wallet',
            },
          ],
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
        privyId: 'did:privy:user-2b',
      });

      expect(result.createdWallet).toBe(true);
      expect(result.privyWalletId).toBe('wallet-2b');
      expect(mockGetUser).toHaveBeenCalledTimes(3);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('rotates wallet when existing embedded wallet is not offline-ready', async () => {
    mockGetUser
      .mockResolvedValueOnce({
        id: 'did:privy:user-3',
        wallet: { ...EMBEDDED_WALLET, id: 'wallet-old' },
        linkedAccounts: [],
      })
      .mockResolvedValueOnce({
        id: 'did:privy:user-3',
        wallet: { ...EMBEDDED_WALLET, id: 'wallet-old' },
        linkedAccounts: [
          {
            ...EMBEDDED_WALLET,
            id: 'wallet-new',
            address: '0x0000000000000000000000000000000000000002',
            type: 'wallet',
          },
        ],
      });
    mockWalletGet.mockImplementation(async (walletId: string) => {
      if (walletId === 'wallet-old') return { additional_signers: [] };
      if (walletId === 'wallet-new') {
        return {
          additional_signers: [
            {
              signer_id: 'offline-signer-id',
              override_policy_ids: ['offline-policy-id'],
            },
          ],
        };
      }
      return { additional_signers: [] };
    });

    const result = await ensureOfflineWalletReady({
      privyId: 'did:privy:user-3',
    });

    expect(result.createdWallet).toBe(true);
    expect(result.updatedSigner).toBe(false);
    expect(result.privyWalletId).toBe('wallet-new');
    expect(result.walletAddress).toBe(
      '0x0000000000000000000000000000000000000002'
    );
    expect(mockCreateWallets).toHaveBeenCalledTimes(1);
  });

  it('fails when no offline-ready wallet can be resolved after creation', async () => {
    mockGetUser
      .mockResolvedValueOnce({
        id: 'did:privy:user-4',
        wallet: { ...EMBEDDED_WALLET, id: 'wallet-old' },
        linkedAccounts: [],
      })
      .mockResolvedValueOnce({
        id: 'did:privy:user-4',
        wallet: { ...EMBEDDED_WALLET, id: 'wallet-old' },
        linkedAccounts: [],
      });
    mockWalletGet.mockResolvedValue({ additional_signers: [] });

    await expect(
      ensureOfflineWalletReady({
        privyId: 'did:privy:user-4',
      })
    ).rejects.toThrow(
      'Failed to resolve offline-ready embedded wallet after provisioning step'
    );
  });
});
