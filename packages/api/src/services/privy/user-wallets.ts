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
  const client = wallet.walletClientType ?? wallet.wallet_client ?? null;
  return (
    client === 'privy' ||
    // Some payload variants omit wallet_client(_type) for embedded wallets; in practice
    // these appear as the top-level `user.wallet`. For linked accounts, we require
    // an explicit 'privy' client marker to avoid selecting external wallets.
    (client === null && Boolean(wallet.id))
  );
}

export function pickEmbeddedEvmWallet(
  user: PrivyUserWalletsLite
): { walletId: string; address: Address } | null {
  const candidates: Array<{ wallet: PrivyWalletLite; source: 'primary' | 'linked' }> =
    [];
  if (user.wallet) candidates.push({ wallet: user.wallet, source: 'primary' });
  for (const acc of user.linkedAccounts ?? []) {
    if (acc?.type === 'wallet') candidates.push({ wallet: acc, source: 'linked' });
  }
  for (const acc of user.linked_accounts ?? []) {
    if (acc?.type === 'wallet') candidates.push({ wallet: acc, source: 'linked' });
  }

  for (const { wallet, source } of candidates) {
    if (!wallet?.id || typeof wallet.id !== 'string') continue;
    if (!wallet.address || typeof wallet.address !== 'string') continue;
    if (!isEthereumWallet(wallet)) continue;
    if (source === 'linked') {
      // For linked accounts, only accept explicit 'privy' client markers.
      if (
        wallet.walletClientType !== 'privy' &&
        wallet.wallet_client !== 'privy'
      ) {
        continue;
      }
    }
    if (!isPrivyEmbeddedWallet(wallet)) continue;
    return {
      walletId: wallet.id,
      address: wallet.address.toLowerCase() as Address,
    };
  }

  return null;
}
