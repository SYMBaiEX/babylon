/**
 * Agent0 Service Initialization
 *
 * Initializes Agent0 blockchain reputation functions during app startup.
 * This MUST be called before any agent registration occurs to prevent runtime crashes.
 */

import { logger } from '@babylon/shared';
import { setBlockchainReputationFunctions } from '@babylon/agents/agent0';
import { getAgent0SDK } from '@babylon/agents';
import {
  getOnChainReputation,
  syncOnChainReputation,
} from '@babylon/agents/agent0/reputation/blockchain-reputation-impl';

/**
 * Initialize Agent0 services if enabled
 *
 * Sets up blockchain reputation functions that are required for agent registration.
 * Safe to call multiple times - will only initialize once.
 */
export function initializeAgent0Services(): void {
  if (process.env.AGENT0_ENABLED !== 'true') {
    logger.info(
      'Agent0 integration disabled (AGENT0_ENABLED !== true)',
      undefined,
      'Agent0Init'
    );
    return;
  }

  try {
    const sdk = getAgent0SDK();

    // Set blockchain reputation functions with SDK instance bound
    setBlockchainReputationFunctions({
      getOnChainReputation: (tokenId: number) =>
        getOnChainReputation(sdk, tokenId),
      syncOnChainReputation: (userId: string, tokenId: number) =>
        syncOnChainReputation(sdk, userId, tokenId),
    });

    logger.info(
      'Agent0 blockchain reputation functions initialized successfully',
      undefined,
      'Agent0Init'
    );
  } catch (error) {
    logger.error(
      'Failed to initialize Agent0 services',
      error instanceof Error ? error : new Error(String(error)),
      'Agent0Init'
    );
    // Don't throw - allow app to start even if Agent0 initialization fails
    // Agent registration will fail gracefully with clear error message
  }
}
