/**
 * Rate Limiting and Duplicate Detection
 *
 * Centralized exports for rate limiting functionality
 */

export {
  checkDuplicate,
  cleanupDuplicates,
  clearAllDuplicates,
  clearDuplicates,
  DUPLICATE_DETECTION_CONFIGS,
  getDuplicateStats,
} from '@babylon/shared/src/rate-limiting/duplicate-detector';

export {
  checkRateLimit,
  cleanupRateLimits,
  clearAllRateLimits,
  getRateLimitStatus,
  RATE_LIMIT_CONFIGS,
  resetRateLimit,
} from '@babylon/shared/src/rate-limiting/user-rate-limiter';
export {
  addRateLimitHeaders,
  applyDuplicateDetection,
  applyRateLimit,
  checkRateLimitAndDuplicates,
  duplicateContentError,
  rateLimitError,
} from './middleware';

