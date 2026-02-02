import type { Address } from 'viem';

export type PrivyWalletLite = {
  id?: string | null;
  address?: string | null;
  chainType?: string | null;
  chain_type?: string | null;
  walletClientType?: string | null;
  wallet_client?: string | null;
  type?: string | null;
};

export type PrivyUserWalletsLite = {
  wallet?: PrivyWalletLite | null;
  linkedAccounts?: PrivyWalletLite[] | null;
  linked_accounts?: PrivyWalletLite[] | null;
};

function isEthereumWallet(wallet: PrivyWalletLite): boolean {
  const chain = wallet.chainType ?? wallet.chain_type ?? null;
  if (chain && chain !== 'ethereum') return false;
  return true;
}

function isPrivyEmbeddedWallet(wallet: PrivyWalletLite): boolean {
  return (
    wallet.walletClientType === 'privy' ||
    wallet.wallet_client === 'privy' ||
    // In some payloads, embedded wallets appear without wallet_client_type but always have an id.
    Boolean(wallet.id)
  );
}

export function pickEmbeddedEvmWallet(
  user: PrivyUserWalletsLite
): { walletId: string; address: Address } | null {
  const candidates: PrivyWalletLite[] = [];
  if (user.wallet) candidates.push(user.wallet);
  for (const acc of user.linkedAccounts ?? []) {
    if (acc?.type === 'wallet') candidates.push(acc);
  }
  for (const acc of user.linked_accounts ?? []) {
    if (acc?.type === 'wallet') candidates.push(acc);
  }

  for (const wallet of candidates) {
    if (!wallet?.id || typeof wallet.id !== 'string') continue;
    if (!wallet.address || typeof wallet.address !== 'string') continue;
    if (!isEthereumWallet(wallet)) continue;
    if (!isPrivyEmbeddedWallet(wallet)) continue;
    return {
      walletId: wallet.id,
      address: wallet.address.toLowerCase() as Address,
    };
  }

  return null;
}
