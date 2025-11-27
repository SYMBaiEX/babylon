/**
 * API Error Handling Utilities
 *
 * @description Provides standardized error classes and handling for API routes.
 * Ensures consistent error responses across all endpoints. Includes HTTP status
 * code mapping, Zod validation integration, and helper functions for common
 * validation scenarios.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';

/**
 * Base API Error class
 *
 * @description Base class for all API errors. Extends Error with HTTP status
 * code and error code for consistent error handling.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Bad Request Error (400)
 *
 * @description Error for malformed or invalid requests.
 */
export class BadRequestError extends ApiError {
  constructor(message: string, code?: string) {
    super(message, 400, code);
    this.name = 'BadRequestError';
  }
}

/**
 * Unauthorized Error (401)
 *
 * @description Error for authentication failures.
 */
export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', code?: string) {
    super(message, 401, code);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden Error (403)
 *
 * @description Error for authorization/permission failures.
 */
export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden', code?: string) {
    super(message, 403, code);
    this.name = 'ForbiddenError';
  }
}

/**
 * Not Found Error (404)
 *
 * @description Error for missing resources.
 */
export class NotFoundError extends ApiError {
  constructor(resource = 'Resource', code?: string) {
    super(`${resource} not found`, 404, code);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict Error (409)
 *
 * @description Error for duplicate resources or conflicting operations.
 */
export class ConflictError extends ApiError {
  constructor(message: string, code?: string) {
    super(message, 409, code);
    this.name = 'ConflictError';
  }
}

/**
 * Unprocessable Entity Error (422)
 *
 * @description Error for validation failures with field-level error details.
 */
export class ValidationError extends ApiError {
  constructor(
    message: string,
    public errors?: Record<string, string[]>,
    code?: string
  ) {
    super(message, 422, code);
    this.name = 'ValidationError';
  }
}

/**
 * Rate Limit Error (429)
 *
 * @description Error for rate limit violations with retry-after information.
 */
export class RateLimitError extends ApiError {
  constructor(
    message = 'Too many requests',
    public reset?: number,
    code?: string
  ) {
    super(message, 429, code);
    this.name = 'RateLimitError';
  }
}

/**
 * Internal Server Error (500)
 *
 * @description Error for unexpected server failures.
 */
export class InternalServerError extends ApiError {
  constructor(message = 'Internal server error', code?: string) {
    super(message, 500, code);
    this.name = 'InternalServerError';
  }
}

/**
 * Service Unavailable Error (503)
 *
 * @description Error for temporary service unavailability.
 */
export class ServiceUnavailableError extends ApiError {
  constructor(message = 'Service temporarily unavailable', code?: string) {
    super(message, 503, code);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Error response interface
 * Note: The canonical ErrorResponse is in @/lib/errors/index.ts
 * This is a legacy version, import from index.ts instead
 */
import type { ErrorResponse } from './index';

/**
 * Create standardized error response
 *
 * @description Converts any error (ApiError, ZodError, or generic Error)
 * to a standardized NextResponse with appropriate status code and error details.
 * Handles different error types and extracts validation errors from Zod.
 *
 * @param {unknown} error - Error object to convert
 * @param {Request} [request] - Optional request object for path logging
 * @returns {NextResponse<ErrorResponse>} NextResponse with error details
 */
export function createErrorResponse(
  error: unknown,
  request?: Request
): NextResponse<ErrorResponse> {
  let statusCode = 500;
  let message = 'An unexpected error occurred';
  let code: string | undefined;
  let errors: Record<string, string[]> | undefined;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code;

    if (error instanceof ValidationError) {
      errors = error.errors;
    }
  } else if (error instanceof z.ZodError) {
    // Handle Zod validation errors
    statusCode = 422;
    message = 'Validation error';
    code = 'VALIDATION_ERROR';
    errors = {};

    for (const issue of error.issues) {
      const path = issue.path.join('.');
      if (!errors[path]) {
        errors[path] = [];
      }
      errors[path].push(issue.message);
    }
  } else if (error instanceof Error) {
    message = error.message;

    // Check for specific error patterns
    if (error.message.includes('not found')) {
      statusCode = 404;
      code = 'NOT_FOUND';
    } else if (
      error.message.includes('unauthorized') ||
      error.message.includes('authentication')
    ) {
      statusCode = 401;
      code = 'UNAUTHORIZED';
    } else if (
      error.message.includes('forbidden') ||
      error.message.includes('permission')
    ) {
      statusCode = 403;
      code = 'FORBIDDEN';
    } else if (
      error.message.includes('duplicate') ||
      error.message.includes('already exists')
    ) {
      statusCode = 409;
      code = 'CONFLICT';
    }
  }

  const errorResponse: ErrorResponse = {
    error: {
      message,
      code: code || 'UNKNOWN_ERROR',
      violations: errors
        ? Object.entries(errors).map(([field, msgs]) => ({
            field,
            message: msgs.join(', '),
          }))
        : undefined,
      context: request ? { path: new URL(request.url).pathname } : undefined,
    },
  };

  // Log error
  if (statusCode >= 500) {
    logger.error('API error', {
      error: errorResponse,
      stack: error instanceof Error ? error.stack : undefined,
    });
  } else {
    logger.warn('API client error', errorResponse);
  }

  return NextResponse.json(errorResponse, { status: statusCode });
}

/**
 * Async error handler wrapper for API routes
 *
 * @description Wraps an async API route handler with automatic error handling.
 * Catches errors and converts them to standardized error responses.
 *
 * @param {Function} handler - Async API route handler function
 * @returns {Function} Wrapped handler with error handling
 *
 * @example
 * ```typescript
 * export const GET = withErrorHandling(async (request: NextRequest) => {
 *   // Handler code - errors automatically caught and converted
 *   return NextResponse.json({ data: 'success' });
 * });
 * ```
 */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return createErrorResponse(error, args[0] as Request);
    }
  };
}

