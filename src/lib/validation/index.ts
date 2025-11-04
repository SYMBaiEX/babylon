/**
 * Central export point for validation utilities
 */

// Export all schemas
export * from './schemas';

// Export middleware functions
export {
  validateBody,
  validateQuery,
  validateParams,
  validateRequest,
  composeValidators,
  createValidatedHandler,
  getValidatedData,
  type ValidatedRequest,
  type InferValidatedRequest
} from './middleware';

// Re-export Zod types for convenience
export { z } from 'zod';
export type { ZodError, ZodIssue } from 'zod';