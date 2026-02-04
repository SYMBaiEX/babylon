import { WALLET_ERROR_MESSAGES } from '@babylon/shared';
import { useSendTransaction } from '@privy-io/react-auth';
import { useCallback } from 'react';
import type { Address } from 'viem';
import { useAuth } from '@/hooks/useAuth';

interface PointsPaymentInput {
  to: Address;
  amountWei: bigint | string | number;
}

/**
 * Hook for sending points payment transactions.
 *
 * Uses Privy's client-side sponsored transaction flow with embedded wallets.
 * Gas is sponsored by Privy (sponsor: true), but the wallet must hold the transferred ETH value.
 */
export function useBuyPointsTx() {
  const { embeddedWalletReady, embeddedWalletAddress } = useAuth();
  const { sendTransaction } = useSendTransaction();

  const sendPointsPayment = useCallback(
    async ({ to, amountWei }: PointsPaymentInput) => {
      if (!embeddedWalletReady || !embeddedWalletAddress) {
        throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
      }

      const normalizedValue =
        typeof amountWei === 'bigint' ? amountWei : BigInt(amountWei);

      // Use Privy's client-side sendTransaction with gas sponsorship
      const result = await sendTransaction(
        {
          to,
          value: normalizedValue,
        },
        {
          sponsor: true, // Privy covers gas fees
        }
      );

      return result.hash;
    },
    [embeddedWalletReady, embeddedWalletAddress, sendTransaction]
  );

  return { sendPointsPayment };
}
