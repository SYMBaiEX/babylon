/**
 * Wallet utility functions for embedded wallet detection and validation
 */

import type { ConnectedWallet } from '@privy-io/react-auth';

/**
 * Check if a wallet is a Privy embedded wallet
 */
export function isEmbeddedPrivyWallet(
  wallet?: ConnectedWallet | null
): boolean {
  if (!wallet) return false;
  return (
    wallet.walletClientType === 'privy' ||
    wallet.walletClientType === 'privy-v2'
  );
}

/**
 * Check if a wallet is an external wallet (not Privy embedded)
 */
export function isExternalWallet(wallet?: ConnectedWallet | null): boolean {
  if (!wallet) return false;
  return !isEmbeddedPrivyWallet(wallet);
}

/**
 * Find the embedded wallet from a list of wallets
 */
export function findEmbeddedWallet(
  wallets: ConnectedWallet[]
): ConnectedWallet | undefined {
  return wallets.find(isEmbeddedPrivyWallet);
}

/**
 * Find an external wallet from a list of wallets
 */
export function findExternalWallet(
  wallets: ConnectedWallet[]
): ConnectedWallet | undefined {
  return wallets.find(isExternalWallet);
}

/**
 * Error messages for wallet-related issues
 */
export const WALLET_ERROR_MESSAGES = {
  NO_EMBEDDED_WALLET:
    'Gasless registration requires your Babylon embedded wallet. Please ensure your embedded wallet is created.',
  EXTERNAL_WALLET_ONLY:
    'You are using an external wallet. Gas sponsorship is only available with your Babylon embedded wallet.',
  NO_WALLET: 'Please connect a wallet to continue.',
  SPONSOR_FAILED:
    'Unable to sponsor this transaction. Please ensure your Babylon embedded wallet is active.',
  USER_REJECTED: 'Transaction was cancelled in your wallet.',
  INSUFFICIENT_FUNDS:
    'Insufficient funds to cover gas fees. Please use your Babylon embedded wallet for gasless transactions.',
} as const;

/**
 * Get a user-friendly error message for wallet-related errors
 */
export function getWalletErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error);

  if (message.includes('user rejected') || message.includes('user denied')) {
    return WALLET_ERROR_MESSAGES.USER_REJECTED;
  }

  if (message.includes('insufficient funds')) {
    return WALLET_ERROR_MESSAGES.INSUFFICIENT_FUNDS;
  }

  if (message.includes('sponsor')) {
    return WALLET_ERROR_MESSAGES.SPONSOR_FAILED;
  }

  if (
    message.includes('no wallet') ||
    message.includes('wallet not found')
  ) {
    return WALLET_ERROR_MESSAGES.NO_WALLET;
  }

  return error instanceof Error
    ? error.message
    : 'An unknown error occurred with your wallet.';
}

