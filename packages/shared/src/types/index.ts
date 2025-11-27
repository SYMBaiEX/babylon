/**
 * Shared Type Exports
 *
 * Re-exports all shared types for easy importing
 */

// Common types (JsonValue, etc.)
export * from './common';

// Error types (interfaces for error handling)
export type {
  AppError,
  AuthenticationError,
  DatabaseError,
  NetworkError,
  ValidationError,
  // Rename the interface to avoid conflict with class
  LLMError as LLMErrorInterface,
} from './errors';
export {
  isAuthenticationError,
  isDatabaseError,
  isLLMError,
  isNetworkError,
  isValidationError,
  extractErrorMessage,
} from './errors';

// Domain-specific errors (classes for throwing)
export * from './domain-errors';

// Social interaction types
export * from './interactions';

// Agent monitoring types
export * from './monitoring';

// Payment types
export * from './payments';

// Profile types (user/actor profiles)
export * from './profiles';

// Profile widget types (balance, positions, etc.)
export * from './profile';

// Agent types
export * from './agents';

// Auth types
export * from './auth';

