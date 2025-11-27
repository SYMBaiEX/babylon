/**
 * Rate Limiting Module
 *
 * User-level rate limiting and duplicate content detection utilities.
 * Re-exports from @babylon/shared for backward compatibility.
 */

export {
  checkRateLimit,
  clearAllRateLimits,
  cleanupRateLimits,
  getRateLimitStatus,
  RATE_LIMIT_CONFIGS,
  resetRateLimit,
  checkDuplicate,
  cleanupDuplicates,
  clearAllDuplicates,
  clearDuplicates,
  DUPLICATE_DETECTION_CONFIGS,
  getDuplicateStats,
} from '@babylon/shared';


