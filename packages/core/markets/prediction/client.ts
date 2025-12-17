/**
 * Client-safe prediction market exports
 *
 * This module exports utilities that are safe for browser/client-side use.
 * It does NOT include any server-only dependencies like @babylon/db.
 *
 * Use this import for React client components:
 * import { PredictionPricing } from '@babylon/core/markets/prediction/client';
 */

export * from './pricing';
export * from './types';
