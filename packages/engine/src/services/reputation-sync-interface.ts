/**
 * Reputation Sync Interface
 *
 * Optional interface for syncing reputation to ERC-8004.
 * Allows engine to call reputation sync without depending on agents package.
 * Implementations can be provided by the agents package or other consumers.
 */

export interface ReputationSyncResult {
  synced: number;
  failed: number;
  total: number;
  skipped?: number;
}

export interface ReputationSyncOptions {
  limit?: number;
  offset?: number;
  forceRecalculate?: boolean;
  prioritizeNew?: boolean;
}

export interface ReputationSyncService {
  /**
   * Batch sync reputation for multiple users
   */
  batchSync(options?: ReputationSyncOptions): Promise<ReputationSyncResult>;
}

/**
 * Global reputation sync service provider
 * Can be set by consumers (e.g., agents package) to enable reputation syncing
 */
let reputationSyncService: ReputationSyncService | null = null;

/**
 * Set the reputation sync service provider
 */
export function setReputationSyncService(service: ReputationSyncService | null): void {
  reputationSyncService = service;
}

/**
 * Get the reputation sync service provider
 */
export function getReputationSyncService(): ReputationSyncService | null {
  return reputationSyncService;
}

/**
 * Sync reputation if service is available
 */
export async function syncReputationIfAvailable(
  options?: ReputationSyncOptions
): Promise<ReputationSyncResult | null> {
  if (!reputationSyncService) {
    return null;
  }
  return await reputationSyncService.batchSync(options);
}

