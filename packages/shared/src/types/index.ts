/**
 * Shared Type Exports
 *
 * Re-exports all shared types for easy importing
 */

// Common types (JsonValue, etc.)
export * from './common';

// Error types (interfaces for error handling)
// Note: Error classes are exported from ./errors/index to avoid duplicates
export type {
  AppError,
  // Rename interfaces to avoid conflict with classes from errors/index
  AuthenticationError as AuthenticationErrorInterface,
  DatabaseError as DatabaseErrorInterface,
  NetworkError,
  ValidationError as ValidationErrorInterface,
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

// Domain-specific error classes are exported from errors/index.ts
// Do not re-export here to avoid duplicate exports

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

