/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Drizzle Database Client
 *
 * Provides table repositories with findUnique, findFirst, findMany, create, update, delete methods.
 * 100% Drizzle ORM under the hood.
 *
 * Usage:
 *   import { db } from '@/db';
 *   const user = await db.user.findUnique({ where: { id: '123' } });
 *   const users = await db.user.findMany({ where: { isActive: true } });
 */

import { eq, and, or, ne, gt, gte, lt, lte, like, ilike, inArray, notInArray, isNull, isNotNull, sql, desc, asc, count as drizzleCount, type SQL } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// ============================================================================
// Types
// ============================================================================

export type DrizzleSchema = typeof schema;
export type SchemaDatabase = PostgresJsDatabase<DrizzleSchema>;

/** Generic where condition */
type WhereValue<T> =
  | T
  | { equals?: T; not?: T | { equals?: T }; in?: T[]; notIn?: T[]; lt?: T; lte?: T; gt?: T; gte?: T; contains?: string; startsWith?: string; endsWith?: string; mode?: 'insensitive' }
  | null
  | undefined;

/** Where input for a table */
type WhereInput<TTable> = {
  [K in keyof TTable]?: WhereValue<TTable[K]>;
} & {
  AND?: WhereInput<TTable> | WhereInput<TTable>[];
  OR?: WhereInput<TTable>[];
  NOT?: WhereInput<TTable> | WhereInput<TTable>[];
};

/** Order by input */
type OrderByInput<TTable> = {
  [K in keyof TTable]?: 'asc' | 'desc';
};

/** Include input for relations */
type IncludeInput = Record<string, boolean | { select?: Record<string, boolean>; include?: IncludeInput; where?: Record<string, unknown>; take?: number; orderBy?: Record<string, 'asc' | 'desc'> }>;

/** Select input for fields */
type SelectInput = Record<string, boolean>;

/** Find options */
interface FindOptions<TSelect> {
  where?: WhereInput<TSelect>;
  orderBy?: OrderByInput<TSelect> | OrderByInput<TSelect>[];
  take?: number;
  skip?: number;
  include?: IncludeInput;
  select?: SelectInput;
}

/** Extended type that allows relation access - used when include is specified */
export type WithRelations<T> = T & Record<string, unknown>;

/** Create options */
interface CreateOptions<TInsert> {
  data: TInsert;
  select?: SelectInput;
  include?: IncludeInput;
}

/** Update options - allows increment/decrement operations for numeric fields */
type UpdateData<TInsert> = {
  [K in keyof TInsert]?: TInsert[K] | { increment: number } | { decrement: number };
};

interface UpdateOptions<TSelect, TInsert> {
  where: WhereInput<TSelect>;
  data: UpdateData<TInsert>;
  select?: SelectInput;
  include?: IncludeInput;
}

/** Delete options */
interface DeleteOptions<TSelect> {
  where: WhereInput<TSelect>;
  select?: SelectInput;
}

/** Upsert options */
interface UpsertOptions<TSelect, TInsert> {
  where: WhereInput<TSelect>;
  create: TInsert;
  update: Partial<TInsert>;
  include?: IncludeInput;
}

// ============================================================================
// Where Clause Builder
// ============================================================================

function buildWhereClause<TTable extends PgTable>(
  table: TTable,
  where: WhereInput<Record<string, unknown>> | undefined
): SQL | undefined {
  if (!where) return undefined;

  const conditions: SQL[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND') {
      const andConditions = Array.isArray(value) ? value : [value];
      const andClauses = andConditions
        .map((w) => buildWhereClause(table, w as WhereInput<Record<string, unknown>>))
        .filter((c): c is SQL => c !== undefined);
      if (andClauses.length > 0) {
        conditions.push(and(...andClauses)!);
      }
      continue;
    }

    if (key === 'OR') {
      const orConditions = value as WhereInput<Record<string, unknown>>[];
      const orClauses = orConditions
        .map((w) => buildWhereClause(table, w))
        .filter((c): c is SQL => c !== undefined);
      if (orClauses.length > 0) {
        conditions.push(or(...orClauses)!);
      }
      continue;
    }

    if (key === 'NOT') {
      const notCondition = buildWhereClause(table, value as WhereInput<Record<string, unknown>>);
      if (notCondition) {
        conditions.push(sql`NOT (${notCondition})`);
      }
      continue;
    }

    const column = (table as any)[key] as PgColumn | undefined;
    if (!column) continue;

    if (value === null) {
      conditions.push(isNull(column));
      continue;
    }

    if (value === undefined) continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;

      if ('equals' in ops) {
        if (ops.equals === null) {
          conditions.push(isNull(column));
        } else {
          conditions.push(eq(column, ops.equals));
        }
      }
      if ('not' in ops) {
        if (ops.not === null) {
          conditions.push(isNotNull(column));
        } else if (typeof ops.not === 'object' && ops.not !== null && 'equals' in ops.not) {
          conditions.push(ne(column, (ops.not as { equals: unknown }).equals));
        } else {
          conditions.push(ne(column, ops.not));
        }
      }
      if ('in' in ops && Array.isArray(ops.in)) {
        conditions.push(inArray(column, ops.in));
      }
      if ('notIn' in ops && Array.isArray(ops.notIn)) {
        conditions.push(notInArray(column, ops.notIn));
      }
      if ('lt' in ops) conditions.push(lt(column, ops.lt));
      if ('lte' in ops) conditions.push(lte(column, ops.lte));
      if ('gt' in ops) conditions.push(gt(column, ops.gt));
      if ('gte' in ops) conditions.push(gte(column, ops.gte));
      if ('contains' in ops) {
        const mode = (ops as { mode?: string }).mode;
        if (mode === 'insensitive') {
          conditions.push(ilike(column, `%${ops.contains}%`));
        } else {
          conditions.push(like(column, `%${ops.contains}%`));
        }
      }
      if ('startsWith' in ops) {
        const mode = (ops as { mode?: string }).mode;
        if (mode === 'insensitive') {
          conditions.push(ilike(column, `${ops.startsWith}%`));
        } else {
          conditions.push(like(column, `${ops.startsWith}%`));
        }
      }
      if ('endsWith' in ops) {
        const mode = (ops as { mode?: string }).mode;
        if (mode === 'insensitive') {
          conditions.push(ilike(column, `%${ops.endsWith}`));
        } else {
          conditions.push(like(column, `%${ops.endsWith}`));
        }
      }
    } else {
      // Direct value comparison
      conditions.push(eq(column, value));
    }
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

