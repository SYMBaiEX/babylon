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

const CONTAINER_NAME = 'babylon-postgres';
const COMPOSE_FILE = 'docker-compose.yml';
const DATABASE_URL = 'postgresql://babylon:babylon_dev_password@localhost:5432/babylon';

console.log('🔍 Pre-development checks...\n');

// Check/create .env file with DATABASE_URL
const envPath = join(process.cwd(), '.env');
if (!existsSync(envPath)) {
  console.log('📝 Creating .env file...');
  writeFileSync(envPath, `DATABASE_URL="${DATABASE_URL}"\n`);
  console.log('✅ .env created');
} else {
  // Check if DATABASE_URL exists in .env
  const envContent = readFileSync(envPath, 'utf-8');
  if (!envContent.includes('DATABASE_URL=')) {
    console.log('📝 Adding DATABASE_URL to .env...');
    writeFileSync(envPath, envContent + `\nDATABASE_URL="${DATABASE_URL}"\n`);
    console.log('✅ DATABASE_URL added');
  }
}

// Load environment variables
process.env.DATABASE_URL = DATABASE_URL;

// Check Docker is installed
await $`docker --version`.quiet();
console.log('✅ Docker installed');

// Check Docker is running
await $`docker info`.quiet();
console.log('✅ Docker running');

// Check compose file exists
if (!existsSync(join(process.cwd(), COMPOSE_FILE))) {
  console.error('❌ docker-compose.yml not found');
  process.exit(1);
}

// Check if PostgreSQL is running
const running = await $`docker ps --filter name=${CONTAINER_NAME} --format "{{.Names}}"`.quiet().text();

if (running.trim() !== CONTAINER_NAME) {
  // Not running, start it
  console.log('🚀 Starting PostgreSQL...');
  await $`docker-compose up -d postgres`;
  
  // Wait for health check
  let attempts = 0;
  while (attempts < 30) {
    const health = await $`docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME}`.quiet().text();
    
    if (health.trim() === 'healthy') {
      console.log('✅ PostgreSQL ready');
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  if (attempts === 30) {
    console.error('❌ PostgreSQL health check timeout');
    process.exit(1);
  }
} else {
  console.log('✅ PostgreSQL running');
}

// Test database connection with Prisma
console.log('🔌 Testing database connection...');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

// Just try to connect - will throw if fails
await prisma.$connect();
await prisma.$disconnect();
console.log('✅ Database connected');

console.log('\n🎉 All checks passed! Starting Next.js...\n');

