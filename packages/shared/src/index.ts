/**
 * @babylon/shared
 *
 * Shared types, constants, and utilities for Babylon
 */

// Constants (explicit index path for ESM compatibility)
export * from './constants/index';

// Types (all types are re-exported through ./types)
export * from './types/index';

// Game types (Actor, FeedPost, Question, etc.)
export * from './game-types';

// Game types (game-specific type definitions)
export * from './game-types';

// Errors (all error classes are re-exported through ./errors)
export * from './errors/index';

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

// Utilities (explicit index path for ESM compatibility)
export * from './utils/index';

// Auth utilities (explicit index path for ESM compatibility)
export * from './auth/index';

// Contracts (ABIs and addresses, explicit index path for ESM compatibility)
export * from './contracts/index';

// Moderation utilities (empty - services exported from @babylon/api)
// export * from './moderation/index';

// Monitoring utilities (explicit index path for ESM compatibility)
export * from './monitoring/index';

// Onboarding utilities (explicit index path for ESM compatibility)
export * from './onboarding/index';

// Validation utilities and schemas (explicit index path for ESM compatibility)
export * from './validation/index';

// Storage utilities (explicit index path for ESM compatibility)
export * from './storage/index';

// Services (explicit index path for ESM compatibility)
export * from './services/index';

// Rate limiting utilities (explicit index path for ESM compatibility)
export * from './rate-limiting/index';

// On-chain betting (empty - services exported from @babylon/api)
// export * from './onchain-betting/index';

// Portfolio utilities (empty - functions exported from @babylon/engine)
// export * from './portfolio/index';

// Referral utilities (explicit index path for ESM compatibility)
export * from './referral/index';

// Oracle utilities (explicit index path for ESM compatibility)
export * from './oracle/index';

// PostHog server utilities (explicit index path for ESM compatibility)
export * from './posthog/index';

// Share utilities (explicit index path for ESM compatibility)
export * from './share/index';
