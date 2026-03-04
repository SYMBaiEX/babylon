import { CHAIN_ID } from '../constants';

/**
 * Returns an Etherscan/Basescan explorer URL for a given transaction hash.
 * Covers all chains supported by the platform.
 */
export function getTxExplorerUrl(txHash: string): string {
  switch (CHAIN_ID) {
    case 1:
      return `https://etherscan.io/tx/${txHash}`;
    case 11155111:
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    case 8453:
      return `https://basescan.org/tx/${txHash}`;
    case 84532:
      return `https://sepolia.basescan.org/tx/${txHash}`;
    default:
      return '';
  }
}
