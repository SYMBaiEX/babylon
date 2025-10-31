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
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

// Just try to connect - will throw if fails
await prisma.$connect();
await prisma.$disconnect();
logger.info('Database connected', undefined, 'Script');

logger.info('All checks passed! Starting Next.js...', undefined, 'Script');

