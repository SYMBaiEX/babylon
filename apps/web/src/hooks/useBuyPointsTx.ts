import { useCallback } from 'react';

import type { Address } from 'viem';
import { CHAIN } from '@babylon/shared';
import { useSmartWallet } from '@/hooks/useSmartWallet';

/**
 * Input for sending a points payment transaction.
 */
interface PointsPaymentInput {
  /** The recipient address */
  to: Address;
  /** The amount to send in wei (can be bigint, string, or number) */
  amountWei: bigint | string | number;
}

/**
 * Hook for sending points payment transactions via smart wallet.
 *
 * Enables users to purchase points by sending ETH to the points contract.
 * Transactions are executed through the smart wallet, enabling gasless
 * transactions when using an embedded wallet.
 *
 * @returns An object containing the `sendPointsPayment` function for executing
 * point purchase transactions.
 *
 * @example
 * ```tsx
 * const { sendPointsPayment } = useBuyPointsTx();
 *
 * const handlePurchase = async () => {
 *   const txHash = await sendPointsPayment({
 *     to: POINTS_CONTRACT_ADDRESS,
 *     amountWei: parseEther('0.1')
 *   });
 *   console.log('Transaction sent:', txHash);
 * };
 * ```
 */
export function useBuyPointsTx() {
  const { sendSmartWalletTransaction } = useSmartWallet();

  const sendPointsPayment = useCallback(
    async ({ to, amountWei }: PointsPaymentInput) => {
      const normalizedValue =
        typeof amountWei === 'bigint' ? amountWei : BigInt(amountWei);

      return await sendSmartWalletTransaction({
        to,
        value: normalizedValue,
        chain: CHAIN,
      });
    },
    [sendSmartWalletTransaction]
  );

  return { sendPointsPayment };
}
