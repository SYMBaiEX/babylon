/**
 * Drizzle ORM Database Client - Serverless Optimized
 *
 * @description Provides a complete database abstraction layer using Drizzle ORM.
 * Replaces Prisma with a pure TypeScript solution that works seamlessly
 * on Apple Silicon and in containerized environments.
 *
 * Features:
 * - Automatic retry with exponential backoff on connection failures
 * - Connection pooling optimized for serverless (limited connections)
 * - Query monitoring and performance tracking
 * - Row Level Security (RLS) context support
 * - Lazy initialization for Edge Runtime compatibility
 * - Graceful connection lifecycle management
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';
import { logger } from '@/lib/logger';

// Export schema for use in queries
export { schema };
export * from './schema';

// Types
export type Database = PostgresJsDatabase<typeof schema>;
export type TransactionClient = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

// Global singleton for connection reuse
const globalForDb = globalThis as unknown as {
  postgresClient: Sql | undefined;
  db: Database | undefined;
};

// Check if we're in Next.js build phase
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

/**
 * Check if we're in a test environment
 */
function isTestEnvironment(): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
    return true;
  }

  // Check process.argv for test commands
  if (typeof process !== 'undefined' && process.argv) {
    const args = process.argv.join(' ');
    if (
      args.includes('bun test') ||
      args.includes('bunx test') ||
      args.includes('bun run test')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get the database connection URL with optimized connection pool parameters
 */
function getOptimizedConnectionUrl(): string {
  const baseUrl =
    process.env.PRISMA_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://localhost:5432/babylon';

  // Don't modify URLs for non-production environments unless specified
  if (!baseUrl.includes('?')) {
    return baseUrl;
  }

  return baseUrl;
}

/**
 * Create the postgres.js client with optimized settings
 */
function createPostgresClient(): Sql {
  const connectionUrl = getOptimizedConnectionUrl();
  const isTest = isTestEnvironment();
  const isProd = process.env.NODE_ENV === 'production';

  // Connection pool settings
  const poolSettings = {
    // Connection limits
    max: isProd ? 50 : isTest ? 5 : 10,
    idle_timeout: isProd ? 30 : 20,
    connect_timeout: 10,

    // SSL configuration for production
    ssl:
      isProd && !connectionUrl.includes('localhost')
        ? ('require' as const)
        : false,

    // Connection lifecycle hooks
    onnotice: () => {
      // Suppress notices in production
    },

    // Transform options
    transform: {
      undefined: null,
    },
  };

  logger.info('[Drizzle] Creating database connection', {
    maxConnections: poolSettings.max,
    idleTimeout: poolSettings.idle_timeout,
    environment: process.env.NODE_ENV,
  });

  return postgres(connectionUrl, poolSettings);
}

/**
 * Get or create the postgres client singleton
 */
function getPostgresClient(): Sql | null {
  const isTest = isTestEnvironment();

  // Skip initialization during build time (but not during tests)
  if (isBuildTime && !isTest) {
    logger.info(
      '[Drizzle] Build time detected - skipping database initialization'
    );
    return null;
  }

  if (!globalForDb.postgresClient) {
    const connectionUrl =
      process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL;

    if (!connectionUrl) {
      if (isTest) {
        throw new Error(
          'DATABASE_URL is required in test environment. Please set DATABASE_URL or PRISMA_DATABASE_URL.'
        );
      }
      logger.warn('[Drizzle] No DATABASE_URL set - database not initialized');
      return null;
    }

    try {
      globalForDb.postgresClient = createPostgresClient();
    } catch (error) {
      if (isTest) {
        throw error;
      }
      logger.error('[Drizzle] Failed to create database client', { error });
      return null;
    }
  }

  return globalForDb.postgresClient;
}

/**
 * Get or create the Drizzle database instance
 */
function getDrizzleInstance(): Database | null {
  if (!globalForDb.db) {
    const client = getPostgresClient();
    if (!client) {
      return null;
    }

    globalForDb.db = drizzle(client, {
      schema,
      logger: process.env.NODE_ENV === 'development',
    });

    logger.info('[Drizzle] Created new Drizzle ORM instance');
  }

  return globalForDb.db;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

const defaultRetryConfig: RetryConfig = isTestEnvironment()
  ? { maxRetries: 2, initialDelayMs: 50, maxDelayMs: 500, jitter: false }
  : { maxRetries: 5, initialDelayMs: 100, maxDelayMs: 5000, jitter: true };

/**
 * Execute a database operation with retry logic
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = defaultRetryConfig
): Promise<T> {
  let lastError: Error | undefined;
  let delay = config.initialDelayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable (connection errors, deadlocks, etc.)
      const isRetryable =
        lastError.message.includes('connection') ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('deadlock') ||
        lastError.message.includes('ECONNREFUSED') ||
        lastError.message.includes('ENOTFOUND');

      if (!isRetryable || attempt === config.maxRetries) {
        throw lastError;
      }

      logger.warn(`[Drizzle] Retry attempt ${attempt + 1}/${config.maxRetries}`, {
        error: lastError.message,
        delay,
      });

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Exponential backoff
      delay = Math.min(delay * 2, config.maxDelayMs);
      if (config.jitter) {
        delay += Math.random() * delay * 0.1;
      }
    }
  }

  throw lastError;
}

/**
 * Create a lazy proxy for the database instance
 * This allows the database to be accessed even if DATABASE_URL is set after module load
 */
function createLazyDbProxy(): Database {
  return new Proxy({} as Database, {
    get(_target, prop: string | symbol) {
      const instance = getDrizzleInstance();
      if (!instance) {
        if (isBuildTime) {
          // Return a no-op function during build time
          return () => Promise.resolve(null);
        }
        throw new Error(
          'Database not initialized. Check DATABASE_URL environment variable.'
        );
      }
      return instance[prop as keyof Database];
    },
  });
}

/**
 * Main database instance - uses lazy proxy for Edge Runtime compatibility
 */
export const db: Database = createLazyDbProxy();

/**
 * Execute a database operation within a transaction
 */
export async function withTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  const instance = getDrizzleInstance();
  if (!instance) {
    throw new Error('Database not initialized');
  }

  return withRetry(() => instance.transaction(fn));
}

/**
 * RLS Context Support
 * Execute operations with Row Level Security context
 */

/**
 * Execute a database operation as a specific user (with RLS)
 */
export async function asUser<T>(
  userId: string,
  operation: (database: Database) => Promise<T>
): Promise<T> {
  // Validate userId format (UUID or Privy DID)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const privyDidRegex = /^did:privy:[a-z0-9]+$/i;

  if (!uuidRegex.test(userId) && !privyDidRegex.test(userId)) {
    throw new Error(
      `Invalid userId format: ${userId}. Must be a valid UUID or Privy DID.`
    );
  }

  const instance = getDrizzleInstance();
  if (!instance) {
    throw new Error('Database not initialized');
  }

  return withRetry(() =>
    instance.transaction(async (tx) => {
      // Set the current user ID for RLS
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', ${userId}, true)`
      );
      // Execute operation with the transaction as a Database-like object
      return await operation(tx as unknown as Database);
    })
  );
}

/**
 * Execute a database operation as system (bypass RLS)
 */
export async function asSystem<T>(
  operation: (database: Database) => Promise<T>,
  operationName?: string
): Promise<T> {
  const startTime = Date.now();

  logger.warn('[Drizzle] System operation initiated', {
    operation: operationName || 'unknown',
    timestamp: new Date().toISOString(),
  });

  const instance = getDrizzleInstance();
  if (!instance) {
    throw new Error('Database not initialized');
  }

  const result = await withRetry(() =>
    instance.transaction(async (tx) => {
      // Set system context marker
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', 'system', true)`
      );
      return await operation(tx as unknown as Database);
    })
  );

  const duration = Date.now() - startTime;
  logger.info('[Drizzle] System operation completed', {
    operation: operationName || 'unknown',
    duration: `${duration}ms`,
  });

  return result;
}

