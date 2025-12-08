/**
 * Reputation Sync Adapter
 *
 * Adapter that implements the engine's ReputationSyncService interface
 * using the agents package's batchSyncReputationsToERC8004 function.
 * This breaks the circular dependency between engine and agents packages.
 */

import type {
  ReputationSyncOptions,
  ReputationSyncResult,
  ReputationSyncServiceInterface as ReputationSyncService,
} from '@babylon/engine';
import { batchSyncReputationsToERC8004 } from './erc8004-reputation-sync';

/**
 * Adapter implementation that wraps batchSyncReputationsToERC8004
 */
class ReputationSyncAdapter implements ReputationSyncService {
  async batchSync(
    options?: ReputationSyncOptions
  ): Promise<ReputationSyncResult> {
    const result = await batchSyncReputationsToERC8004({
      limit: options?.limit,
      offset: options?.offset,
      forceRecalculate: options?.forceRecalculate,
      prioritizeNew: options?.prioritizeNew,
    });

    return {
      synced: result.synced,
      failed: result.failed,
      total: result.total,
      skipped: result.skipped,
    };
  }
}

/**
 * Create and return the reputation sync adapter instance
 */
export function createReputationSyncAdapter(): ReputationSyncService {
  return new ReputationSyncAdapter();
}
