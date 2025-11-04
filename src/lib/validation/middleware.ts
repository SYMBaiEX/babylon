/**
 * Validation middleware for API routes using Zod schemas
 */

import type { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import { ValidationError } from '@/lib/errors';

/**
 * Route handler context type
 */
export interface RouteContext {
  params?: Record<string, string | string[]>;
}

/**
 * Route handler function type
 */
export type RouteHandler<TContext extends RouteContext = RouteContext> = (
  req: NextRequest,
  context?: TContext
) => Promise<NextResponse>;

/**
 * Extended NextRequest with validated data
 */
export interface ValidatedRequest<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown
> extends NextRequest {
  validatedBody?: TBody;
  validatedQuery?: TQuery;
  validatedParams?: TParams;
}

/**
 * Validate request body against a Zod schema
 * @param schema The Zod schema to validate against
 * @returns Middleware function that validates the request body
 */
export function validateBody<TSchema extends z.ZodType>(schema: TSchema) {
  type InferredType = z.infer<TSchema>;

  return function <TContext extends RouteContext = RouteContext>(
    handler: (req: ValidatedRequest<InferredType>, context?: TContext) => Promise<NextResponse>
  ) {
    return async (req: NextRequest, context?: TContext): Promise<NextResponse> => {
      try {
        // Parse the request body
        let body: unknown;
        const contentType = req.headers.get('content-type');

        if (contentType?.includes('application/json')) {
          try {
            body = await req.json();
          } catch {
            throw new ValidationError(
              'Invalid JSON in request body',
              ['body']
            );
          }
        } else if (contentType?.includes('application/x-www-form-urlencoded')) {
          const text = await req.text();
          body = Object.fromEntries(new URLSearchParams(text));
        } else if (contentType?.includes('multipart/form-data')) {
          const formData = await req.formData();
          body = Object.fromEntries(formData);
        } else {
          // Default to JSON parsing
          try {
            body = await req.json();
          } catch {
            body = {};
          }
        }

        // Validate the body against the schema
        const result = schema.safeParse(body);

        if (!result.success) {
          const violations = result.error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }));

          throw new ValidationError(
            'Request validation failed',
            result.error.issues.map(e => e.path.join('.')),
            violations
          );
        }

        // Attach validated data to request
        const validatedReq = req as ValidatedRequest<InferredType>;
        validatedReq.validatedBody = result.data;

        // Call the handler with validated data
        return handler(validatedReq, context);
      } catch (error) {
        // Re-throw validation errors
        if (error instanceof ValidationError) {
          throw error;
        }

        // Convert other errors to validation errors
        throw new ValidationError(
          'Request body validation failed',
          ['body'],
          [{ field: 'body', message: error instanceof Error ? error.message : 'Unknown error' }]
        );
      }
    };
  };
}

/**
 * Validate query parameters against a Zod schema
 * @param schema The Zod schema to validate against
 * @returns Middleware function that validates query parameters
 */
export function validateQuery<TSchema extends z.ZodType>(schema: TSchema) {
  type InferredType = z.infer<TSchema>;

  return function <TContext extends RouteContext = RouteContext>(
    handler: (req: ValidatedRequest<unknown, InferredType>, context?: TContext) => Promise<NextResponse>
  ) {
    return async (req: NextRequest, context?: TContext): Promise<NextResponse> => {
      try {
        // Parse query parameters
        const { searchParams } = new URL(req.url);
        const query: Record<string, string | string[]> = {};

        // Convert URLSearchParams to object
        searchParams.forEach((value, key) => {
          // Handle arrays (multiple values with same key)
          if (query[key]) {
            if (Array.isArray(query[key])) {
              (query[key] as string[]).push(value);
            } else {
              query[key] = [query[key] as string, value];
            }
          } else {
            query[key] = value;
          }
        });

        // Validate the query against the schema
        const result = schema.safeParse(query);

        if (!result.success) {
          const violations = result.error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }));

          throw new ValidationError(
            'Query parameter validation failed',
            result.error.issues.map(e => e.path.join('.')),
            violations
          );
        }

        // Attach validated data to request
        const validatedReq = req as ValidatedRequest<unknown, InferredType>;
        validatedReq.validatedQuery = result.data;

        // Call the handler with validated data
        return handler(validatedReq, context);
      } catch (error) {
        // Re-throw validation errors
        if (error instanceof ValidationError) {
          throw error;
        }

        // Convert other errors to validation errors
        throw new ValidationError(
          'Query parameter validation failed',
          ['query'],
          [{ field: 'query', message: error instanceof Error ? error.message : 'Unknown error' }]
        );
      }
    };
  };
}

