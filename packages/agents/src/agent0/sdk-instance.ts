/**
 * Agent0 SDK Instance Management
 *
 * Provides a singleton SDK instance for Agent0 operations.
 * Can be configured via environment variables or by calling setAgent0SDK().
 */

import { SDK } from 'agent0-sdk';

// SDK instance for Agent0 network operations
let sdkInstance: SDK | null = null;

/**
 * Set SDK instance (must be called by consuming application)
 */
export function setAgent0SDK(sdk: SDK): void {
  sdkInstance = sdk;
}

/**
 * Get SDK instance, creating a default one if not set
 */
export function getAgent0SDK(): SDK {
  if (!sdkInstance) {
    // Validate required environment variables
    const requiredVars = {
      AGENT0_RPC_URL: process.env.AGENT0_RPC_URL,
      AGENT0_PRIVATE_KEY: process.env.AGENT0_PRIVATE_KEY,
      PINATA_JWT: process.env.PINATA_JWT,
      BABYLON_GAME_WALLET_ADDRESS: process.env.BABYLON_GAME_WALLET_ADDRESS,
    };

    const missing = Object.entries(requiredVars)
      .filter(([_, value]) => !value)
      .map(([key, _]) => key);

    if (missing.length > 0) {
      throw new Error(
        `Missing required Agent0 environment variables: ${missing.join(', ')}. ` +
          `Please configure these in your .env file before enabling Agent0 integration.`
      );
    }

    // Create a default SDK instance if not set
    const chainId = process.env.AGENT0_NETWORK === 'sepolia' ? 11155111 : 1;
    sdkInstance = new SDK({
      chainId,
      rpcUrl: process.env.AGENT0_RPC_URL || 'https://eth.llamarpc.com',
      signer: process.env.AGENT0_PRIVATE_KEY,
      subgraphUrl: process.env.AGENT0_SUBGRAPH_URL,
      ipfs: (process.env.AGENT0_IPFS_PROVIDER as 'pinata' | 'node') || 'pinata',
      pinataJwt: process.env.PINATA_JWT,
    });
  }
  return sdkInstance;
}
