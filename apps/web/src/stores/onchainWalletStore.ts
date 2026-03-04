import { useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  logoUrl: string;
  usdValue: string | null;
}

export interface NativeBalance {
  symbol: string;
  balance: string;
  decimals: number;
  usdValue: string | null;
}

export interface OwnedNft {
  contractAddress: string;
  collectionName: string;
  tokenId: number;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}

export interface NftCollection {
  name: string;
  contractAddress: string;
  items: OwnedNft[];
}

export interface WalletTransaction {
  txHash: string;
  type: 'send' | 'receive' | 'mint' | 'approve' | 'contract_interaction';
  from: string;
  to: string;
  value: string;
  token?: { symbol: string; address: string; decimals: number };
  nft?: {
    collection: string;
    tokenId: string;
    name: string;
    imageUrl: string;
  };
  timestamp: string;
  status: 'confirmed' | 'pending' | 'failed';
  explorerUrl: string;
}

interface OnchainWalletState {
  address: string | null;
  chainId: number | null;

  nativeBalance: NativeBalance | null;
  tokens: TokenBalance[];
  nftCollections: NftCollection[];
  nftTotalCount: number;
  transactions: WalletTransaction[];

  loading: {
    native: boolean;
    tokens: boolean;
    nfts: boolean;
    txs: boolean;
  };
  errors: {
    tokens: string | null;
    nfts: string | null;
    txs: string | null;
  };

  lastFetchedAt: {
    tokens: number | null;
    nfts: number | null;
    txs: number | null;
  };

  fetchPromises: {
    tokens: Promise<void> | null;
    nfts: Promise<void> | null;
    txs: Promise<void> | null;
  };

  setAddress: (address: string | null, chainId: number | null) => void;
  fetchTokens: (address: string, force?: boolean) => Promise<void>;
  fetchNfts: (address: string, force?: boolean) => Promise<void>;
  fetchTransactions: (
    address: string,
    force?: boolean,
    page?: number
  ) => Promise<void>;
  reset: () => void;
}

const TOKEN_CACHE_TTL = 30_000;
const NFT_CACHE_TTL = 60_000;
const TX_CACHE_TTL = 30_000;

const initialLoading = {
  native: false,
  tokens: false,
  nfts: false,
  txs: false,
};
const initialErrors = { tokens: null, nfts: null, txs: null };
const initialFetched = { tokens: null, nfts: null, txs: null };
const initialPromises = { tokens: null, nfts: null, txs: null };