/**
 * Validate request body against Zod schema
 *
 * @description Validates JSON request body against a Zod schema. Throws
 * ValidationError if validation fails or if body is not valid JSON.
 *
 * @param {Request} request - Request object
 * @param {z.ZodType} schema - Zod schema to validate against
 * @returns {Promise<z.infer<T>>} Validated data
 * @throws {BadRequestError} If body is not valid JSON
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * const data = await validateRequestBody(request, createPostSchema);
 * // data is now typed and validated
 * ```
 */
export async function validateRequestBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new BadRequestError('Invalid JSON in request body', 'INVALID_JSON');
    }
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw error;
    }

    throw new BadRequestError('Invalid JSON in request body');
  }
}

/**
 * Validate query parameters against Zod schema
 *
 * @description Validates URL query parameters against a Zod schema. Throws
 * ValidationError if validation fails.
 *
 * @param {URLSearchParams} searchParams - URLSearchParams object
 * @param {z.ZodType} schema - Zod schema to validate against
 * @returns {z.infer<T>} Validated data
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * const params = validateQueryParams(searchParams, paginationSchema);
 * // params is now typed and validated
 * ```
 */
export function validateQueryParams<T extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: T
): z.infer<T> {
  const params = Object.fromEntries(searchParams.entries());
  return schema.parse(params);
}

/**
 * Assert user is authenticated
 *
 * @description Type guard that asserts a user ID is present. Throws
 * UnauthorizedError if userId is null or undefined.
 *
 * @param {string | null | undefined} userId - User ID from session
 * @throws {UnauthorizedError} If not authenticated
 *
 * @example
 * ```typescript
 * requireAuth(userId); // Throws if userId is null/undefined
 * // After this, TypeScript knows userId is string
 * ```
 */
export function requireAuth(
  userId: string | null | undefined
): asserts userId is string {
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
}

/**
 * Assert user has required permission
 *
 * @description Type guard that asserts a user has permission. Throws
 * ForbiddenError if permission is denied.
 *
 * @param {boolean} hasPermission - Permission check result
 * @param {string} [resource='this resource'] - Resource being accessed
 * @throws {ForbiddenError} If permission denied
 *
 * @example
 * ```typescript
 * requirePermission(user.isAdmin, 'admin panel');
 * // Throws if user is not admin
 * ```
 */
export function requirePermission(
  hasPermission: boolean,
  resource = 'this resource'
): asserts hasPermission {
  if (!hasPermission) {
    throw new ForbiddenError(`You don't have permission to access ${resource}`);
  }
}

/**
 * Assert resource exists
 *
 * @description Type guard that asserts a resource exists. Throws NotFoundError
 * if resource is null or undefined.
 *
 * @param {T | null | undefined} resource - Resource to check
 * @param {string} [name='Resource'] - Resource name for error message
 * @returns {void}
 * @throws {NotFoundError} If resource is null/undefined
 *
 * @example
 * ```typescript
 * requireResource(user, 'User');
 * // Throws if user is null/undefined
 * // After this, TypeScript knows user is T
 * ```
 */
export function requireResource<T>(
  resource: T | null | undefined,
  name = 'Resource'
): asserts resource is T {
  if (resource === null || resource === undefined) {
    throw new NotFoundError(name);
  }
}
