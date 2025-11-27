/**
 * Shared Type Definitions for @babylon/a2a
 *
 * Common types used throughout the A2A package
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
 */
export type LogData =
  | JsonValue
  | StringRecord
  | Error
  | { [key: string]: JsonValue | unknown }
  | unknown;

/**
 * Parameters for JSON-RPC requests
 */
export type JsonRpcParams = StringRecord<JsonValue> | JsonValue[];

/**
 * Result type for JSON-RPC responses
 */
export type JsonRpcResult = JsonValue | StringRecord<JsonValue> | JsonValue[];

