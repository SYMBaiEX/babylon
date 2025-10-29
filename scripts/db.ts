#!/usr/bin/env bun

/**
 * Database Management Script
 * 
 * Manages PostgreSQL Docker container for Babylon
 * - Checks for Docker installation
 * - Starts/stops PostgreSQL container
 * - Shows database status
 * - Runs migrations and seeds
 * 
 * Usage:
 *   bun scripts/db.ts start       # Start PostgreSQL
 *   bun scripts/db.ts stop        # Stop PostgreSQL
 *   bun scripts/db.ts restart     # Restart PostgreSQL
 *   bun scripts/db.ts status      # Check status
 *   bun scripts/db.ts migrate     # Run Prisma migrations
 *   bun scripts/db.ts seed        # Seed database
 *   bun scripts/db.ts reset       # Reset database (drop + migrate + seed)
 */

import { $ } from 'bun';
import { existsSync } from 'fs';
import { join } from 'path';

const CONTAINER_NAME = 'babylon-postgres';
const COMPOSE_FILE = 'docker-compose.yml';

/**
 * Check if Docker is installed and running
 */
async function checkDocker(): Promise<void> {
  console.log('🔍 Checking Docker installation...\n');

  try {
    // Check if Docker is installed
    await $`docker --version`.quiet();
  } catch (error) {
    console.error('❌ ERROR: Docker is not installed!\n');
    console.error('Docker is required to run the PostgreSQL database.');
    console.error('\nInstall Docker:');
    console.error('  macOS: https://docs.docker.com/desktop/install/mac-install/');
    console.error('  Linux: https://docs.docker.com/engine/install/');
    console.error('  Windows: https://docs.docker.com/desktop/install/windows-install/\n');
    process.exit(1);
  }

  try {
    // Check if Docker daemon is running
    await $`docker info`.quiet();
  } catch (error) {
    console.error('❌ ERROR: Docker is installed but not running!\n');
    console.error('Please start Docker Desktop or the Docker daemon.\n');
    process.exit(1);
  }

  console.log('✅ Docker is installed and running\n');
}

/**
 * Check if docker-compose.yml exists
 */
function checkComposeFile(): void {
  const composePath = join(process.cwd(), COMPOSE_FILE);
  
  if (!existsSync(composePath)) {
    console.error(`❌ ERROR: ${COMPOSE_FILE} not found!\n`);
    console.error('Please ensure docker-compose.yml exists in the project root.\n');
    process.exit(1);
  }
}

/**
 * Check if PostgreSQL container is running
 */
