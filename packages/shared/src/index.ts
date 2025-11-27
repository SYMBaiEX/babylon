/**
 * @babylon/shared
 *
 * Shared types, constants, and utilities for Babylon
 */

// Constants
export * from './constants';

// Types (all types are re-exported through ./types)
export * from './types';

// Game types (Actor, FeedPost, Question, etc.)
export * from './game-types';

// Errors (all error classes are re-exported through ./errors)
export * from './errors';

// Explicitly export commonly used types and utilities for better IDE support
export type { AuthenticatedUser } from './types/auth';
export { extractErrorMessage } from './types/errors';

// Explicitly export payment types to ensure they're available
export type { PaymentVerificationParams, PaymentVerificationResult } from './types/payments';
// Explicitly re-export commonly used types to ensure they're available when imported from other packages
export type { JsonValue, StringRecord } from './types/common';
export type { AgentCapabilities, GameNetworkInfo } from './types/agents';
export { AgentCapabilitiesSchema, GameNetworkInfoSchema } from './types/agents';
export type { UserProfileStats, PredictionPosition, UserBalanceData, PerpPositionFromAPI } from './types/profile';
export type { ProfileInfo, UserProfile, ActorProfile } from './types/profiles';
export type { PostInteraction, CommentInteraction, CommentData, CommentWithReplies, FavoriteProfile, InteractionError, PendingInteraction, LikeButtonProps, CommentButtonProps, RepostButtonProps, FavoriteButtonProps, InteractionBarProps, CommentCardProps, CommentInputProps } from './types/interactions';

// Perps Types
export * from './perps-types';

// Perp Mode Configuration
export * from './perp-modes';

// Utilities
export * from './utils';

// Auth utilities
export * from './auth';

// Contracts (ABIs and addresses)
export * from './contracts';

// Moderation utilities (empty - services exported from @babylon/api)
// export * from './moderation';

// Monitoring utilities
export * from './monitoring';

// Onboarding utilities
export * from './onboarding';

// Validation utilities and schemas
export * from './validation';

// Storage utilities
export * from './storage';

// Services
export * from './services';

// Rate limiting utilities
export * from './rate-limiting';

// On-chain betting (empty - services exported from @babylon/api)
// export * from './onchain-betting';

// Portfolio utilities (empty - functions exported from @babylon/engine)
// export * from './portfolio';

// Referral utilities
export * from './referral';

// Oracle utilities
export * from './oracle';

// PostHog server utilities
export * from './posthog';

// Share utilities
export * from './share';
