/**
 * Test Setup Helper
 *
 * Ensures consistent test environment setup across all test suites.
 * Handles Prisma initialization and database readiness checks.
 */

import { prisma } from '@/lib/prisma';

/**
 * Check if database is available and properly configured
 */
export async function ensureDatabaseReady(): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL;

  if (!databaseUrl) {
    console.warn('⚠️  No DATABASE_URL found - database tests will be skipped');
    return false;
  }

  try {
    // Try a simple query to ensure connection works
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.warn('⚠️  Database connection failed:', error);
    return false;
  }
}

/**
 * Setup test environment
 * Call this in beforeAll() hooks for tests that need database
 */
export async function setupTestEnvironment() {
  // Ensure DATABASE_URL is available
  if (!process.env.DATABASE_URL && process.env.PRISMA_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PRISMA_DATABASE_URL;
  }

  // Check database readiness
  const dbReady = await ensureDatabaseReady();
  if (!dbReady) {
    throw new Error(
      'Database is not available. Make sure DATABASE_URL is set and the database is running.'
    );
  }

  // Ensure Prisma client is connected
  await prisma.$connect();

  console.log('✅ Test environment ready');
}

/**
 * Cleanup test environment
 * Call this in afterAll() hooks
 */
export async function cleanupTestEnvironment() {
  try {
    await prisma.$disconnect();
  } catch (error) {
    // Ignore disconnection errors in tests
  }
}

/**
 * Helper to check if tests should skip based on database availability
 */
export function shouldSkipDatabaseTests(): boolean {
  const hasDatabase = !!(process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL);
  const skipRequested = process.env.SKIP_DATABASE_TESTS === 'true';

  return !hasDatabase || skipRequested;
}