// ============================================================================
// Order By Builder
// ============================================================================

function buildOrderBy<TTable extends PgTable>(
  table: TTable,
  orderBy: OrderByInput<Record<string, unknown>> | OrderByInput<Record<string, unknown>>[] | undefined
): SQL[] {
  if (!orderBy) return [];

  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  const result: SQL[] = [];

  for (const order of orders) {
    for (const [key, direction] of Object.entries(order)) {
      const column = (table as any)[key] as PgColumn | undefined;
      if (column) {
        result.push(direction === 'desc' ? desc(column) : asc(column));
      }
    }
  }

  return result;
}

// ============================================================================
// Table Repository
// ============================================================================

export class TableRepository<
  TTable extends PgTable,
  TSelect extends Record<string, unknown>,
  TInsert extends Record<string, unknown>
> {
  constructor(
    private readonly drizzle: SchemaDatabase,
    private readonly table: TTable,
    private readonly tableName: string
  ) {}

  /**
   * Build Drizzle 'with' clause from include
   */
  private buildWithClause(include: IncludeInput): Record<string, unknown> {
    const withClause: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(include)) {
      if (value === true) {
        withClause[key] = true;
      } else if (typeof value === 'object' && value !== null) {
        const nested: Record<string, unknown> = {};
        if (value.where) nested.where = value.where;
        if (value.take) nested.limit = value.take;
        if (value.orderBy) {
          const orders: SQL[] = [];
          for (const [oKey, oDir] of Object.entries(value.orderBy)) {
            orders.push(oDir === 'desc' ? sql`${sql.identifier(oKey)} DESC` : sql`${sql.identifier(oKey)} ASC`);
          }
          if (orders.length > 0) nested.orderBy = orders;
        }
        if (value.include) nested.with = this.buildWithClause(value.include);
        withClause[key] = Object.keys(nested).length > 0 ? nested : true;
      }
    }
    return withClause;
  }

  /**
   * Find a unique record by primary key or unique constraint
   * Returns type with relation access when include is specified
   */
  async findUnique(options: FindOptions<TSelect>): Promise<TSelect | null> {
    const whereClause = buildWhereClause(this.table, options.where);

    // Use Drizzle's query API for relations if include is specified
    if (options.include && this.drizzle.query) {
      const queryTable = (this.drizzle.query as any)[this.tableName];
      if (queryTable?.findFirst) {
        const result = await queryTable.findFirst({
          where: whereClause,
          with: this.buildWithClause(options.include),
        });
        return result as TSelect | null;
      }
    }

    const results = await (this.drizzle as any)
      .select()
      .from(this.table)
      .where(whereClause)
      .limit(1);

    return (results[0] as TSelect) || null;
  }

  /**
   * Find a unique record by primary key or unique constraint, throwing if not found
   */
  async findUniqueOrThrow(options: FindOptions<TSelect>): Promise<TSelect> {
    const result = await this.findUnique(options);
    if (!result) {
      throw new Error(`Record not found in ${this.tableName}`);
    }
    return result;
  }

  /**
   * Find the first record matching the criteria
   */
  async findFirst(options: FindOptions<TSelect> = {}): Promise<TSelect | null> {
    const whereClause = buildWhereClause(this.table, options.where);
    const orderByClause = buildOrderBy(this.table, options.orderBy);

    // Use Drizzle's query API for relations if include is specified
    if (options.include && this.drizzle.query) {
      const queryTable = (this.drizzle.query as any)[this.tableName];
      if (queryTable?.findFirst) {
        const result = await queryTable.findFirst({
          where: whereClause,
          with: this.buildWithClause(options.include),
          orderBy: orderByClause.length > 0 ? orderByClause : undefined,
        });
        return result as TSelect | null;
      }
    }

    let query: any = (this.drizzle as any).select().from(this.table);
    if (whereClause) query = query.where(whereClause);
    if (orderByClause.length > 0) query = query.orderBy(...orderByClause);
    if (options.skip) query = query.offset(options.skip);

    const results = await query.limit(1);
    return (results[0] as TSelect) || null;
  }

  /**
   * Find the first record matching the criteria, throwing if not found
   */
  async findFirstOrThrow(options: FindOptions<TSelect> = {}): Promise<TSelect> {
    const result = await this.findFirst(options);
    if (!result) {
      throw new Error(`Record not found in ${this.tableName}`);
    }
    return result;
  }

  /**
   * Find multiple records matching the criteria
   */
  async findMany(options: FindOptions<TSelect> = {}): Promise<TSelect[]> {
    const whereClause = buildWhereClause(this.table, options.where);
    const orderByClause = buildOrderBy(this.table, options.orderBy);

    // Use Drizzle's query API for relations if include is specified
    if (options.include && this.drizzle.query) {
      const queryTable = (this.drizzle.query as any)[this.tableName];
      if (queryTable?.findMany) {
        const results = await queryTable.findMany({
          where: whereClause,
          with: this.buildWithClause(options.include),
          orderBy: orderByClause.length > 0 ? orderByClause : undefined,
          limit: options.take,
          offset: options.skip,
        });
        return results as TSelect[];
      }
    }

    let query: any = (this.drizzle as any).select().from(this.table);
    if (whereClause) query = query.where(whereClause);
    if (orderByClause.length > 0) query = query.orderBy(...orderByClause);
    if (options.take) query = query.limit(options.take);
    if (options.skip) query = query.offset(options.skip);

    const results = await query;
    return results as TSelect[];
  }

  /**
   * Create a new record
   */
  async create(options: CreateOptions<TInsert>): Promise<TSelect> {
    const results = await (this.drizzle as any)
      .insert(this.table)
      .values(options.data as Record<string, unknown>)
      .returning();

    const created = results[0] as TSelect;

    // If include is specified, refetch with relations
    if (options.include && created) {
      const createdObj = created as unknown as Record<string, unknown>;
      if (typeof createdObj === 'object' && createdObj !== null && 'id' in createdObj) {
        const refetched = await this.findUnique({
          where: { id: createdObj.id as string } as unknown as WhereInput<TSelect>,
          include: options.include,
        });
        return refetched || created;
      }
    }

    return created;
  }

  /**
   * Create multiple records
   */
  async createMany(options: { data: TInsert[]; skipDuplicates?: boolean }): Promise<{ count: number }> {
    if (options.data.length === 0) return { count: 0 };

    const drizzle = this.drizzle as any;
    if (options.skipDuplicates) {
      await drizzle
        .insert(this.table)
        .values(options.data as Record<string, unknown>[])
        .onConflictDoNothing();
    } else {
      await drizzle
        .insert(this.table)
        .values(options.data as Record<string, unknown>[]);
    }

    return { count: options.data.length };
  }

  /**
   * Update a single record
   */
  async update(options: UpdateOptions<TSelect, TInsert>): Promise<TSelect> {
    const whereClause = buildWhereClause(this.table, options.where);
    if (!whereClause) throw new Error('Update requires a where clause');

    // Handle increment/decrement operations
    const data = { ...options.data } as Record<string, unknown>;
    const setData: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      const column = (this.table as any)[key] as PgColumn | undefined;
      if (column && typeof value === 'object' && value !== null && !(value instanceof Date)) {
        if ('increment' in value) {
          // Convert increment to SQL expression
          setData[key] = sql`${column} + ${value.increment}`;
        } else if ('decrement' in value) {
          // Convert decrement to SQL expression
          setData[key] = sql`${column} - ${value.decrement}`;
        } else {
          setData[key] = value;
        }
      } else {
        setData[key] = value;
      }
    }

    const results = await (this.drizzle as any)
      .update(this.table)
      .set(setData)
      .where(whereClause)
      .returning();

    const updated = results[0] as TSelect;

    // If include is specified, refetch with relations
    if (options.include && updated) {
      const updatedObj = updated as unknown as Record<string, unknown>;
      if (typeof updatedObj === 'object' && updatedObj !== null && 'id' in updatedObj) {
        const refetched = await this.findUnique({
          where: { id: updatedObj.id as string } as unknown as WhereInput<TSelect>,
          include: options.include,
        });
        return refetched || updated;
      }
    }

    return updated;
  }

  /**
   * Update multiple records
   */
  async updateMany(options: UpdateOptions<TSelect, TInsert>): Promise<{ count: number }> {
    const whereClause = buildWhereClause(this.table, options.where);

    let query: any = (this.drizzle as any).update(this.table).set(options.data as Record<string, unknown>);
    if (whereClause) query = query.where(whereClause);

    const results = await query.returning();
    return { count: results.length };
  }

  /**
   * Delete a single record
   */
  async delete(options: DeleteOptions<TSelect>): Promise<TSelect> {
    const whereClause = buildWhereClause(this.table, options.where);
    if (!whereClause) throw new Error('Delete requires a where clause');

    const results = await (this.drizzle as any)
      .delete(this.table)
      .where(whereClause)
      .returning();

    return results[0] as TSelect;
  }

  /**
   * Delete multiple records
   */
  async deleteMany(options: DeleteOptions<TSelect> = {} as DeleteOptions<TSelect>): Promise<{ count: number }> {
    const whereClause = buildWhereClause(this.table, options.where);

    let query: any = (this.drizzle as any).delete(this.table);
    if (whereClause) query = query.where(whereClause);

    const results = await query.returning();
    return { count: results.length };
  }

  /**
   * Upsert (create or update) a record
   */
  async upsert(options: UpsertOptions<TSelect, TInsert>): Promise<TSelect> {
    const whereClause = buildWhereClause(this.table, options.where);

    // Try to find existing record
    let existing: any[] = [];
    if (whereClause) {
      existing = await (this.drizzle as any)
        .select()
        .from(this.table)
        .where(whereClause)
        .limit(1);
    }

    if (existing.length > 0) {
      // Update existing record
      return this.update({
        where: options.where,
        data: options.update,
        include: options.include,
      });
    } else {
      // Create new record
      return this.create({
        data: options.create,
        include: options.include,
      });
    }
  }

  /**
   * Count records matching the criteria
   */
  async count(options: { where?: WhereInput<TSelect> } = {}): Promise<number> {
    const whereClause = buildWhereClause(this.table, options.where);

    let query: any = (this.drizzle as any).select({ count: drizzleCount() }).from(this.table);
    if (whereClause) query = query.where(whereClause);

    const result = await query;
    return Number(result[0]?.count ?? 0);
  }

  /**
   * Aggregate functions
   */
  async aggregate(options: {
    where?: WhereInput<TSelect>;
    _count?: boolean | { _all?: boolean };
    _sum?: SelectInput;
    _avg?: SelectInput;
    _min?: SelectInput;
    _max?: SelectInput;
  }): Promise<{
    _count?: { _all: number } | number;
    _sum?: Record<string, number | null>;
    _avg?: Record<string, number | null>;
    _min?: Record<string, number | null>;
    _max?: Record<string, number | null>;
  }> {
    const whereClause = buildWhereClause(this.table, options.where);
    const result: {
      _count?: { _all: number } | number;
      _sum?: Record<string, number | null>;
      _avg?: Record<string, number | null>;
      _min?: Record<string, number | null>;
      _max?: Record<string, number | null>;
    } = {};

    if (options._count) {
      let query: any = (this.drizzle as any).select({ count: drizzleCount() }).from(this.table);
      if (whereClause) query = query.where(whereClause);
      const countResult = await query;
      result._count = { _all: Number(countResult[0]?.count ?? 0) };
    }

    // Handle _sum
    if (options._sum) {
      const sumResult: Record<string, number | null> = {};
      for (const [key, shouldSum] of Object.entries(options._sum)) {
        if (shouldSum) {
          const column = (this.table as any)[key] as PgColumn | undefined;
          if (column) {
            let query: any = (this.drizzle as any).select({ sum: sql`SUM(${column})` }).from(this.table);
            if (whereClause) query = query.where(whereClause);
            const queryResult = await query;
            sumResult[key] = queryResult[0]?.sum !== null ? Number(queryResult[0]?.sum) : null;
          }
        }
      }
      result._sum = sumResult;
    }

    // Handle _avg
    if (options._avg) {
      const avgResult: Record<string, number | null> = {};
      for (const [key, shouldAvg] of Object.entries(options._avg)) {
        if (shouldAvg) {
          const column = (this.table as any)[key] as PgColumn | undefined;
          if (column) {
            let query: any = (this.drizzle as any).select({ avg: sql`AVG(${column})` }).from(this.table);
            if (whereClause) query = query.where(whereClause);
            const queryResult = await query;
            avgResult[key] = queryResult[0]?.avg !== null ? Number(queryResult[0]?.avg) : null;
          }
        }
      }
      result._avg = avgResult;
    }

    // Handle _min
    if (options._min) {
      const minResult: Record<string, number | null> = {};
      for (const [key, shouldMin] of Object.entries(options._min)) {
        if (shouldMin) {
          const column = (this.table as any)[key] as PgColumn | undefined;
          if (column) {
            let query: any = (this.drizzle as any).select({ min: sql`MIN(${column})` }).from(this.table);
            if (whereClause) query = query.where(whereClause);
            const queryResult = await query;
            minResult[key] = queryResult[0]?.min !== null ? Number(queryResult[0]?.min) : null;
          }
        }
      }
      result._min = minResult;
    }

    // Handle _max
    if (options._max) {
      const maxResult: Record<string, number | null> = {};
      for (const [key, shouldMax] of Object.entries(options._max)) {
        if (shouldMax) {
          const column = (this.table as any)[key] as PgColumn | undefined;
          if (column) {
            let query: any = (this.drizzle as any).select({ max: sql`MAX(${column})` }).from(this.table);
            if (whereClause) query = query.where(whereClause);
            const queryResult = await query;
            maxResult[key] = queryResult[0]?.max !== null ? Number(queryResult[0]?.max) : null;
          }
        }
      }
      result._max = maxResult;
    }

    return result;
  }

  /**
   * Group by with aggregation
   */
  async groupBy<TKey extends keyof TSelect>(options: {
    by: TKey[];
    where?: WhereInput<TSelect>;
    _count?: SelectInput | boolean;
    _sum?: SelectInput;
    _avg?: SelectInput;
    _min?: SelectInput;
    _max?: SelectInput;
    orderBy?: OrderByInput<TSelect>;
    take?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const whereClause = buildWhereClause(this.table, options.where);

    // Build select clause with group by columns and aggregations
    const selectFields: Record<string, unknown> = {};
    let countKey: string | null = null;

    // Add group by columns
    for (const key of options.by) {
       
      const column = (this.table as any)[key as string] as PgColumn | undefined;
      if (column) {
        selectFields[key as string] = column;
      }
    }

    // Track if we should return simple count (boolean _count) vs nested (_count.fieldName)
    let simpleCount = false;

    // Add count if specified - store the key for later transformation
    if (options._count) {
      if (typeof options._count === 'boolean' && options._count) {
        selectFields._countValue = drizzleCount();
        countKey = '_all';
        simpleCount = true;
      } else if (typeof options._count === 'object') {
        // Count specific columns - use first key
        const keys = Object.keys(options._count);
        if (keys.length > 0) {
          countKey = keys[0] ?? null;
          selectFields._countValue = drizzleCount();
        }
      }
    }

    // Build group by clause
    const groupByColumns: PgColumn[] = [];
    for (const key of options.by) {
       
      const column = (this.table as any)[key as string] as PgColumn | undefined;
      if (column) {
        groupByColumns.push(column);
      }
    }

     
    let query: any = (this.drizzle as any).select(selectFields).from(this.table);
    if (whereClause) query = query.where(whereClause);
    if (groupByColumns.length > 0) query = query.groupBy(...groupByColumns);

    const orderByClause = buildOrderBy(this.table, options.orderBy);
    if (orderByClause.length > 0) query = query.orderBy(...orderByClause);

    if (options.take) query = query.limit(options.take);

    const results = await query;

    // Transform results to match groupBy format
    // Returns { groupByColumn: value, _count: number } for boolean _count
    // Or { groupByColumn: value, _count: { columnName: count } } for object _count
    return (results as Array<Record<string, unknown>>).map(row => {
      const transformed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key === '_countValue' && countKey) {
          if (simpleCount) {
            // For _count: true, return count directly
            transformed._count = Number(value);
          } else {
            // For _count: { field: true }, return nested object
            transformed._count = { [countKey]: Number(value) };
          }
        } else {
          transformed[key] = value;
        }
      }
      return transformed;
    });
  }
}

