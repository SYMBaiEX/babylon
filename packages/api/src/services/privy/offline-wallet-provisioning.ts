import { logger } from '@babylon/shared';
import type { User as PrivyUser } from '@privy-io/server-auth';
import { getPrivyClient } from '../../auth-middleware';
import { getPrivyOfflineConfig } from './offline-config';
import { getPrivyNodeClient } from './privy-node';
import {
  listEmbeddedEvmWallets,
  type PrivyUserWalletsLite,
} from './user-wallets';

type PrivyUserWithWallets = PrivyUser & PrivyUserWalletsLite;
type WalletSigner = {
  signer_id: string;
  override_policy_ids?: string[];
};
type WalletWithSigners = {
  additional_signers: WalletSigner[];
};

export type EnsureOfflineWalletReadyInput = {
  privyId: string;
};

export type EnsureOfflineWalletReadyResult = {
  privyWalletId: string;
  walletAddress: string;
  offlineWalletReady: true;
  createdWallet: boolean;
  updatedSigner: boolean;
};

function hasOfflineSignerPolicy(
  wallet: WalletWithSigners,
  signerId: string,
  policyId: string
): boolean {
  const signer = wallet.additional_signers.find(
    (s) => s.signer_id === signerId
  );
  if (!signer) return false;
  return (signer.override_policy_ids ?? []).includes(policyId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findReadyWalletWithRetry(
  walletIds: string[],
  privyNode: ReturnType<typeof getPrivyNodeClient>,
  signerId: string,
  policyId: string
): Promise<string | null> {
  if (walletIds.length === 0) return null;

  const isTest = process.env.NODE_ENV === 'test';
  const maxAttempts = isTest ? 1 : 8;
  const delayMs = isTest ? 0 : 250;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const walletId of walletIds) {
      const wallet = await privyNode.wallets().get(walletId);
      if (hasOfflineSignerPolicy(wallet, signerId, policyId)) {
        return walletId;
      }
    }

    if (attempt < maxAttempts - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return null;
}

export async function ensureOfflineWalletReady({
  privyId,
}: EnsureOfflineWalletReadyInput): Promise<EnsureOfflineWalletReadyResult> {
  const privyNode = getPrivyNodeClient();
  const privyServer = getPrivyClient();
  const offlineConfig = getPrivyOfflineConfig();

  let createdWallet = false;
  const updatedSigner = false;

  const initialPrivyUser = (await privyServer.getUser(
    privyId
  )) as PrivyUserWithWallets;
  const initialWallets = listEmbeddedEvmWallets(initialPrivyUser);
  let embedded: (typeof initialWallets)[number] | null =
    initialWallets[0] ?? null;

  for (const candidate of initialWallets) {
    const wallet = await privyNode.wallets().get(candidate.walletId);
    const isReady = hasOfflineSignerPolicy(
      wallet,
      offlineConfig.offlineSignerId,
      offlineConfig.offlinePolicyId
    );

    if (!isReady) continue;

    logger.info(
      'Offline wallet is ready for delegated transactions',
      {
        privyId,
        walletId: candidate.walletId,
        walletAddress: candidate.address.toLowerCase(),
        createdWallet: false,
        updatedSigner: false,
      },
      'ensureOfflineWalletReady'
    );

    return {
      privyWalletId: candidate.walletId,
      walletAddress: candidate.address.toLowerCase(),
      offlineWalletReady: true,
      createdWallet: false,
      updatedSigner: false,
    };
  }

  // No embedded wallet or incompatible embedded wallet:
  // create a fresh wallet with signer+policy attached instead of mutating existing wallet.
  {
    createdWallet = true;
    await privyServer.createWallets({
      userId: privyId,
      wallets: [
        {
          chainType: 'ethereum',
          additionalSigners: [
            {
              signerId: offlineConfig.offlineSignerId,
              policyIds: [offlineConfig.offlinePolicyId],
            },
          ],
          policyIds: [],
        },
      ],
    });

    const refreshedPrivyUser = (await privyServer.getUser(
      privyId
    )) as PrivyUserWithWallets;
    const refreshedWallets = listEmbeddedEvmWallets(refreshedPrivyUser);
    const initialWalletIds = new Set(initialWallets.map((w) => w.walletId));
    const newWalletCandidates = refreshedWallets.filter(
      (wallet) => !initialWalletIds.has(wallet.walletId)
    );

    const candidateWallets =
      newWalletCandidates.length > 0 ? newWalletCandidates : refreshedWallets;

    const readyWalletId = await findReadyWalletWithRetry(
      candidateWallets.map((wallet) => wallet.walletId),
      privyNode,
      offlineConfig.offlineSignerId,
      offlineConfig.offlinePolicyId
    );
    if (readyWalletId) {
      embedded =
        candidateWallets.find((wallet) => wallet.walletId === readyWalletId) ??
        null;
    }
  }

  if (!embedded) {
    throw new Error(
      'Failed to resolve offline-ready embedded wallet after provisioning step'
    );
  }

  const createdWalletState = await privyNode.wallets().get(embedded.walletId);
  const readyAfterCreate = hasOfflineSignerPolicy(
    createdWalletState,
    offlineConfig.offlineSignerId,
    offlineConfig.offlinePolicyId
  );
  if (!readyAfterCreate) {
    throw new Error(
      'Offline wallet provisioning failed: signer/policy not attached on newly created wallet'
    );
  }

  logger.info(
    'Offline wallet is ready for delegated transactions',
    {
      privyId,
      walletId: embedded.walletId,
      walletAddress: embedded.address.toLowerCase(),
      createdWallet,
      updatedSigner,
    },
    'ensureOfflineWalletReady'
  );

  return {
    privyWalletId: embedded.walletId,
    walletAddress: embedded.address.toLowerCase(),
    offlineWalletReady: true,
    createdWallet,
    updatedSigner,
  };
}
