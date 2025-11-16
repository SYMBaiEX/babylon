import { useCallback, useMemo } from 'react';

import type { SmartWalletClientType } from '@privy-io/react-auth/smart-wallets';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import type { Hex } from 'viem';

import {
  WALLET_ERROR_MESSAGES,
  getWalletErrorMessage,
} from '@/lib/wallet-utils';
import { logger } from '@/lib/logger';

type SmartWalletTxInput = Parameters<
  SmartWalletClientType['sendTransaction']
>[0];
type SmartWalletTxOptions = Parameters<
  SmartWalletClientType['sendTransaction']
>[1];

/**
 * Return type for the useSmartWallet hook.
 */
interface UseSmartWalletResult {
  /** The Privy smart wallet client instance */
  client?: SmartWalletClientType;
  /** The smart wallet address (if available) */
  smartWalletAddress?: string;
  /** Whether the smart wallet is ready for transactions */
  smartWalletReady: boolean;
  /** Function to send a transaction via the smart wallet */
  sendSmartWalletTransaction: (
    input: SmartWalletTxInput,
    options?: SmartWalletTxOptions
  ) => Promise<Hex>;
}

/**
 * Hook for managing smart wallet operations.
 * 
 * Provides access to Privy's smart wallet functionality, enabling gasless
 * transactions when using an embedded wallet. The smart wallet is a contract
 * wallet that can be sponsored by Privy's paymaster, allowing users to
 * interact with the blockchain without holding native tokens.
 * 
 * @returns Smart wallet state and transaction sending function.
 * 
 * @example
 * ```tsx
 * const { smartWalletReady, sendSmartWalletTransaction } = useSmartWallet();
 * 
 * const handleTransaction = async () => {
 *   if (!smartWalletReady) {
 *     throw new Error('Smart wallet not ready');
 *   }
 *   
 *   const txHash = await sendSmartWalletTransaction({
 *     to: '0x...',
 *     value: parseEther('0.1'),
 *     data: '0x...'
 *   });
 * };
 * ```
 */
export function useSmartWallet(): UseSmartWalletResult {
  const { client } = useSmartWallets();
  logger.debug('Smart wallet client initialized', { hasClient: !!client });
  const typedClient = client as SmartWalletClientType | undefined;
  const smartWalletAddress = typedClient?.account?.address;
  const smartWalletReady = useMemo(
    () => Boolean(typedClient && smartWalletAddress),
    [typedClient, smartWalletAddress]
  );

  const sendSmartWalletTransaction = useCallback(
    async (
      input: SmartWalletTxInput,
      options?: SmartWalletTxOptions
    ): Promise<Hex> => {
      if (!typedClient || !smartWalletAddress) {
        throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
      }

      try {
        return await typedClient.sendTransaction(input, options);
      } catch (error) {
        throw new Error(getWalletErrorMessage(error));
      }
    },
    [typedClient, smartWalletAddress]
  );

  return {
    client: typedClient,
    smartWalletAddress,
    smartWalletReady,
    sendSmartWalletTransaction,
  };
}