async function isContainerRunning(): Promise<boolean> {
  try {
    const result = await $`docker ps --filter name=${CONTAINER_NAME} --format "{{.Names}}"`.quiet().text();
    return result.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

/**
 * Check if PostgreSQL container exists (running or stopped)
 */
async function doesContainerExist(): Promise<boolean> {
  try {
    const result = await $`docker ps -a --filter name=${CONTAINER_NAME} --format "{{.Names}}"`.quiet().text();
    return result.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

/**
 * Start PostgreSQL container
 */
async function startDatabase(): Promise<void> {
  console.log('🚀 Starting PostgreSQL...\n');

  await checkDocker();
  checkComposeFile();

  const isRunning = await isContainerRunning();
  
  if (isRunning) {
    console.log('✅ PostgreSQL is already running!\n');
    await showConnectionInfo();
    return;
  }

  try {
    await $`docker-compose up -d postgres`;
    
    console.log('⏳ Waiting for PostgreSQL to be ready...\n');
    
    // Wait for health check
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      try {
        const health = await $`docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME}`.quiet().text();
        
        if (health.trim() === 'healthy') {
          console.log('✅ PostgreSQL is ready!\n');
          await showConnectionInfo();
          return;
        }
      } catch {
        // Container might not have health check yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    console.log('⚠️  PostgreSQL started but health check timeout. It may still be starting...\n');
    await showConnectionInfo();
    
  } catch (error) {
    console.error('❌ Failed to start PostgreSQL:', error);
    process.exit(1);
  }
}

/**
 * Stop PostgreSQL container
 */
async function stopDatabase(): Promise<void> {
  console.log('🛑 Stopping PostgreSQL...\n');

  await checkDocker();

  const isRunning = await isContainerRunning();
  
  if (!isRunning) {
    console.log('ℹ️  PostgreSQL is not running\n');
    return;
  }

  try {
    await $`docker-compose stop postgres`;
    console.log('✅ PostgreSQL stopped\n');
  } catch (error) {
    console.error('❌ Failed to stop PostgreSQL:', error);
    process.exit(1);
  }
}

/**
 * Restart PostgreSQL container
 */
async function restartDatabase(): Promise<void> {
  console.log('🔄 Restarting PostgreSQL...\n');
  
  await stopDatabase();
  await new Promise(resolve => setTimeout(resolve, 2000));
  await startDatabase();
}

/**
 * Show database status
 */
async function showStatus(): Promise<void> {
  console.log('📊 Database Status\n');
  console.log('═'.repeat(50));

  await checkDocker();

  const exists = await doesContainerExist();
  const isRunning = await isContainerRunning();

  if (!exists) {
    console.log('\nStatus: ⚪ Not created');
    console.log('\nRun `bun run db:start` to create and start the database.\n');
    return;
  }

  if (isRunning) {
    console.log('\nStatus: 🟢 Running');
    
    try {
      const uptime = await $`docker inspect --format='{{.State.StartedAt}}' ${CONTAINER_NAME}`.quiet().text();
      console.log(`Started: ${uptime.trim()}`);
      
      const health = await $`docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME}`.quiet().text();
      console.log(`Health: ${health.trim()}`);
    } catch {
      // Health check might not be available yet
    }
    
    await showConnectionInfo();
  } else {
    console.log('\nStatus: 🔴 Stopped');
    console.log('\nRun `bun run db:start` to start the database.\n');
  }
}

/**
 * Show connection information
 */
async function showConnectionInfo(): Promise<void> {
  console.log('📝 Connection Info:');
  console.log('  Host: localhost');
  console.log('  Port: 5432');
  console.log('  Database: babylon');
  console.log('  User: babylon');
  console.log('  Password: babylon_dev_password');
  console.log('\n  Connection URL:');
  console.log('  postgresql://babylon:babylon_dev_password@localhost:5432/babylon\n');
}

/**
 * Run Prisma migrations
 */
async function runMigrations(): Promise<void> {
  console.log('🔄 Running Prisma migrations...\n');

  const isRunning = await isContainerRunning();
  
  if (!isRunning) {
    console.error('❌ PostgreSQL is not running!');
    console.error('Start it first with: bun run db:start\n');
    process.exit(1);
  }

  try {
    await $`bunx prisma migrate dev`;
    console.log('\n✅ Migrations complete\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

/**
 * Seed the database
 */
async function seedDatabase(): Promise<void> {
  console.log('🌱 Seeding database...\n');

  const isRunning = await isContainerRunning();
  
  if (!isRunning) {
    console.error('❌ PostgreSQL is not running!');
    console.error('Start it first with: bun run db:start\n');
    process.exit(1);
  }

  try {
    await $`bunx prisma db seed`;
    console.log('\n✅ Database seeded\n');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

/**
 * Reset database (drop + migrate + seed)
 */
async function resetDatabase(): Promise<void> {
  console.log('⚠️  Resetting database (this will delete all data)...\n');

  const isRunning = await isContainerRunning();
  
  if (!isRunning) {
    console.error('❌ PostgreSQL is not running!');
    console.error('Start it first with: bun run db:start\n');
    process.exit(1);
  }

  try {
    console.log('🗑️  Dropping database...');
    await $`bunx prisma migrate reset --force`;
    console.log('\n✅ Database reset complete\n');
  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  }
}

/**
 * Show help
 */
function showHelp(): void {
  console.log(`
🎮 Babylon Database Management

Usage: bun scripts/db.ts <command>

Commands:
  start       Start PostgreSQL container
  stop        Stop PostgreSQL container
  restart     Restart PostgreSQL container
  status      Show database status
  migrate     Run Prisma migrations
  seed        Seed database with actors
  reset       Reset database (drop + migrate + seed)
  help        Show this help message

Examples:
  bun scripts/db.ts start
  bun scripts/db.ts migrate
  bun scripts/db.ts seed
  bun scripts/db.ts status

Environment:
  The database connection URL should be set in your .env file:
  DATABASE_URL="postgresql://babylon:babylon_dev_password@localhost:5432/babylon"
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'start':
      await startDatabase();
      break;
    
    case 'stop':
      await stopDatabase();
      break;
    
    case 'restart':
      await restartDatabase();
      break;
    
    case 'status':
      await showStatus();
      break;
    
    case 'migrate':
      await runMigrations();
      break;
    
    case 'seed':
      await seedDatabase();
      break;
    
    case 'reset':
      await resetDatabase();
      break;
    
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    
    default:
      console.error(`❌ Unknown command: ${command || '(none)'}\n`);
      showHelp();
      process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
}

export { main };