// ============================================================================
// Type Helpers for Model Types
// ============================================================================

// Infer select type from Drizzle table
type InferSelect<T extends PgTable> = T['$inferSelect'];
// Infer insert type from Drizzle table
type InferInsert<T extends PgTable> = T['$inferInsert'];

// ============================================================================
// DrizzleClient Interface
// ============================================================================

export interface DrizzleClient {
  // Core Drizzle methods
  select: SchemaDatabase['select'];
  selectDistinct: SchemaDatabase['selectDistinct'];
  selectDistinctOn: SchemaDatabase['selectDistinctOn'];
  insert: SchemaDatabase['insert'];
  update: SchemaDatabase['update'];
  delete: SchemaDatabase['delete'];
  execute: SchemaDatabase['execute'];
  transaction: SchemaDatabase['transaction'];
  query: SchemaDatabase['query'];

  // Connection management
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
  $transaction: <T>(callback: (tx: DrizzleClient) => Promise<T>) => Promise<T>;
  
  // Raw SQL queries
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;

  // Model repositories
  user: TableRepository<typeof schema.users, InferSelect<typeof schema.users>, InferInsert<typeof schema.users>>;
  actor: TableRepository<typeof schema.actors, InferSelect<typeof schema.actors>, InferInsert<typeof schema.actors>>;
  actorFollow: TableRepository<typeof schema.actorFollows, InferSelect<typeof schema.actorFollows>, InferInsert<typeof schema.actorFollows>>;
  actorRelationship: TableRepository<typeof schema.actorRelationships, InferSelect<typeof schema.actorRelationships>, InferInsert<typeof schema.actorRelationships>>;
  post: TableRepository<typeof schema.posts, InferSelect<typeof schema.posts>, InferInsert<typeof schema.posts>>;
  comment: TableRepository<typeof schema.comments, InferSelect<typeof schema.comments>, InferInsert<typeof schema.comments>>;
  reaction: TableRepository<typeof schema.reactions, InferSelect<typeof schema.reactions>, InferInsert<typeof schema.reactions>>;
  share: TableRepository<typeof schema.shares, InferSelect<typeof schema.shares>, InferInsert<typeof schema.shares>>;
  market: TableRepository<typeof schema.markets, InferSelect<typeof schema.markets>, InferInsert<typeof schema.markets>>;
  position: TableRepository<typeof schema.positions, InferSelect<typeof schema.positions>, InferInsert<typeof schema.positions>>;
  perpPosition: TableRepository<typeof schema.perpPositions, InferSelect<typeof schema.perpPositions>, InferInsert<typeof schema.perpPositions>>;
  pool: TableRepository<typeof schema.pools, InferSelect<typeof schema.pools>, InferInsert<typeof schema.pools>>;
  poolPosition: TableRepository<typeof schema.poolPositions, InferSelect<typeof schema.poolPositions>, InferInsert<typeof schema.poolPositions>>;
  poolDeposit: TableRepository<typeof schema.poolDeposits, InferSelect<typeof schema.poolDeposits>, InferInsert<typeof schema.poolDeposits>>;
  organization: TableRepository<typeof schema.organizations, InferSelect<typeof schema.organizations>, InferInsert<typeof schema.organizations>>;
  stockPrice: TableRepository<typeof schema.stockPrices, InferSelect<typeof schema.stockPrices>, InferInsert<typeof schema.stockPrices>>;
  question: TableRepository<typeof schema.questions, InferSelect<typeof schema.questions>, InferInsert<typeof schema.questions>>;
  predictionPriceHistory: TableRepository<typeof schema.predictionPriceHistories, InferSelect<typeof schema.predictionPriceHistories>, InferInsert<typeof schema.predictionPriceHistories>>;
  chat: TableRepository<typeof schema.chats, InferSelect<typeof schema.chats>, InferInsert<typeof schema.chats>>;
  chatParticipant: TableRepository<typeof schema.chatParticipants, InferSelect<typeof schema.chatParticipants>, InferInsert<typeof schema.chatParticipants>>;
  chatAdmin: TableRepository<typeof schema.chatAdmins, InferSelect<typeof schema.chatAdmins>, InferInsert<typeof schema.chatAdmins>>;
  chatInvite: TableRepository<typeof schema.chatInvites, InferSelect<typeof schema.chatInvites>, InferInsert<typeof schema.chatInvites>>;
  message: TableRepository<typeof schema.messages, InferSelect<typeof schema.messages>, InferInsert<typeof schema.messages>>;
  notification: TableRepository<typeof schema.notifications, InferSelect<typeof schema.notifications>, InferInsert<typeof schema.notifications>>;
  dmAcceptance: TableRepository<typeof schema.dmAcceptances, InferSelect<typeof schema.dmAcceptances>, InferInsert<typeof schema.dmAcceptances>>;
  groupChatMembership: TableRepository<typeof schema.groupChatMemberships, InferSelect<typeof schema.groupChatMemberships>, InferInsert<typeof schema.groupChatMemberships>>;
  userInteraction: TableRepository<typeof schema.userInteractions, InferSelect<typeof schema.userInteractions>, InferInsert<typeof schema.userInteractions>>;
  agentRegistry: TableRepository<typeof schema.agentRegistries, InferSelect<typeof schema.agentRegistries>, InferInsert<typeof schema.agentRegistries>>;
  agentCapability: TableRepository<typeof schema.agentCapabilities, InferSelect<typeof schema.agentCapabilities>, InferInsert<typeof schema.agentCapabilities>>;
  agentLog: TableRepository<typeof schema.agentLogs, InferSelect<typeof schema.agentLogs>, InferInsert<typeof schema.agentLogs>>;
  agentMessage: TableRepository<typeof schema.agentMessages, InferSelect<typeof schema.agentMessages>, InferInsert<typeof schema.agentMessages>>;
  agentPerformanceMetrics: TableRepository<typeof schema.agentPerformanceMetrics, InferSelect<typeof schema.agentPerformanceMetrics>, InferInsert<typeof schema.agentPerformanceMetrics>>;
  agentGoal: TableRepository<typeof schema.agentGoals, InferSelect<typeof schema.agentGoals>, InferInsert<typeof schema.agentGoals>>;
  agentGoalAction: TableRepository<typeof schema.agentGoalActions, InferSelect<typeof schema.agentGoalActions>, InferInsert<typeof schema.agentGoalActions>>;
  agentPointsTransaction: TableRepository<typeof schema.agentPointsTransactions, InferSelect<typeof schema.agentPointsTransactions>, InferInsert<typeof schema.agentPointsTransactions>>;
  agentTrade: TableRepository<typeof schema.agentTrades, InferSelect<typeof schema.agentTrades>, InferInsert<typeof schema.agentTrades>>;
  externalAgentConnection: TableRepository<typeof schema.externalAgentConnections, InferSelect<typeof schema.externalAgentConnections>, InferInsert<typeof schema.externalAgentConnections>>;
  npcTrade: TableRepository<typeof schema.npcTrades, InferSelect<typeof schema.npcTrades>, InferInsert<typeof schema.npcTrades>>;
  npcInteraction: TableRepository<typeof schema.npcInteractions, InferSelect<typeof schema.npcInteractions>, InferInsert<typeof schema.npcInteractions>>;
  tradingFee: TableRepository<typeof schema.tradingFees, InferSelect<typeof schema.tradingFees>, InferInsert<typeof schema.tradingFees>>;
  balanceTransaction: TableRepository<typeof schema.balanceTransactions, InferSelect<typeof schema.balanceTransactions>, InferInsert<typeof schema.balanceTransactions>>;
  pointsTransaction: TableRepository<typeof schema.pointsTransactions, InferSelect<typeof schema.pointsTransactions>, InferInsert<typeof schema.pointsTransactions>>;
  userActorFollow: TableRepository<typeof schema.userActorFollows, InferSelect<typeof schema.userActorFollows>, InferInsert<typeof schema.userActorFollows>>;
  userGroup: TableRepository<typeof schema.userGroups, InferSelect<typeof schema.userGroups>, InferInsert<typeof schema.userGroups>>;
  userGroupAdmin: TableRepository<typeof schema.userGroupAdmins, InferSelect<typeof schema.userGroupAdmins>, InferInsert<typeof schema.userGroupAdmins>>;
  userGroupInvite: TableRepository<typeof schema.userGroupInvites, InferSelect<typeof schema.userGroupInvites>, InferInsert<typeof schema.userGroupInvites>>;
  userGroupMember: TableRepository<typeof schema.userGroupMembers, InferSelect<typeof schema.userGroupMembers>, InferInsert<typeof schema.userGroupMembers>>;
  userBlock: TableRepository<typeof schema.userBlocks, InferSelect<typeof schema.userBlocks>, InferInsert<typeof schema.userBlocks>>;
  userMute: TableRepository<typeof schema.userMutes, InferSelect<typeof schema.userMutes>, InferInsert<typeof schema.userMutes>>;
  report: TableRepository<typeof schema.reports, InferSelect<typeof schema.reports>, InferInsert<typeof schema.reports>>;
  twitterOAuthToken: TableRepository<typeof schema.twitterOAuthTokens, InferSelect<typeof schema.twitterOAuthTokens>, InferInsert<typeof schema.twitterOAuthTokens>>;
  onboardingIntent: TableRepository<typeof schema.onboardingIntents, InferSelect<typeof schema.onboardingIntents>, InferInsert<typeof schema.onboardingIntents>>;
  favorite: TableRepository<typeof schema.favorites, InferSelect<typeof schema.favorites>, InferInsert<typeof schema.favorites>>;
  follow: TableRepository<typeof schema.follows, InferSelect<typeof schema.follows>, InferInsert<typeof schema.follows>>;
  followStatus: TableRepository<typeof schema.followStatuses, InferSelect<typeof schema.followStatuses>, InferInsert<typeof schema.followStatuses>>;
  profileUpdateLog: TableRepository<typeof schema.profileUpdateLogs, InferSelect<typeof schema.profileUpdateLogs>, InferInsert<typeof schema.profileUpdateLogs>>;
  shareAction: TableRepository<typeof schema.shareActions, InferSelect<typeof schema.shareActions>, InferInsert<typeof schema.shareActions>>;
  tag: TableRepository<typeof schema.tags, InferSelect<typeof schema.tags>, InferInsert<typeof schema.tags>>;
  postTag: TableRepository<typeof schema.postTags, InferSelect<typeof schema.postTags>, InferInsert<typeof schema.postTags>>;
  trendingTag: TableRepository<typeof schema.trendingTags, InferSelect<typeof schema.trendingTags>, InferInsert<typeof schema.trendingTags>>;
  llmCallLog: TableRepository<typeof schema.llmCallLogs, InferSelect<typeof schema.llmCallLogs>, InferInsert<typeof schema.llmCallLogs>>;
  marketOutcome: TableRepository<typeof schema.marketOutcomes, InferSelect<typeof schema.marketOutcomes>, InferInsert<typeof schema.marketOutcomes>>;
  trainedModel: TableRepository<typeof schema.trainedModels, InferSelect<typeof schema.trainedModels>, InferInsert<typeof schema.trainedModels>>;
  trainingBatch: TableRepository<typeof schema.trainingBatches, InferSelect<typeof schema.trainingBatches>, InferInsert<typeof schema.trainingBatches>>;
  benchmarkResult: TableRepository<typeof schema.benchmarkResults, InferSelect<typeof schema.benchmarkResults>, InferInsert<typeof schema.benchmarkResults>>;
  trajectory: TableRepository<typeof schema.trajectories, InferSelect<typeof schema.trajectories>, InferInsert<typeof schema.trajectories>>;
  rewardJudgment: TableRepository<typeof schema.rewardJudgments, InferSelect<typeof schema.rewardJudgments>, InferInsert<typeof schema.rewardJudgments>>;
  oracleCommitment: TableRepository<typeof schema.oracleCommitments, InferSelect<typeof schema.oracleCommitments>, InferInsert<typeof schema.oracleCommitments>>;
  oracleTransaction: TableRepository<typeof schema.oracleTransactions, InferSelect<typeof schema.oracleTransactions>, InferInsert<typeof schema.oracleTransactions>>;
  realtimeOutbox: TableRepository<typeof schema.realtimeOutboxes, InferSelect<typeof schema.realtimeOutboxes>, InferInsert<typeof schema.realtimeOutboxes>>;
  game: TableRepository<typeof schema.games, InferSelect<typeof schema.games>, InferInsert<typeof schema.games>>;
  gameConfig: TableRepository<typeof schema.gameConfigs, InferSelect<typeof schema.gameConfigs>, InferInsert<typeof schema.gameConfigs>>;
  oAuthState: TableRepository<typeof schema.oAuthStates, InferSelect<typeof schema.oAuthStates>, InferInsert<typeof schema.oAuthStates>>;
  systemSettings: TableRepository<typeof schema.systemSettings, InferSelect<typeof schema.systemSettings>, InferInsert<typeof schema.systemSettings>>;
  worldEvent: TableRepository<typeof schema.worldEvents, InferSelect<typeof schema.worldEvents>, InferInsert<typeof schema.worldEvents>>;
  worldFact: TableRepository<typeof schema.worldFacts, InferSelect<typeof schema.worldFacts>, InferInsert<typeof schema.worldFacts>>;
  rssFeedSource: TableRepository<typeof schema.rssFeedSources, InferSelect<typeof schema.rssFeedSources>, InferInsert<typeof schema.rssFeedSources>>;
  rssHeadline: TableRepository<typeof schema.rssHeadlines, InferSelect<typeof schema.rssHeadlines>, InferInsert<typeof schema.rssHeadlines>>;
  parodyHeadline: TableRepository<typeof schema.parodyHeadlines, InferSelect<typeof schema.parodyHeadlines>, InferInsert<typeof schema.parodyHeadlines>>;
  characterMapping: TableRepository<typeof schema.characterMappings, InferSelect<typeof schema.characterMappings>, InferInsert<typeof schema.characterMappings>>;
  organizationMapping: TableRepository<typeof schema.organizationMappings, InferSelect<typeof schema.organizationMappings>, InferInsert<typeof schema.organizationMappings>>;
  moderationEscrow: TableRepository<typeof schema.moderationEscrows, InferSelect<typeof schema.moderationEscrows>, InferInsert<typeof schema.moderationEscrows>>;
  generationLock: TableRepository<typeof schema.generationLocks, InferSelect<typeof schema.generationLocks>, InferInsert<typeof schema.generationLocks>>;
  feedback: TableRepository<typeof schema.feedbacks, InferSelect<typeof schema.feedbacks>, InferInsert<typeof schema.feedbacks>>;
  referral: TableRepository<typeof schema.referrals, InferSelect<typeof schema.referrals>, InferInsert<typeof schema.referrals>>;
  widgetCache: TableRepository<typeof schema.widgetCaches, InferSelect<typeof schema.widgetCaches>, InferInsert<typeof schema.widgetCaches>>;
}

