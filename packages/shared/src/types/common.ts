/**
 * Common Type Definitions
 *
 * Shared types for common patterns that replace 'unknown' and 'any'
 */

import { z } from 'zod';

/**
 * JSON-serializable value types
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Zod schema for JSON-serializable values
 * Used in validation schemas for metadata and flexible data fields
 */
export type JsonValueSchema = z.ZodType<JsonValue>;

export const JsonValueSchema: JsonValueSchema = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ])
);

/**
 * Generic key-value record with string keys
 */
export type StringRecord<T = JsonValue> = Record<string, T>;

/**
 * Error-like object that may have a message property
 */
export interface ErrorLike {
  message?: string;
  name?: string;
  stack?: string;
  code?: string | number;
  [key: string]: JsonValue | undefined;
}

/**
 * Parameters for JSON-RPC requests
 */
export type JsonRpcParams = StringRecord<JsonValue> | JsonValue[];

/**
 * Result type for JSON-RPC responses
 */
export type JsonRpcResult = JsonValue | StringRecord<JsonValue> | JsonValue[];

/**
 * API response wrapper
 */
export interface ApiResponse<T = JsonValue> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit: number;
  offset: number;
  page?: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Sort order
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Sort parameters
 */
export interface SortParams {
  field: string;
  order: SortOrder;
}

/**
 * Filter parameters
 */
export interface FilterParams {
  [key: string]: JsonValue | JsonValue[] | undefined;
}

/**
 * Query parameters combining pagination, sorting, and filtering
 */
export interface QueryParams extends PaginationParams {
  sort?: SortParams;
  filters?: FilterParams;
}
