import { useCallback } from 'react';

import type { Address } from 'viem';

import { useSmartWallet } from '@/hooks/useSmartWallet';
import { CHAIN } from '@/constants/chains';

interface PointsPaymentInput {
  to: Address;
  amountWei: bigint | string | number;
}

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
