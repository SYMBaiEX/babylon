/**
 * Error Type Definitions
 * 
 * Proper error types to replace all 'unknown' and 'any' error types
 */

import type { JsonValue } from '@/types/common'

/**
 * Base error interface for all application errors
 */
export interface AppError {
  message: string;
  code?: string;
  details?: Record<string, string | number | boolean>;
}

/**
 * Authentication error
 */
export interface AuthenticationError extends Error {
  code: 'AUTH_FAILED' | 'AUTH_TOKEN_INVALID' | 'AUTH_TOKEN_EXPIRED';
  userId?: string;
}

/**
 * Database error
 */
export interface DatabaseError extends Error {
  code: string;
  prismaCode?: string;
  table?: string;
  constraint?: string;
}

/**
 * LLM/API error
 */
export interface LLMError extends Error {
  code: 'LLM_GENERATION_FAILED' | 'LLM_RATE_LIMIT' | 'LLM_INVALID_RESPONSE';
  provider?: string;
  attempt?: number;
  maxRetries?: number;
}

/**
 * Network/HTTP error
 */
export interface NetworkError extends Error {
  status?: number;
  statusText?: string;
  url?: string;
}

/**
 * Validation error
 */
export interface ValidationError extends Error {
  field?: string;
  value?: JsonValue;
  constraint?: string;
}

/**
 * Type guard to check if error is AuthenticationError
 */
export function isAuthenticationError(error: Error): error is AuthenticationError {
  return 'code' in error && typeof (error as AuthenticationError).code === 'string' && 
         ['AUTH_FAILED', 'AUTH_TOKEN_INVALID', 'AUTH_TOKEN_EXPIRED'].includes((error as AuthenticationError).code);
}

/**
 * Type guard to check if error is DatabaseError
 */
export function isDatabaseError(error: Error): error is DatabaseError {
  return 'code' in error && 'prismaCode' in error;
}

/**
 * Type guard to check if error is LLMError
 */
export function isLLMError(error: Error): error is LLMError {
  return 'code' in error && typeof (error as LLMError).code === 'string' && 
         ['LLM_GENERATION_FAILED', 'LLM_RATE_LIMIT', 'LLM_INVALID_RESPONSE'].includes((error as LLMError).code);
}

/**
 * Type guard to check if error is NetworkError
 */
export function isNetworkError(error: Error): error is NetworkError {
  return 'status' in error || 'url' in error;
}

/**
 * Type guard to check if error is ValidationError
 */
export function isValidationError(error: Error): error is ValidationError {
  return 'field' in error || 'constraint' in error;
}

/**
 * Extract error message from any error-like object
 */
export function extractErrorMessage(error: Error | AppError | string | JsonValue | { message?: string }): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'An unknown error occurred';
}