// ============================================================================
// Client Factory
// ============================================================================

export function createDrizzleClient(drizzle: SchemaDatabase): DrizzleClient {
  const $connect = async (): Promise<void> => {
    // No-op - Drizzle handles connections automatically
  };
  
  const $disconnect = async (): Promise<void> => {
    const { closeDatabase } = await import('./index');
    await closeDatabase();
  };

  const $transaction = async <T>(callback: (tx: DrizzleClient) => Promise<T>): Promise<T> => {
    return drizzle.transaction(async (tx) => {
      const txClient = createDrizzleClient(tx as unknown as SchemaDatabase);
      return callback(txClient);
    });
  };

  // $queryRaw as a tagged template function - use sql to construct the query
  const $queryRaw = async <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    // Call sql as a function with template strings and values
    const query = (sql as any)(strings, ...values);
    const result = await drizzle.execute(query);
    return result as unknown as T[];
  };

  const $executeRaw = async (strings: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
    // Call sql as a function with template strings and values
    const query = (sql as any)(strings, ...values);
    await drizzle.execute(query);
    return 1; // Drizzle doesn't return affected rows count directly
  };

  return {
    // Core Drizzle methods
    select: drizzle.select.bind(drizzle),
    selectDistinct: drizzle.selectDistinct.bind(drizzle),
    selectDistinctOn: drizzle.selectDistinctOn.bind(drizzle),
    insert: drizzle.insert.bind(drizzle),
    update: drizzle.update.bind(drizzle),
    delete: drizzle.delete.bind(drizzle),
    execute: drizzle.execute.bind(drizzle),
    transaction: drizzle.transaction.bind(drizzle),
    query: drizzle.query,

    // Connection management
    $connect,
    $disconnect,
    $transaction,
    $queryRaw,
    $executeRaw,

    // Model repositories
    user: new TableRepository(drizzle, schema.users, 'users'),
    actor: new TableRepository(drizzle, schema.actors, 'actors'),
    actorFollow: new TableRepository(drizzle, schema.actorFollows, 'actorFollows'),
    actorRelationship: new TableRepository(drizzle, schema.actorRelationships, 'actorRelationships'),
    post: new TableRepository(drizzle, schema.posts, 'posts'),
    comment: new TableRepository(drizzle, schema.comments, 'comments'),
    reaction: new TableRepository(drizzle, schema.reactions, 'reactions'),
    share: new TableRepository(drizzle, schema.shares, 'shares'),
    market: new TableRepository(drizzle, schema.markets, 'markets'),
    position: new TableRepository(drizzle, schema.positions, 'positions'),
    perpPosition: new TableRepository(drizzle, schema.perpPositions, 'perpPositions'),
    pool: new TableRepository(drizzle, schema.pools, 'pools'),
    poolPosition: new TableRepository(drizzle, schema.poolPositions, 'poolPositions'),
    poolDeposit: new TableRepository(drizzle, schema.poolDeposits, 'poolDeposits'),
    organization: new TableRepository(drizzle, schema.organizations, 'organizations'),
    stockPrice: new TableRepository(drizzle, schema.stockPrices, 'stockPrices'),
    question: new TableRepository(drizzle, schema.questions, 'questions'),
    predictionPriceHistory: new TableRepository(drizzle, schema.predictionPriceHistories, 'predictionPriceHistories'),
    chat: new TableRepository(drizzle, schema.chats, 'chats'),
    chatParticipant: new TableRepository(drizzle, schema.chatParticipants, 'chatParticipants'),
    chatAdmin: new TableRepository(drizzle, schema.chatAdmins, 'chatAdmins'),
    chatInvite: new TableRepository(drizzle, schema.chatInvites, 'chatInvites'),
    message: new TableRepository(drizzle, schema.messages, 'messages'),
    notification: new TableRepository(drizzle, schema.notifications, 'notifications'),
    dmAcceptance: new TableRepository(drizzle, schema.dmAcceptances, 'dmAcceptances'),
    groupChatMembership: new TableRepository(drizzle, schema.groupChatMemberships, 'groupChatMemberships'),
    userInteraction: new TableRepository(drizzle, schema.userInteractions, 'userInteractions'),
    agentRegistry: new TableRepository(drizzle, schema.agentRegistries, 'agentRegistries'),
    agentCapability: new TableRepository(drizzle, schema.agentCapabilities, 'agentCapabilities'),
    agentLog: new TableRepository(drizzle, schema.agentLogs, 'agentLogs'),
    agentMessage: new TableRepository(drizzle, schema.agentMessages, 'agentMessages'),
    agentPerformanceMetrics: new TableRepository(drizzle, schema.agentPerformanceMetrics, 'agentPerformanceMetrics'),
    agentGoal: new TableRepository(drizzle, schema.agentGoals, 'agentGoals'),
    agentGoalAction: new TableRepository(drizzle, schema.agentGoalActions, 'agentGoalActions'),
    agentPointsTransaction: new TableRepository(drizzle, schema.agentPointsTransactions, 'agentPointsTransactions'),
    agentTrade: new TableRepository(drizzle, schema.agentTrades, 'agentTrades'),
    externalAgentConnection: new TableRepository(drizzle, schema.externalAgentConnections, 'externalAgentConnections'),
    npcTrade: new TableRepository(drizzle, schema.npcTrades, 'npcTrades'),
    npcInteraction: new TableRepository(drizzle, schema.npcInteractions, 'npcInteractions'),
    tradingFee: new TableRepository(drizzle, schema.tradingFees, 'tradingFees'),
    balanceTransaction: new TableRepository(drizzle, schema.balanceTransactions, 'balanceTransactions'),
    pointsTransaction: new TableRepository(drizzle, schema.pointsTransactions, 'pointsTransactions'),
    userActorFollow: new TableRepository(drizzle, schema.userActorFollows, 'userActorFollows'),
    userGroup: new TableRepository(drizzle, schema.userGroups, 'userGroups'),
    userGroupAdmin: new TableRepository(drizzle, schema.userGroupAdmins, 'userGroupAdmins'),
    userGroupInvite: new TableRepository(drizzle, schema.userGroupInvites, 'userGroupInvites'),
    userGroupMember: new TableRepository(drizzle, schema.userGroupMembers, 'userGroupMembers'),
    userBlock: new TableRepository(drizzle, schema.userBlocks, 'userBlocks'),
    userMute: new TableRepository(drizzle, schema.userMutes, 'userMutes'),
    report: new TableRepository(drizzle, schema.reports, 'reports'),
    twitterOAuthToken: new TableRepository(drizzle, schema.twitterOAuthTokens, 'twitterOAuthTokens'),
    onboardingIntent: new TableRepository(drizzle, schema.onboardingIntents, 'onboardingIntents'),
    favorite: new TableRepository(drizzle, schema.favorites, 'favorites'),
    follow: new TableRepository(drizzle, schema.follows, 'follows'),
    followStatus: new TableRepository(drizzle, schema.followStatuses, 'followStatuses'),
    profileUpdateLog: new TableRepository(drizzle, schema.profileUpdateLogs, 'profileUpdateLogs'),
    shareAction: new TableRepository(drizzle, schema.shareActions, 'shareActions'),
    tag: new TableRepository(drizzle, schema.tags, 'tags'),
    postTag: new TableRepository(drizzle, schema.postTags, 'postTags'),
    trendingTag: new TableRepository(drizzle, schema.trendingTags, 'trendingTags'),
    llmCallLog: new TableRepository(drizzle, schema.llmCallLogs, 'llmCallLogs'),
    marketOutcome: new TableRepository(drizzle, schema.marketOutcomes, 'marketOutcomes'),
    trainedModel: new TableRepository(drizzle, schema.trainedModels, 'trainedModels'),
    trainingBatch: new TableRepository(drizzle, schema.trainingBatches, 'trainingBatches'),
    benchmarkResult: new TableRepository(drizzle, schema.benchmarkResults, 'benchmarkResults'),
    trajectory: new TableRepository(drizzle, schema.trajectories, 'trajectories'),
    rewardJudgment: new TableRepository(drizzle, schema.rewardJudgments, 'rewardJudgments'),
    oracleCommitment: new TableRepository(drizzle, schema.oracleCommitments, 'oracleCommitments'),
    oracleTransaction: new TableRepository(drizzle, schema.oracleTransactions, 'oracleTransactions'),
    realtimeOutbox: new TableRepository(drizzle, schema.realtimeOutboxes, 'realtimeOutboxes'),
    game: new TableRepository(drizzle, schema.games, 'games'),
    gameConfig: new TableRepository(drizzle, schema.gameConfigs, 'gameConfigs'),
    oAuthState: new TableRepository(drizzle, schema.oAuthStates, 'oAuthStates'),
    systemSettings: new TableRepository(drizzle, schema.systemSettings, 'systemSettings'),
    worldEvent: new TableRepository(drizzle, schema.worldEvents, 'worldEvents'),
    worldFact: new TableRepository(drizzle, schema.worldFacts, 'worldFacts'),
    rssFeedSource: new TableRepository(drizzle, schema.rssFeedSources, 'rssFeedSources'),
    rssHeadline: new TableRepository(drizzle, schema.rssHeadlines, 'rssHeadlines'),
    parodyHeadline: new TableRepository(drizzle, schema.parodyHeadlines, 'parodyHeadlines'),
    characterMapping: new TableRepository(drizzle, schema.characterMappings, 'characterMappings'),
    organizationMapping: new TableRepository(drizzle, schema.organizationMappings, 'organizationMappings'),
    moderationEscrow: new TableRepository(drizzle, schema.moderationEscrows, 'moderationEscrows'),
    generationLock: new TableRepository(drizzle, schema.generationLocks, 'generationLocks'),
    feedback: new TableRepository(drizzle, schema.feedbacks, 'feedbacks'),
    referral: new TableRepository(drizzle, schema.referrals, 'referrals'),
    widgetCache: new TableRepository(drizzle, schema.widgetCaches, 'widgetCaches'),
  };
}
