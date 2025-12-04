/**
 * Babylon API Package
 *
 * Provides API middleware and utilities for authentication, authorization,
 * and common API patterns.
 */

// Re-export auth types from shared
export type { AuthenticatedUser } from '@babylon/shared';
// Logger
export {
  extractErrorMessage,
  type LogData,
  Logger,
  type LogLevel,
  logger,
} from '@babylon/shared';
// Admin Middleware
export { isUserAdmin, requireAdmin } from './admin-middleware';
// Agent Authentication
export {
  type AgentSession,
  cleanupExpiredSessions,
  createAgentSession,
  getSessionDuration,
  type SessionStore,
  setSessionStore,
  verifyAgentCredentials,
  verifyAgentSession,
} from './agent-auth';
// Auth Middleware
export {
  type AuthenticationError,
  authErrorResponse,
  authenticate,
  authenticateUser,
  authenticateWithDbUser,
  getPrivyClient,
  isAuthenticationError,
  optionalAuth,
  optionalAuthFromHeaders,
} from './auth-middleware';
// Cache
export {
  CACHE_KEYS,
  type CacheOptions,
  cachedDb,
  clearAllCache,
  DEFAULT_TTLS,
  getCache,
  getCacheOrFetch,
  getCacheStats,
  invalidateCache,
  invalidateCachePattern,
  setCache,
  warmCache,
} from './cache';
// Error Handler (Next.js specific)
export {
  asyncHandler,
  type ErrorHandlerOptions,
  errorHandler,
  errorResponse,
  type RouteContext,
  successResponse,
  withErrorHandling,
} from './error-handler';
// Errors
export {
  ApiError,
  AuthenticationError as AuthError,
  AuthorizationError,
  BabylonError,
  BadRequestError,
  BusinessLogicError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  isAuthenticationError as isAuthError,
  isAuthorizationError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from './errors';

// Fetch utilities
export { type ApiFetchOptions, apiFetch, getPrivyAccessToken } from './fetch';
export * from './monitoring/monitored-cache';
export * from './monitoring/monitored-storage';
// Performance monitoring (moved from @babylon/shared)
export { performanceMonitor } from './monitoring/performance-monitor';
// Profile utilities
export {
  type BackendSignedUpdateParams,
  type BackendSignedUpdateResult,
  checkProfileUpdateRateLimit,
  getProfileUpdateHistory,
  isBackendSigningEnabled,
  logProfileUpdate,
  type ProfileMetadata,
  updateProfileBackendSigned,
  verifyBackendSignedUpdate,
} from './profile';
// Rate Limiting
export {
  addRateLimitHeaders,
  applyDuplicateDetection,
  applyRateLimit,
  checkDuplicate,
  checkRateLimit,
  checkRateLimitAndDuplicates,
  cleanupDuplicates,
  cleanupRateLimits,
  clearAllDuplicates,
  clearAllRateLimits,
  clearDuplicates,
  DUPLICATE_DETECTION_CONFIGS,
  duplicateContentError,
  getDuplicateStats,
  getRateLimitStatus,
  RATE_LIMIT_CONFIGS,
  rateLimitError,
  resetRateLimit,
} from './rate-limiting';
// Realtime
export {
  generateConnectionId,
  issueRealtimeToken,
  publishEvent,
  type RealtimeChannel,
  type RealtimeEventEnvelope,
  type RealtimeTokenPayload,
  signRealtimeToken,
  toStreamKey,
  verifyRealtimeToken,
} from './realtime';
export { connections } from './realtime/connection-registry';
export { drainOutboxBatch, enqueueOutbox } from './realtime/outbox';
// Redis
export {
  closeRedis,
  getRedis,
  getRedisClient,
  isRedisAvailable,
  type RedisInstance,
  redis,
  type StreamMessage,
  safePoll,
  safePublish,
  streamAdd,
  streamRead,
} from './redis';

// Services
export * from './services';
// SSE Event Broadcasting
export {
  broadcastChatMessage,
  broadcastToChannel,
} from './sse/event-broadcaster';
// Storage utilities (moved from @babylon/shared)
export {
  getStorageClient,
  type UploadOptions,
  type UploadResult,
} from './storage/s3-client';
// Swagger
export * from './swagger';
// Types
export type { ErrorLike, JsonValue, StringRecord } from './types';
// User management utilities
export {
  type CanonicalUser,
  type EnsureUserOptions,
  ensureUserForAuth,
  findUserByIdentifier,
  findUserByIdentifierWithSelect,
  getCanonicalUserId,
  requireUserByIdentifier,
} from './users';
// Server-side utilities (require Node.js crypto)
export {
  budgetTokens,
  // Token counter utilities (moved from @babylon/shared)
  countTokens,
  countTokensSync,
  generateApiKey,
  generateTestApiKey,
  getClientIp,
  getHashedClientIp,
  getModelTokenLimit,
  getSafeContextLimit,
  hashApiKey,
  hashIpAddress,
  MODEL_TOKEN_LIMITS,
  truncateToTokenLimit,
  truncateToTokenLimitSync,
  verifyApiKey,
} from './utils';
