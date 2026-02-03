import { CHAIN, WALLET_ERROR_MESSAGES } from '@babylon/shared';
import { useFundWallet } from '@privy-io/react-auth';
import { useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  type Address,
  createPublicClient,
  formatEther,
  http,
  isAddress,
} from 'viem';

interface EnsureFundsOptions {
  signal?: AbortSignal;
  maxAttempts?: number;
  pollInterval?: number;
  showToasts?: boolean;
}

interface UseWalletFundingResult {
  ensureFunds: (
    walletAddress: string | undefined,
    requiredAmountWei: bigint,
    options?: EnsureFundsOptions
  ) => Promise<boolean>;
}

/**
 * Ensure the user's embedded wallet holds enough native token to cover a value transfer.
 *
 * Note: Gas can be sponsored server-side, but the wallet must still hold the transferred value.
 */
export function useWalletFunding(): UseWalletFundingResult {
  const { fundWallet } = useFundWallet();

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: CHAIN,
        transport: http(),
      }),
    []
  );

  const toastIdRef = useRef<string | number | null>(null);

  const getBalance = useCallback(
    async (address: Address) => {
      return await publicClient.getBalance({ address });
    },
    [publicClient]
  );

  const ensureFunds = useCallback(
    async (
      walletAddress: string | undefined,
      requiredAmountWei: bigint,
      options?: EnsureFundsOptions
    ): Promise<boolean> => {
      const {
        signal,
        maxAttempts = 30,
        pollInterval = 1000,
        showToasts = true,
      } = options ?? {};

      if (!walletAddress || !isAddress(walletAddress)) {
        throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
      }
      const address = walletAddress.toLowerCase() as Address;

      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }

      const currentBalance = await getBalance(address);
      if (currentBalance >= requiredAmountWei) return true;

      const deficit = requiredAmountWei - currentBalance;

      await fundWallet({
        address,
        options: {
          chain: CHAIN,
          amount: formatEther(deficit),
          asset: 'native-currency',
        },
      });

      if (showToasts) {
        toastIdRef.current = toast.info('Waiting for deposit to settle...');
      }

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal?.aborted) {
          if (toastIdRef.current && showToasts) {
            toast.dismiss(toastIdRef.current);
            toastIdRef.current = null;
          }
          throw new Error('Operation cancelled');
        }

        const updatedBalance = await getBalance(address);
        if (updatedBalance >= requiredAmountWei) {
          if (showToasts) toast.success('Funds received!');
          return true;
        }

        if (attempt < maxAttempts - 1) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, pollInterval);
            const abortHandler = () => {
              clearTimeout(timeout);
              resolve();
            };
            if (signal) {
              signal.addEventListener('abort', abortHandler, { once: true });
            }
          });
        }
      }

      if (showToasts) toast.error('Deposit is taking longer than expected');
      throw new Error(
        'Funds are still settling. Please try again in a moment once the deposit arrives.'
      );
    },
    [fundWallet, getBalance]
  );

  return { ensureFunds };
}