export const useOnchainWalletStore = create<OnchainWalletState>((set, get) => ({
  address: null,
  chainId: null,
  nativeBalance: null,
  tokens: [],
  nftCollections: [],
  nftTotalCount: 0,
  transactions: [],
  loading: { ...initialLoading },
  errors: { ...initialErrors },
  lastFetchedAt: { ...initialFetched },
  fetchPromises: { ...initialPromises },

  setAddress: (address, chainId) => {
    const state = get();
    if (state.address === address && state.chainId === chainId) return;
    set({
      address,
      chainId,
      nativeBalance: null,
      tokens: [],
      nftCollections: [],
      nftTotalCount: 0,
      transactions: [],
      loading: { ...initialLoading },
      errors: { ...initialErrors },
      lastFetchedAt: { ...initialFetched },
      fetchPromises: { ...initialPromises },
    });
  },

  fetchTokens: async (address, force = false) => {
    const state = get();

    if (state.fetchPromises.tokens && state.address === address) {
      return state.fetchPromises.tokens;
    }

    if (
      !force &&
      state.address === address &&
      state.lastFetchedAt.tokens &&
      Date.now() - state.lastFetchedAt.tokens < TOKEN_CACHE_TTL
    ) {
      return;
    }

    const requestedAddress = address;

    const promise = (async () => {
      const isInitial =
        state.lastFetchedAt.tokens === null ||
        state.address !== requestedAddress;
      if (isInitial) {
        set((s) => ({ loading: { ...s.loading, native: true, tokens: true } }));
      }
      set((s) => ({ errors: { ...s.errors, tokens: null } }));

      const response = await fetch(
        `/api/wallet/tokens?address=${encodeURIComponent(requestedAddress)}`
      );

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Failed to fetch tokens: ${response.status} ${body}`);
      }

      const data = await response.json();

      if (get().address !== requestedAddress) return;

      set((s) => ({
        nativeBalance: data.native ?? null,
        tokens: data.tokens ?? [],
        lastFetchedAt: { ...s.lastFetchedAt, tokens: Date.now() },
      }));
    })();

    const wrapped = promise
      .catch((err) => {
        if (get().address === requestedAddress) {
          set((s) => ({
            errors: {
              ...s.errors,
              tokens:
                err instanceof Error ? err.message : 'Failed to fetch tokens',
            },
          }));
        }
      })
      .finally(() => {
        if (get().address === requestedAddress) {
          set((s) => ({
            loading: { ...s.loading, native: false, tokens: false },
            fetchPromises: { ...s.fetchPromises, tokens: null },
          }));
        }
      });

    set((s) => ({
      fetchPromises: { ...s.fetchPromises, tokens: wrapped },
    }));

    return wrapped;
  },

  fetchNfts: async (address, force = false) => {
    const state = get();

    if (state.fetchPromises.nfts && state.address === address) {
      return state.fetchPromises.nfts;
    }

    if (
      !force &&
      state.address === address &&
      state.lastFetchedAt.nfts &&
      Date.now() - state.lastFetchedAt.nfts < NFT_CACHE_TTL
    ) {
      return;
    }

    const requestedAddress = address;

    const promise = (async () => {
      const isInitial =
        state.lastFetchedAt.nfts === null || state.address !== requestedAddress;
      if (isInitial) {
        set((s) => ({ loading: { ...s.loading, nfts: true } }));
      }
      set((s) => ({ errors: { ...s.errors, nfts: null } }));

      const response = await fetch(
        `/api/wallet/nfts?address=${encodeURIComponent(requestedAddress)}`
      );

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Failed to fetch NFTs: ${response.status} ${body}`);
      }

      const data = await response.json();

      if (get().address !== requestedAddress) return;

      set((s) => ({
        nftCollections: data.collections ?? [],
        nftTotalCount: data.totalCount ?? 0,
        lastFetchedAt: { ...s.lastFetchedAt, nfts: Date.now() },
      }));
    })();

    const wrapped = promise
      .catch((err) => {
        if (get().address === requestedAddress) {
          set((s) => ({
            errors: {
              ...s.errors,
              nfts: err instanceof Error ? err.message : 'Failed to fetch NFTs',
            },
          }));
        }
      })
      .finally(() => {
        if (get().address === requestedAddress) {
          set((s) => ({
            loading: { ...s.loading, nfts: false },
            fetchPromises: { ...s.fetchPromises, nfts: null },
          }));
        }
      });

    set((s) => ({
      fetchPromises: { ...s.fetchPromises, nfts: wrapped },
    }));

    return wrapped;
  },

  fetchTransactions: async (address, force = false, _page = 1) => {
    const state = get();

    if (state.fetchPromises.txs && state.address === address) {
      return state.fetchPromises.txs;
    }

    if (
      !force &&
      state.address === address &&
      state.lastFetchedAt.txs &&
      Date.now() - state.lastFetchedAt.txs < TX_CACHE_TTL
    ) {
      return;
    }

    const requestedAddress = address;

    const promise = (async () => {
      const isInitial =
        state.lastFetchedAt.txs === null || state.address !== requestedAddress;
      if (isInitial) {
        set((s) => ({ loading: { ...s.loading, txs: true } }));
      }
      set((s) => ({ errors: { ...s.errors, txs: null } }));

      const response = await fetch(
        `/api/wallet/transactions?address=${encodeURIComponent(requestedAddress)}&page=${_page}&limit=20`
      );

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `Failed to fetch transactions: ${response.status} ${body}`
        );
      }

      const data = await response.json();

      if (get().address !== requestedAddress) return;

      set((s) => ({
        transactions: data.transactions ?? [],
        lastFetchedAt: { ...s.lastFetchedAt, txs: Date.now() },
      }));
    })();

    const wrapped = promise
      .catch((err) => {
        if (get().address === requestedAddress) {
          set((s) => ({
            errors: {
              ...s.errors,
              txs:
                err instanceof Error
                  ? err.message
                  : 'Failed to fetch transactions',
            },
          }));
        }
      })
      .finally(() => {
        if (get().address === requestedAddress) {
          set((s) => ({
            loading: { ...s.loading, txs: false },
            fetchPromises: { ...s.fetchPromises, txs: null },
          }));
        }
      });

    set((s) => ({
      fetchPromises: { ...s.fetchPromises, txs: wrapped },
    }));

    return wrapped;
  },

  reset: () => {
    set({
      address: null,
      chainId: null,
      nativeBalance: null,
      tokens: [],
      nftCollections: [],
      nftTotalCount: 0,
      transactions: [],
      loading: { ...initialLoading },
      errors: { ...initialErrors },
      lastFetchedAt: { ...initialFetched },
      fetchPromises: { ...initialPromises },
    });
  },
}));

