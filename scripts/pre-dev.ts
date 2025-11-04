#!/usr/bin/env bun

/**
 * Pre-Development Check
 * 
 * Runs before `bun run dev` to ensure database is ready
 * - Checks environment variables
 * - Checks Docker is installed and running
 * - Starts PostgreSQL if not running
 * - Validates database connection
 * - Fails fast if any issues
 * 
 * NO error handling - let it crash if something is wrong
 */

import { $ } from 'bun';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { logger } from '../src/lib/logger';

const CONTAINER_NAME = 'babylon-postgres';
const COMPOSE_FILE = 'docker-compose.yml';
const DATABASE_URL = 'postgresql://babylon:babylon_dev_password@localhost:5432/babylon';

logger.info('Pre-development checks...', undefined, 'Script');

// Check/create .env file with DATABASE_URL
const envPath = join(process.cwd(), '.env');
if (!existsSync(envPath)) {
  logger.info('Creating .env file...', undefined, 'Script');
  writeFileSync(envPath, `DATABASE_URL="${DATABASE_URL}"\n`);
  logger.info('.env created', undefined, 'Script');
} else {
  // Check if DATABASE_URL exists in .env
  const envContent = readFileSync(envPath, 'utf-8');
  if (!envContent.includes('DATABASE_URL=')) {
    logger.info('Adding DATABASE_URL to .env...', undefined, 'Script');
    writeFileSync(envPath, envContent + `\nDATABASE_URL="${DATABASE_URL}"\n`);
    logger.info('DATABASE_URL added', undefined, 'Script');
  }
}

// Load environment variables
process.env.DATABASE_URL = DATABASE_URL;

// Check Docker is installed
await $`docker --version`.quiet();
logger.info('Docker installed', undefined, 'Script');

// Check Docker is running
await $`docker info`.quiet();
logger.info('Docker running', undefined, 'Script');

// Check compose file exists
if (!existsSync(join(process.cwd(), COMPOSE_FILE))) {
  logger.error('docker-compose.yml not found', undefined, 'Script');
  process.exit(1);
}

// Check if PostgreSQL is running
const running = await $`docker ps --filter name=${CONTAINER_NAME} --format "{{.Names}}"`.quiet().text();

if (running.trim() !== CONTAINER_NAME) {
  // Not running, start it
  logger.info('Starting PostgreSQL...', undefined, 'Script');
  await $`docker-compose up -d postgres`;
  
  // Wait for health check
  let attempts = 0;
  while (attempts < 30) {
    const health = await $`docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME}`.quiet().text();
    
    if (health.trim() === 'healthy') {
      logger.info('PostgreSQL ready', undefined, 'Script');
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  if (attempts === 30) {
    logger.error('PostgreSQL health check timeout', undefined, 'Script');
    process.exit(1);
  }
} else {
  logger.info('PostgreSQL running', undefined, 'Script');
}

// Test database connection with Prisma
logger.info('Testing database connection...', undefined, 'Script');
const prisma = new PrismaClient();

// Just try to connect - will throw if fails
await prisma.$connect();
logger.info('Database connected', undefined, 'Script');

// Check if database needs migrations
logger.info('Checking database state...', undefined, 'Script');
let actorCount = 0;
let poolCount = 0;

try {
  // Try to query - will fail if tables don't exist
  actorCount = await prisma.actor.count();
  poolCount = await prisma.pool.count();
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  // Check if it's a "table does not exist" error
  if (errorMessage.includes('does not exist') || errorMessage.includes('P2021')) {
    logger.info('Database tables not found, checking migration status...', undefined, 'Script');
    
    // First, try to clean up any failed migrations in the database
    try {
      // Check if _prisma_migrations table exists
      const migrationsTable = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL LIMIT 1`
      ).catch(() => []);
      
      if (migrationsTable.length > 0) {
        const failedMigration = migrationsTable[0]?.migration_name;
        if (failedMigration) {
          logger.info(`Found failed migration: ${failedMigration}, removing...`, undefined, 'Script');
          await prisma.$executeRawUnsafe(
            `DELETE FROM "_prisma_migrations" WHERE migration_name = $1`,
            failedMigration
          );
          logger.info('Failed migration removed', undefined, 'Script');
        }
      }
    } catch (cleanupError) {
      // _prisma_migrations table might not exist yet, which is fine
      logger.info('No migrations table or cleanup not needed', undefined, 'Script');
    }
    
    logger.info('Applying migrations...', undefined, 'Script');
    // First try migrate deploy for existing migrations
    try {
      await $`bunx prisma migrate deploy`.quiet();
      logger.info('Migrations deployed', undefined, 'Script');
    } catch (migrateError) {
      logger.info('migrate deploy failed, syncing schema...', undefined, 'Script');
      // If migrations fail, sync schema directly (for development)
      await $`bunx prisma db push --skip-generate`.quiet();
      logger.info('Schema synced', undefined, 'Script');
    }
    
    // Try again after migrations
    try {
      actorCount = await prisma.actor.count();
      poolCount = await prisma.pool.count();
    } catch {
      // Tables still don't exist, might need to seed
      actorCount = 0;
      poolCount = 0;
    }
  } else {
    // Some other error, rethrow
    throw error;
  }
}

if (actorCount === 0) {
  logger.info('Database is empty, running seed...', undefined, 'Script');
  await $`bun run prisma/seed.ts`;
  logger.info('Database seeded', undefined, 'Script');
} else {
  logger.info(`Database has ${actorCount} actors and ${poolCount} pools`, undefined, 'Script');
  
  // Check if trader actors need points initialization
  const traderActors = await prisma.actor.findMany({
    where: { hasPool: true },
    select: { id: true, reputationPoints: true, profileImageUrl: true },
  });
  
  const needsPointsUpdate = traderActors.some(a => a.reputationPoints !== 10000);
  const needsImageUpdate = traderActors.some(a => !a.profileImageUrl);
  
  if (needsPointsUpdate || needsImageUpdate) {
    logger.info('Trader actors need initialization, updating...', undefined, 'Script');

    for (const actor of traderActors) {
      const imagePath = join(process.cwd(), 'public', 'images', 'actors', `${actor.id}.jpg`);
      const hasImage = existsSync(imagePath);
      const imageUrl = hasImage ? `/images/actors/${actor.id}.jpg` : null;
      
      if (actor.reputationPoints !== 10000 || (hasImage && !actor.profileImageUrl)) {
        await prisma.actor.update({
          where: { id: actor.id },
          data: {
            reputationPoints: 10000,
            ...(imageUrl && { profileImageUrl: imageUrl }),
          },
        });
      }
    }
    logger.info('Trader actors initialized', undefined, 'Script');
  }
}

await prisma.$disconnect();
logger.info('All checks passed! Starting Next.js...', undefined, 'Script');

