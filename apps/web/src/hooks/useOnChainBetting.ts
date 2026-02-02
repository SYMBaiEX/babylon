import { getContractAddresses } from '@babylon/contracts';
import { logger } from '@babylon/shared';
import { useCallback, useState } from 'react';
import {
  buySharesOnchainAction,
  sellSharesOnchainAction,
} from '@/app/_actions/onchain';

/**
 * Result of an on-chain betting transaction.
 */
export interface OnChainBetResult {
  /** Transaction hash */
  txHash: string;
  /** Number of shares purchased/sold */
  shares: number;
  /** Gas used (if available) */
  gasUsed?: string;
}

// Get contract addresses for current network (localnet or testnet/mainnet)
const { diamond: DIAMOND_ADDRESS, network: NETWORK } = getContractAddresses();

/**
 * Hook for on-chain prediction market betting.
 *
 * Uses a server-side sponsored transaction flow (Privy embedded wallet + server actions).
 */
export function useOnChainBetting() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buyShares = useCallback(
    async (
      marketId: string,
      outcome: 'YES' | 'NO',
      numShares: number
    ): Promise<OnChainBetResult> => {
      setLoading(true);
      setError(null);

      try {
        logger.info('Buying shares on-chain', {
          network: NETWORK,
          diamond: DIAMOND_ADDRESS,
          marketId,
          outcome,
          numShares,
        });

        const { txHash } = await buySharesOnchainAction({
          marketId,
          outcome,
          numShares,
        });

        return { txHash, shares: numShares };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Buy failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const sellShares = useCallback(
    async (
      marketId: string,
      outcome: 'YES' | 'NO',
      numShares: number
    ): Promise<OnChainBetResult> => {
      setLoading(true);
      setError(null);

      try {
        logger.info('Selling shares on-chain', {
          network: NETWORK,
          diamond: DIAMOND_ADDRESS,
          marketId,
          outcome,
          numShares,
        });

        const { txHash } = await sellSharesOnchainAction({
          marketId,
          outcome,
          numShares,
        });

        return { txHash, shares: numShares };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sell failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    buyShares,
    sellShares,
    loading,
    error,
    walletReady: true,
  };
}