const tokenSelector = (s: OnchainWalletState) => ({
  nativeBalance: s.nativeBalance,
  tokens: s.tokens,
  loading: s.loading.tokens || s.loading.native,
  error: s.errors.tokens,
});

export function useOnchainTokens(address?: string | null) {
  const { nativeBalance, tokens, loading, error } = useOnchainWalletStore(
    useShallow(tokenSelector)
  );
  const fetchTokens = useOnchainWalletStore((s) => s.fetchTokens);
  const setAddress = useOnchainWalletStore((s) => s.setAddress);

  useEffect(() => {
    if (address) {
      setAddress(address, null);
      fetchTokens(address);
    }
  }, [address, fetchTokens, setAddress]);

  const refresh = useCallback(() => {
    if (address) return fetchTokens(address, true);
    return Promise.resolve();
  }, [address, fetchTokens]);

  return { nativeBalance, tokens, loading, error, refresh };
}

const nftSelector = (s: OnchainWalletState) => ({
  collections: s.nftCollections,
  totalCount: s.nftTotalCount,
  loading: s.loading.nfts,
  error: s.errors.nfts,
});

export function useOnchainNfts(address?: string | null) {
  const { collections, totalCount, loading, error } = useOnchainWalletStore(
    useShallow(nftSelector)
  );
  const fetchNfts = useOnchainWalletStore((s) => s.fetchNfts);

  useEffect(() => {
    if (address) fetchNfts(address);
  }, [address, fetchNfts]);

  const refresh = useCallback(() => {
    if (address) return fetchNfts(address, true);
    return Promise.resolve();
  }, [address, fetchNfts]);

  return { collections, totalCount, loading, error, refresh };
}

const txSelector = (s: OnchainWalletState) => ({
  transactions: s.transactions,
  loading: s.loading.txs,
  error: s.errors.txs,
});

export function useOnchainTransactions(address?: string | null) {
  const { transactions, loading, error } = useOnchainWalletStore(
    useShallow(txSelector)
  );
  const fetchTransactions = useOnchainWalletStore((s) => s.fetchTransactions);

  useEffect(() => {
    if (address) fetchTransactions(address);
  }, [address, fetchTransactions]);

  const refresh = useCallback(() => {
    if (address) return fetchTransactions(address, true);
    return Promise.resolve();
  }, [address, fetchTransactions]);

  return { transactions, loading, error, refresh };
}

export function useOnchainWalletPolling(
  address?: string | null,
  intervalMs = 30_000
) {
  const fetchTokens = useOnchainWalletStore((s) => s.fetchTokens);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!address) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    fetchTokens(address);

    intervalRef.current = setInterval(() => {
      fetchTokens(address, true);
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [address, intervalMs, fetchTokens]);
}
