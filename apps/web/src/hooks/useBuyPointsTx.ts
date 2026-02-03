import { WALLET_ERROR_MESSAGES } from '@babylon/shared';
import { useCallback } from 'react';
import type { Address } from 'viem';
import { sendSponsoredEthTransferAction } from '@/app/_actions/onchain';
import { useAuth } from '@/hooks/useAuth';

interface PointsPaymentInput {
  to: Address;
  amountWei: bigint | string | number;
}

/**
 * Hook for sending points payment transactions.
 *
 * Uses a server-side sponsored transaction flow (Privy embedded wallet + server actions).
 * Note: Sponsorship covers gas, but the wallet must still hold the transferred value.
 */
export function useBuyPointsTx() {
  const { embeddedWalletReady, embeddedWalletAddress, getAccessToken } =
    useAuth();

  const sendPointsPayment = useCallback(
    async ({ to, amountWei }: PointsPaymentInput) => {
      if (!embeddedWalletReady || !embeddedWalletAddress) {
        throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
      }
      const normalizedValue =
        typeof amountWei === 'bigint' ? amountWei : BigInt(amountWei);

      const userJwt = await getAccessToken().catch(() => null);
      if (!userJwt) {
        throw new Error('Authentication required');
      }

      const { txHash } = await sendSponsoredEthTransferAction({
        to,
        amountWei: normalizedValue.toString(),
        userJwt,
      });
      return txHash;
    },
    [embeddedWalletReady, embeddedWalletAddress, getAccessToken]
  );

  return { sendPointsPayment };
}
