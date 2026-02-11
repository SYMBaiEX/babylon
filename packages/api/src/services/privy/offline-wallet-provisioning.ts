import { logger } from '@babylon/shared';
import type { User as PrivyUser } from '@privy-io/server-auth';
import { getPrivyClient } from '../../auth-middleware';
import { getPrivyOfflineConfig } from './offline-config';
import { getPrivyNodeClient } from './privy-node';
import {
  type PrivyUserWalletsLite,
  pickEmbeddedEvmWallet,
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
  userJwt: string;
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

function buildUpdatedSigners(
  wallet: WalletWithSigners,
  signerId: string,
  policyId: string
): WalletSigner[] {
  const withoutTarget = wallet.additional_signers.filter(
    (s) => s.signer_id !== signerId
  );
  return [
    ...withoutTarget,
    {
      signer_id: signerId,
      override_policy_ids: [policyId],
    },
  ];
}

export async function ensureOfflineWalletReady({
  privyId,
  userJwt,
}: EnsureOfflineWalletReadyInput): Promise<EnsureOfflineWalletReadyResult> {
  const privyNode = getPrivyNodeClient();
  const privyServer = getPrivyClient();
  const offlineConfig = getPrivyOfflineConfig();

  if (!userJwt || userJwt.trim().length === 0) {
    throw new Error(
      'Cannot provision offline wallet readiness without an authenticated Privy JWT'
    );
  }

  let createdWallet = false;
  let updatedSigner = false;

  const initialPrivyUser = (await privyServer.getUser(
    privyId
  )) as PrivyUserWithWallets;
  let embedded = pickEmbeddedEvmWallet(initialPrivyUser);

  if (!embedded) {
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
    embedded = pickEmbeddedEvmWallet(refreshedPrivyUser);
  }

  if (!embedded) {
    throw new Error(
      'Failed to resolve embedded wallet after provisioning step'
    );
  }

  let wallet = await privyNode.wallets().get(embedded.walletId);
  const signerReady = hasOfflineSignerPolicy(
    wallet,
    offlineConfig.offlineSignerId,
    offlineConfig.offlinePolicyId
  );

  if (!signerReady) {
    updatedSigner = true;
    const additionalSigners = buildUpdatedSigners(
      wallet,
      offlineConfig.offlineSignerId,
      offlineConfig.offlinePolicyId
    );

    await privyNode.wallets().update(embedded.walletId, {
      additional_signers: additionalSigners,
      authorization_context: {
        user_jwts: [userJwt],
        authorization_private_keys: [offlineConfig.authorizationPrivateKey],
      },
    });

    wallet = await privyNode.wallets().get(embedded.walletId);
  }

  const readyAfterUpdate = hasOfflineSignerPolicy(
    wallet,
    offlineConfig.offlineSignerId,
    offlineConfig.offlinePolicyId
  );
  if (!readyAfterUpdate) {
    throw new Error(
      'Offline wallet provisioning failed: signer/policy not attached after update'
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
