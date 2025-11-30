/**
 * Rate Limiting Module
 *
 * User-level rate limiting and duplicate content detection utilities.
 * Re-exports from @babylon/shared and @babylon/api for backward compatibility.
 */

// Rate limiting (from shared - no crypto dependency)
export {
  checkRateLimit,
  cleanupRateLimits,
  clearAllRateLimits,
  getRateLimitStatus,
  RATE_LIMIT_CONFIGS,
  resetRateLimit,
} from '@babylon/shared';

// Duplicate detection (from api - uses crypto)
export {
  checkDuplicate,
  cleanupDuplicates,
  clearAllDuplicates,
  clearDuplicates,
  DUPLICATE_DETECTION_CONFIGS,
  getDuplicateStats,
} from '@babylon/api';