/**
 * Validate route parameters against a Zod schema
 * @param schema The Zod schema to validate against
 * @returns Middleware function that validates route parameters
 */
export function validateParams<TSchema extends z.ZodType>(schema: TSchema) {
  type InferredType = z.infer<TSchema>;

  return function <TContext extends RouteContext = RouteContext>(
    handler: (req: ValidatedRequest<unknown, unknown, InferredType>, context?: TContext) => Promise<NextResponse>
  ) {
    return async (req: NextRequest, context?: TContext): Promise<NextResponse> => {
      try {
        // Get params from context
        const params = context?.params || {};

        // Validate the params against the schema
        const result = schema.safeParse(params);

        if (!result.success) {
          const violations = result.error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }));

          throw new ValidationError(
            'Route parameter validation failed',
            result.error.issues.map(e => e.path.join('.')),
            violations
          );
        }

        // Attach validated data to request
        const validatedReq = req as ValidatedRequest<unknown, unknown, InferredType>;
        validatedReq.validatedParams = result.data;

        // Call the handler with validated data
        return handler(validatedReq, context);
      } catch (error) {
        // Re-throw validation errors
        if (error instanceof ValidationError) {
          throw error;
        }

        // Convert other errors to validation errors
        throw new ValidationError(
          'Route parameter validation failed',
          ['params'],
          [{ field: 'params', message: error instanceof Error ? error.message : 'Unknown error' }]
        );
      }
    };
  };
}

/**
 * Validator middleware function type
 */
export type ValidatorMiddleware<TContext extends RouteContext = RouteContext> = <
  TReq extends NextRequest = NextRequest
>(
  handler: (req: TReq, context?: TContext) => Promise<NextResponse>
) => (req: NextRequest, context?: TContext) => Promise<NextResponse>;

/**
 * Compose multiple validation middleware functions
 * @param validators Array of validation middleware functions
 * @returns Combined middleware function
 */
export function composeValidators<TContext extends RouteContext = RouteContext>(
  ...validators: ValidatorMiddleware<TContext>[]
) {
  return function <TReq extends NextRequest = NextRequest>(
    handler: (req: TReq, context?: TContext) => Promise<NextResponse>
  ): (req: NextRequest, context?: TContext) => Promise<NextResponse> {
    return validators.reduceRight(
      (acc, validator) => validator(acc),
      handler as (req: NextRequest, context?: TContext) => Promise<NextResponse>
    );
  };
}

/**
 * Validate all parts of a request (body, query, params)
 * @param schemas Object containing schemas for each part
 * @returns Combined middleware function
 */
export function validateRequest<TContext extends RouteContext = RouteContext>(schemas: {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}) {
  const validators: ValidatorMiddleware<TContext>[] = [];

  if (schemas.params) {
    validators.push(validateParams(schemas.params) as ValidatorMiddleware<TContext>);
  }

  if (schemas.query) {
    validators.push(validateQuery(schemas.query) as ValidatorMiddleware<TContext>);
  }

  if (schemas.body) {
    validators.push(validateBody(schemas.body) as ValidatorMiddleware<TContext>);
  }

  return composeValidators<TContext>(...validators);
}

/**
 * Helper to extract validated data from request
 * @param req The validated request
 * @returns Object containing all validated data
 */
export function getValidatedData<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown
>(req: ValidatedRequest<TBody, TQuery, TParams>): {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
} {
  return {
    body: req.validatedBody,
    query: req.validatedQuery,
    params: req.validatedParams
  };
}

/**
 * Type helper for inferring validated request types
 */
export type InferValidatedRequest<
  TBody extends z.ZodType = z.ZodType,
  TQuery extends z.ZodType = z.ZodType,
  TParams extends z.ZodType = z.ZodType
> = Omit<NextRequest, 'json' | 'text'> & {
  validatedBody?: z.infer<TBody>;
  validatedQuery?: z.infer<TQuery>;
  validatedParams?: z.infer<TParams>;
};

/**
 * Create a type-safe validated handler
 */
export function createValidatedHandler<
  TBody extends z.ZodType = z.ZodType,
  TQuery extends z.ZodType = z.ZodType,
  TParams extends z.ZodType = z.ZodType,
  TContext extends RouteContext = RouteContext
>(
  schemas: {
    body?: TBody;
    query?: TQuery;
    params?: TParams;
  },
  handler: (
    req: InferValidatedRequest<TBody, TQuery, TParams>,
    context?: TContext
  ) => Promise<NextResponse>
) {
  return validateRequest<TContext>(schemas)(
    handler as (req: NextRequest, context?: TContext) => Promise<NextResponse>
  );
}