/**
 * Perpetuals Settlement Mode Configuration
 *
 * Currently defaults to offchain mode for fast MVP trading.
 * Hybrid/onchain modes reserved for future use.
 */

import {
  DIAMOND_ADDRESS,
  getSettlementMode,
  getHybridBatchInterval,
  getHybridBatchSize,
} from './config';

export type PerpSettlementMode = 'offchain' | 'onchain' | 'hybrid';

export interface PerpModeConfig {
  settlementMode: PerpSettlementMode;
  diamondAddress?: string;
  hybridBatchInterval: number;
  hybridBatchSize: number;
}

export const PERP_CONFIG: PerpModeConfig = {
  settlementMode: getSettlementMode(),
  diamondAddress: DIAMOND_ADDRESS,
  hybridBatchInterval: getHybridBatchInterval(),
  hybridBatchSize: getHybridBatchSize(),
};

/** Check if on-chain settlement is enabled (onchain or hybrid mode) */
export function isOnChainEnabled(): boolean {
  return PERP_CONFIG.settlementMode !== 'offchain';
}

/** Check if using hybrid mode */
export function isHybridMode(): boolean {
  return PERP_CONFIG.settlementMode === 'hybrid';
}
