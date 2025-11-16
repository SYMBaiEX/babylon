/**
 * Common Type Definitions
 * 
 * @module types/common
 * 
 * @description
 * Foundational type definitions used throughout Babylon to eliminate `unknown` and `any`.
 * Provides type-safe alternatives for JSON values, API responses, error handling, and
 * common patterns like pagination and filtering.
 * 
 * **Key Types:**
 * - `JsonValue`: Recursive type for JSON-serializable values
 * - `JsonRpcParams`/`JsonRpcResult`: Type-safe RPC communication
 * - `PaginatedResponse`: Standard pagination wrapper
 * - `ErrorResponse`: Consistent error structure
 * - `Result<T, E>`: Rust-style result type for error handling
 * 
 * **Design Principles:**
 * - No `any` or `unknown` types in application code
 * - Type-safe JSON handling
 * - Zod schemas for runtime validation
 * - Consistent error and response structures
 */

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

import { z } from 'zod';

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
 * Log data payload - structured data for logging
 * Accepts JsonValue, Error, or any object that can be serialized
 */
export type LogData = JsonValue | StringRecord | Error | { [key: string]: JsonValue | unknown } | unknown;

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
 * WebSocket message data payload
 */
export interface WebSocketData {
  type: string;
  payload?: JsonValue;
  timestamp?: string;
  [key: string]: JsonValue | undefined;
}

/**
 * LLM response wrapper
 */
export interface LLMResponse<T = JsonValue> {
  content: string;
  parsed?: T;
  raw?: string;
  metadata?: {
    model?: string;
    tokens?: number;
    temperature?: number;
  };
}

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


