/**
 * Block Explorer URL Utilities
 *
 * Provides chain-aware URLs for viewing transactions on block explorers.
 * Supports Ethereum mainnet, Sepolia testnet, Base mainnet, and Base Sepolia.
 */

import { CHAIN } from '@babylon/shared';

/**
 * Get the block explorer URL for a transaction hash based on the current chain.
 *
 * @param txHash - The transaction hash to link to
 * @returns The full URL to view the transaction, or empty string for local chains
 *
 * @example
 * ```typescript
 * const url = getExplorerTxUrl('0x123...');
 * // Returns 'https://basescan.org/tx/0x123...' on Base mainnet
 * // Returns 'https://sepolia.basescan.org/tx/0x123...' on Base Sepolia
 * ```
 */
export function getExplorerTxUrl(txHash: string): string {
  const chainId = CHAIN.id;
  switch (chainId) {
    case 1: // Ethereum Mainnet
      return `https://etherscan.io/tx/${txHash}`;
    case 11155111: // Ethereum Sepolia
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    case 8453: // Base Mainnet
      return `https://basescan.org/tx/${txHash}`;
    case 84532: // Base Sepolia
      return `https://sepolia.basescan.org/tx/${txHash}`;
    case 31337: // Hardhat/Local - no explorer
      return '';
    default:
      // Fallback to Base Sepolia for unknown chains
      return `https://sepolia.basescan.org/tx/${txHash}`;
  }
}

/**
 * Get the base block explorer URL for the current chain (without transaction path).
 *
 * @returns The base URL of the block explorer, or empty string for local chains
 */
export function getExplorerBaseUrl(): string {
  const chainId = CHAIN.id;
  switch (chainId) {
    case 1:
      return 'https://etherscan.io';
    case 11155111:
      return 'https://sepolia.etherscan.io';
    case 8453:
      return 'https://basescan.org';
    case 84532:
      return 'https://sepolia.basescan.org';
    case 31337:
      return '';
    default:
      return 'https://sepolia.basescan.org';
  }
}

/**
 * Get the display name for the current chain's block explorer.
 *
 * @returns Human-readable name like "BaseScan" or "Etherscan"
 */
export function getExplorerName(): string {
  const chainId = CHAIN.id;
  switch (chainId) {
    case 1:
    case 11155111:
      return 'Etherscan';
    case 8453:
    case 84532:
      return 'BaseScan';
    case 31337:
      return 'Local';
    default:
      return 'BaseScan';
  }
}
