/**
 * Error Utilities and Constants
 *
 * @description Provides error code constants, type guards, and error response utilities
 * for consistent error handling across the application.
 */

import { BabylonError, ValidationError } from './errors';
import type { JsonValue } from './types';

/**
 * Error code constants for consistency across the application
 *
 * @description Standardized error codes used throughout the application
 * for consistent error identification and handling.
 */
export const ErrorCodes = {
  // General errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Auth errors
  AUTH_NO_TOKEN: 'AUTH_NO_TOKEN',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_EXPIRED_TOKEN: 'AUTH_EXPIRED_TOKEN',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',

  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  FOREIGN_KEY_CONSTRAINT: 'FOREIGN_KEY_CONSTRAINT',

  // Business logic errors
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  RATE_LIMIT: 'RATE_LIMIT',

  // Trading errors
  TRADING_MARKET_CLOSED: 'TRADING_MARKET_CLOSED',
  TRADING_INVALID_PRICE: 'TRADING_INVALID_PRICE',
  TRADING_POSITION_LIMIT: 'TRADING_POSITION_LIMIT',
  TRADING_RISK_LIMIT: 'TRADING_RISK_LIMIT',

  // Agent errors
  AGENT_ERROR: 'AGENT_ERROR',
  AGENT_AUTH_NOT_REGISTERED: 'AGENT_AUTH_NOT_REGISTERED',
  AGENT_AUTH_INVALID_SIGNATURE: 'AGENT_AUTH_INVALID_SIGNATURE',

  // External service errors
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  BLOCKCHAIN_ERROR: 'BLOCKCHAIN_ERROR',
  SMART_CONTRACT_ERROR: 'SMART_CONTRACT_ERROR',
  LLM_ERROR: 'LLM_ERROR',
} as const;

/**
 * Type guard to check if an error is a Babylon error
 *
 * @description Determines if an error is an instance of BabylonError,
 * allowing type-safe error handling.
 *
 * @param {unknown} error - Error to check
 * @returns {boolean} True if error is a BabylonError
 */
export function isBabylonError(error: unknown): error is BabylonError {
  return error instanceof BabylonError;
}

/**
 * Type guard to check if an error is operational (expected)
 *
 * @description Determines if an error is operational (expected and handled)
 * vs programming errors (unexpected bugs).
 *
 * @param {unknown} error - Error to check
 * @returns {boolean} True if error is operational
 */
export function isOperationalError(error: unknown): boolean {
  if (isBabylonError(error)) {
    return error.isOperational;
  }
  return false;
}

/**
 * Standard error response object
 *
 * @description Structure for API error responses, including error message,
 * code, validation violations, and optional context.
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    violations?: Array<{ field: string; message: string }>;
    context?: Record<string, JsonValue>;
  };
}

/**
 * Create a standardized error response object
 *
 * @description Converts a BabylonError to a standardized ErrorResponse
 * format suitable for API responses. Includes validation violations if present
 * and context in development mode.
 *
 * @param {BabylonError} error - Babylon error to convert
 * @returns {ErrorResponse} Standardized error response
 */
export function createErrorResponse(error: BabylonError): ErrorResponse {
  return {
    error: {
      message: error.message,
      code: error.code,
      ...(error instanceof ValidationError &&
        error.errors && {
          violations: Object.entries(error.errors).flatMap(([field, messages]) =>
            messages.map((message) => ({ field, message }))
          ),
        }),
      ...(process.env.NODE_ENV === 'development' &&
        error.context && {
          context: error.context as Record<string, JsonValue>,
        }),
    },
  };
}