/**
 * Execute a database operation as public (unauthenticated)
 */
export async function asPublic<T>(
  operation: (database: Database) => Promise<T>
): Promise<T> {
  const instance = getDrizzleInstance();
  if (!instance) {
    throw new Error('Database not initialized');
  }

  return withRetry(() =>
    instance.transaction(async (tx) => {
      // Empty string indicates public/unauthenticated access
      await tx.execute(sql`SELECT set_config('app.current_user_id', '', true)`);
      return await operation(tx as unknown as Database);
    })
  );
}

/**
 * Health check - verify database connectivity
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const instance = getDrizzleInstance();
    if (!instance) {
      return false;
    }
    await instance.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Graceful shutdown - close database connections
 */
export async function closeDatabase(): Promise<void> {
  if (globalForDb.postgresClient) {
    await globalForDb.postgresClient.end();
    globalForDb.postgresClient = undefined;
    globalForDb.db = undefined;
    logger.info('[Drizzle] Database connections closed');
  }
}

/**
 * Direct SQL execution helper (for raw queries)
 */
export async function executeRaw<T = unknown>(
  query: ReturnType<typeof sql>
): Promise<T[]> {
  const instance = getDrizzleInstance();
  if (!instance) {
    throw new Error('Database not initialized');
  }

  const result = await withRetry(() => instance.execute(query));
  return result as T[];
}

/**
 * Query performance monitoring
 */
interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
}

const queryMetrics: QueryMetrics[] = [];
const MAX_METRICS = 1000;

export function recordQueryMetrics(metrics: QueryMetrics): void {
  queryMetrics.push(metrics);
  if (queryMetrics.length > MAX_METRICS) {
    queryMetrics.shift();
  }
}

export function getQueryMetrics(): QueryMetrics[] {
  return [...queryMetrics];
}

export function getSlowQueries(thresholdMs: number = 100): QueryMetrics[] {
  return queryMetrics.filter((m) => m.duration > thresholdMs);
}
