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

function getRetryConfig(): { maxAttempts: number; delayMs: number } {
  const isTest = process.env.NODE_ENV === 'test';
  return {
    maxAttempts: isTest ? 1 : 8,
    delayMs: isTest ? 0 : 250,
  };
}

function findNewWalletCandidates(
  wallets: Array<{ walletId: string; address: `0x${string}` }>,
  initialWalletIds: Set<string>
): Array<{ walletId: string; address: `0x${string}` }> {
  return wallets.filter((wallet) => !initialWalletIds.has(wallet.walletId));
}

async function resolveCandidateWalletsAfterCreateWithRetry(
  privyId: string,
  initialWalletIds: Set<string>,
  privyServer: ReturnType<typeof getPrivyClient>,
  immediateWallets: Array<{ walletId: string; address: `0x${string}` }>
): Promise<Array<{ walletId: string; address: `0x${string}` }>> {
  const immediateCandidates = findNewWalletCandidates(
    immediateWallets,
    initialWalletIds
  );
  if (immediateCandidates.length > 0) {
    logger.info(
      'Detected new embedded wallet(s) immediately after createWallets',
      {
        privyId,
        candidateWalletIds: immediateCandidates.map((w) => w.walletId),
        observedWalletIds: immediateWallets.map((w) => w.walletId),
      },
      'ensureOfflineWalletReady'
    );
    return immediateCandidates;
  }

  const { maxAttempts, delayMs } = getRetryConfig();
  let lastObservedWalletIds: string[] = immediateWallets.map((w) => w.walletId);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const refreshedPrivyUser = (await privyServer.getUser(
      privyId
    )) as PrivyUserWithWallets;
    const refreshedWallets = listEmbeddedEvmWallets(refreshedPrivyUser);
    lastObservedWalletIds = refreshedWallets.map((w) => w.walletId);

    const newWalletCandidates = findNewWalletCandidates(
      refreshedWallets,
      initialWalletIds
    );
    if (newWalletCandidates.length > 0) {
      logger.info(
        'Detected new embedded wallet(s) after retry',
        {
          privyId,
          attempt: attempt + 1,
          maxAttempts,
          candidateWalletIds: newWalletCandidates.map((w) => w.walletId),
          observedWalletIds: lastObservedWalletIds,
        },
        'ensureOfflineWalletReady'
      );
      return newWalletCandidates;
    }

    if (attempt < maxAttempts - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  logger.warn(
    'No new embedded wallet detected after createWallets retries',
    {
      privyId,
      maxAttempts,
      initialWalletIds: Array.from(initialWalletIds),
      observedWalletIds: lastObservedWalletIds,
    },
    'ensureOfflineWalletReady'
  );

  return [];
}

async function findReadyWalletWithRetry(
  privyId: string,
  walletIds: string[],
  privyNode: ReturnType<typeof getPrivyNodeClient>,
  signerId: string,
  policyId: string
): Promise<string | null> {
  if (walletIds.length === 0) return null;

  const { maxAttempts, delayMs } = getRetryConfig();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const notReadyWalletIds: string[] = [];

    for (const walletId of walletIds) {
      const wallet = await privyNode.wallets().get(walletId);
      if (hasOfflineSignerPolicy(wallet, signerId, policyId)) {
        if (attempt > 0) {
          logger.info(
            'Offline signer policy detected after retry',
            {
              privyId,
              walletId,
              attempt: attempt + 1,
              maxAttempts,
            },
            'ensureOfflineWalletReady'
          );
        }
        return walletId;
      }
      notReadyWalletIds.push(walletId);
    }

    if (attempt < maxAttempts - 1 && delayMs > 0) {
      await sleep(delayMs);
    }

    if (attempt === maxAttempts - 1) {
      logger.warn(
        'Offline signer policy missing after retries on candidate wallet(s)',
        {
          privyId,
          walletIds: notReadyWalletIds,
          signerId,
          policyId,
          maxAttempts,
        },
        'ensureOfflineWalletReady'
      );
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
  logger.info(
    'Checking embedded wallet readiness',
    {
      privyId,
      initialEmbeddedWalletCount: initialWallets.length,
      initialEmbeddedWalletIds: initialWallets.map((w) => w.walletId),
    },
    'ensureOfflineWalletReady'
  );
  let embedded: (typeof initialWallets)[number] | null =
    initialWallets[0] ?? null;
  const initialUnreadyWalletIds: string[] = [];

  for (const candidate of initialWallets) {
    const wallet = await privyNode.wallets().get(candidate.walletId);
    const isReady = hasOfflineSignerPolicy(
      wallet,
      offlineConfig.offlineSignerId,
      offlineConfig.offlinePolicyId
    );

    if (!isReady) {
      initialUnreadyWalletIds.push(candidate.walletId);
      continue;
    }

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
    if (initialUnreadyWalletIds.length > 0) {
      logger.info(
        'Existing embedded wallet(s) are not offline-ready; creating a new wallet',
        {
          privyId,
          unreadyWalletIds: initialUnreadyWalletIds,
        },
        'ensureOfflineWalletReady'
      );
    }

    createdWallet = true;
    const createdUser = (await privyServer.createWallets({
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
    })) as PrivyUserWithWallets;

    const initialWalletIds = new Set(initialWallets.map((w) => w.walletId));
    const immediateWallets = createdUser
      ? listEmbeddedEvmWallets(createdUser)
      : [];
    logger.info(
      'createWallets completed for offline provisioning',
      {
        privyId,
        initialWalletIds: Array.from(initialWalletIds),
        observedWalletIdsAfterCreate: immediateWallets.map((w) => w.walletId),
      },
      'ensureOfflineWalletReady'
    );
    const candidateWallets = await resolveCandidateWalletsAfterCreateWithRetry(
      privyId,
      initialWalletIds,
      privyServer,
      immediateWallets
    );

    if (candidateWallets.length === 0) {
      logger.warn(
        'Unable to resolve a newly created embedded wallet candidate',
        {
          privyId,
          initialWalletIds: Array.from(initialWalletIds),
          observedWalletIdsAfterCreate: immediateWallets.map((w) => w.walletId),
        },
        'ensureOfflineWalletReady'
      );
      throw new Error(
        'Failed to resolve offline-ready embedded wallet after provisioning step'
      );
    }

    const readyWalletId = await findReadyWalletWithRetry(
      privyId,
      candidateWallets.map((wallet) => wallet.walletId),
      privyNode,
      offlineConfig.offlineSignerId,
      offlineConfig.offlinePolicyId
    );
    if (!readyWalletId) {
      logger.warn(
        'New wallet candidate(s) found but signer/policy still missing',
        {
          privyId,
          candidateWalletIds: candidateWallets.map((w) => w.walletId),
        },
        'ensureOfflineWalletReady'
      );
      throw new Error(
        'Offline wallet provisioning failed: signer/policy not attached on newly created wallet'
      );
    }

    embedded =
      candidateWallets.find((wallet) => wallet.walletId === readyWalletId) ??
      null;
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
