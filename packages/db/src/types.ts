/**
 * Database Types - Drizzle ORM compatible types
 *
 * These types replace the database types that were previously used.
 */

// JSON types for Drizzle
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type InputJsonValue = JsonValue;

// Decimal handling - use string for database storage
export class Decimal {
  private value: string;

  constructor(value: string | number | Decimal) {
    if (value instanceof Decimal) {
      this.value = value.toString();
    } else if (typeof value === 'number') {
      this.value = value.toString();
    } else {
      this.value = value;
    }
  }

  toString(): string {
    return this.value;
  }

  toNumber(): number {
    return Number.parseFloat(this.value);
  }

  static add(
    a: Decimal | string | number,
    b: Decimal | string | number
  ): Decimal {
    const aNum = typeof a === 'number' ? a : Number.parseFloat(a.toString());
    const bNum = typeof b === 'number' ? b : Number.parseFloat(b.toString());
    return new Decimal((aNum + bNum).toString());
  }

  static sub(
    a: Decimal | string | number,
    b: Decimal | string | number
  ): Decimal {
    const aNum = typeof a === 'number' ? a : Number.parseFloat(a.toString());
    const bNum = typeof b === 'number' ? b : Number.parseFloat(b.toString());
    return new Decimal((aNum - bNum).toString());
  }

  static mul(
    a: Decimal | string | number,
    b: Decimal | string | number
  ): Decimal {
    const aNum = typeof a === 'number' ? a : Number.parseFloat(a.toString());
    const bNum = typeof b === 'number' ? b : Number.parseFloat(b.toString());
    return new Decimal((aNum * bNum).toString());
  }

  static div(
    a: Decimal | string | number,
    b: Decimal | string | number
  ): Decimal {
    const aNum = typeof a === 'number' ? a : Number.parseFloat(a.toString());
    const bNum = typeof b === 'number' ? b : Number.parseFloat(b.toString());
    return new Decimal((aNum / bNum).toString());
  }
}

// Database error codes (matches PostgreSQL codes)
export const DbErrorCodes = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
} as const;

// Error class for database errors
export class DatabaseError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
  }
}

// Database error type - union of all possible database error types
export type DatabaseErrorType =
  | DatabaseError
  | Error
  | { code?: string; message?: string; name?: string };

// Type guard to convert catch clause error to DatabaseErrorType
export function toDatabaseErrorType(error: unknown): DatabaseErrorType {
  if (error instanceof DatabaseError || error instanceof Error) {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    return error as DatabaseErrorType;
  }
  return new Error(String(error));
}

// Check if an error is a unique constraint violation
export function isUniqueConstraintError(error: DatabaseErrorType): boolean {
  if (error instanceof DatabaseError) {
    return error.code === DbErrorCodes.UNIQUE_VIOLATION;
  }
  // PostgreSQL error format
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const pgError = error as { code?: string };
    return pgError.code === DbErrorCodes.UNIQUE_VIOLATION;
  }
  return false;
}

// Filter input types (for where clauses)
export type WhereInput<T> = Partial<{
  [K in keyof T]:
    | T[K]
    | {
        equals?: T[K];
        not?: T[K];
        in?: T[K][];
        notIn?: T[K][];
        lt?: T[K];
        lte?: T[K];
        gt?: T[K];
        gte?: T[K];
        contains?: string;
        startsWith?: string;
        endsWith?: string;
      };
}> & {
  AND?: WhereInput<T> | WhereInput<T>[];
  OR?: WhereInput<T>[];
  NOT?: WhereInput<T> | WhereInput<T>[];
};

// Order by input type
export type OrderByInput<T> = Partial<{
  [K in keyof T]: 'asc' | 'desc';
}>;

// Select input type
export type SelectInput<T> = Partial<{
  [K in keyof T]: boolean;
}>;

// Include input type (for relations)
export type IncludeInput = Record<
  string,
  boolean | { select?: Record<string, boolean>; include?: IncludeInput }
>;


