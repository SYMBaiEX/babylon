/**
 * @babylon/shared - Client-Safe Exports
 *
 * This module exports types and utilities that are safe to use in client-side code.
 * It does NOT include any server-only dependencies like:
 * - tiktoken (WASM/Node.js)
 * - @aws-sdk/* (Node.js)
 * - @vercel/blob (Node.js)
 * - @anthropic-ai/sdk (Node.js)
 * - Node.js crypto module
 *
 * Use this import for React client components:
 * import { cn, logger, formatDate } from '@babylon/shared/client';
 * import type { JsonValue, UserProfile } from '@babylon/shared/client';
 */

// =============================================================================
// Constants (all client-safe)
// =============================================================================

export * from './constants';

// =============================================================================
// Types (all types are client-safe - they're just TypeScript interfaces)
// =============================================================================

export * from './types';

// =============================================================================
// Game Types (Actor, FeedPost, Question, etc.)
// =============================================================================

export * from './game-types';

// =============================================================================
// Perps Types
// =============================================================================

export * from './perps-types';

// =============================================================================
// Perp Mode Configuration
// =============================================================================

export * from './perp-modes';

// =============================================================================
// Client-Safe Utilities (excludes token-counter which uses tiktoken)
// =============================================================================

// UI utilities (cn function for Tailwind)
export * from './utils/ui';

// Logger (works in browser)
export * from './utils/logger';

// Formatting utilities (pure functions)
export * from './utils/format';

// Retry utilities (pure functions)
export * from './utils/retry';

// JSON parser (pure functions)
export * from './utils/json-parser';

// Decimal converter (pure functions)
export * from './utils/decimal-converter';

// Singleton utility (pure function)
export * from './utils/singleton';

// Snowflake ID generator (pure functions)
export * from './utils/snowflake';

// Profile utilities (pure functions)
export * from './utils/profile';

// Assets utilities (URL helpers)
export * from './utils/assets';

// Name replacement utilities (pure functions)
export * from './utils/name-replacement';

// Content analysis (pure functions, no external deps)
export * from './utils/content-analysis';

// Content safety (pure functions, no external deps)
export * from './utils/content-safety';

// OASF skill mapper (pure functions)
export * from './utils/oasf-skill-mapper';

// =============================================================================
// Error Classes (client-safe)
// =============================================================================

export * from './errors';

// =============================================================================
// Auth utilities (client-safe parts)
// =============================================================================

export * from './auth';

// =============================================================================
// Contracts (ABIs and addresses - pure data)
// =============================================================================

export * from './contracts';

// =============================================================================
// Onboarding utilities
// =============================================================================

export * from './onboarding';

// =============================================================================
// Validation utilities and schemas (Zod schemas work in browser)
// =============================================================================

export * from './validation';

// =============================================================================
// Referral utilities
// =============================================================================

export * from './referral';

// =============================================================================
// Share utilities
// =============================================================================

export * from './share';

// =============================================================================
// Public configuration (canonical contract addresses, endpoints, game settings)
// =============================================================================

export * from './config';

// =============================================================================
// NOT EXPORTED (Server-only modules):
// =============================================================================
// - ./utils/token-counter (uses tiktoken WASM)
// - ./utils/api-keys (uses Node.js crypto)
// - ./utils/ip-utils (uses Node.js crypto)
// - ./services (uses @anthropic-ai/sdk)
// - ./storage (uses @aws-sdk/*, @vercel/blob)
// - ./monitoring (may have server dependencies)
// - ./rate-limiting (uses Node.js crypto)
