#!/usr/bin/env bun

/**
 * Database Management Commands
 *
 * Commands:
 *   start    - Start PostgreSQL container
 *   stop     - Stop PostgreSQL container
 *   restart  - Restart PostgreSQL container
 *   status   - Check database status
 *   migrate  - Run database migrations
 *   seed     - Seed database with initial data
 *   reset    - Reset database (drop + migrate)
 */

import { $ } from 'bun';
import { existsSync } from 'fs';
import { join } from 'path';
import { parseArgs, wantsHelp } from '../lib/args.js';
import { logger } from '../lib/logger.js';

const CONTAINER_NAME = 'babylon-postgres';
const COMPOSE_FILE = 'docker-compose.yml';

function printHelp(): void {
  console.log(`
Database Management

USAGE:
  babylon db <command>

COMMANDS:
  start     Start PostgreSQL container
  stop      Stop PostgreSQL container
  restart   Restart PostgreSQL container
  status    Show database status
  migrate   Run database migrations
  seed      Seed database with initial data
  reset     Reset database (drop + migrate)

EXAMPLES:
  babylon db start
  babylon db migrate
  babylon db seed
  babylon db status

ENVIRONMENT:
  DATABASE_URL should be set in your .env file:
  DATABASE_URL="postgresql://babylon:babylon_dev_password@localhost:5432/babylon"
`);
}

async function checkDocker(): Promise<void> {
  logger.step('Checking Docker installation...');

  try {
    await $`docker --version`.quiet();
  } catch {
    logger.fail('Docker is not installed!');
    console.log('Install Docker: https://docs.docker.com/get-docker/');
    process.exit(1);
  }

  try {
    await $`docker info`.quiet();
  } catch {
    logger.fail('Docker is installed but not running!');
    console.log('Please start Docker Desktop or the Docker daemon.');
    process.exit(1);
  }

  logger.success('Docker is running');
}

function checkComposeFile(): void {
  const composePath = join(process.cwd(), COMPOSE_FILE);
  if (!existsSync(composePath)) {
    logger.fail(`${COMPOSE_FILE} not found in project root`);
    process.exit(1);
  }
}

async function isContainerRunning(): Promise<boolean> {
  const result = await $`docker ps --filter name=${CONTAINER_NAME} --format "{{.Names}}"`
    .quiet()
    .text()
    .catch(() => '');
  return result.trim() === CONTAINER_NAME;
}

async function doesContainerExist(): Promise<boolean> {
  const result = await $`docker ps -a --filter name=${CONTAINER_NAME} --format "{{.Names}}"`
    .quiet()
    .text()
    .catch(() => '');
  return result.trim() === CONTAINER_NAME;
}

async function startDatabase(): Promise<void> {
  logger.header('Starting PostgreSQL');

  await checkDocker();
  checkComposeFile();

  if (await isContainerRunning()) {
    logger.success('PostgreSQL is already running');
    await showConnectionInfo();
    return;
  }

  logger.step('Starting container...');
  await $`docker-compose up -d postgres`;

  logger.step('Waiting for PostgreSQL to be ready...');

  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    const health = await $`docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME}`
      .quiet()
      .text()
      .catch(() => '');

    if (health.trim() === 'healthy') {
      logger.success('PostgreSQL is ready');
      await showConnectionInfo();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }

  logger.warn('Health check timeout - PostgreSQL may still be starting...');
  await showConnectionInfo();
}

async function stopDatabase(): Promise<void> {
  logger.header('Stopping PostgreSQL');

  await checkDocker();

  if (!(await isContainerRunning())) {
    logger.success('PostgreSQL is not running');
    return;
  }

  logger.step('Stopping container...');
  await $`docker-compose stop postgres`;
  logger.success('PostgreSQL stopped');
}

async function restartDatabase(): Promise<void> {
  logger.header('Restarting PostgreSQL');

  await stopDatabase();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await startDatabase();
}

async function showStatus(): Promise<void> {
  logger.header('Database Status');

  await checkDocker();

  const exists = await doesContainerExist();
  const isRunning = await isContainerRunning();

  if (!exists) {
    console.log('Status: Not created');
    console.log("\nRun 'babylon db start' to create and start the database.");
    return;
  }

  if (isRunning) {
    console.log('Status: ✅ Running');

    const uptime = await $`docker inspect --format='{{.State.StartedAt}}' ${CONTAINER_NAME}`
      .quiet()
      .text()
      .catch(() => '');
    if (uptime) {
      console.log(`Started: ${uptime.trim()}`);
    }

    const health = await $`docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME}`
      .quiet()
      .text()
      .catch(() => '');
    if (health) {
      console.log(`Health: ${health.trim()}`);
    }

    await showConnectionInfo();
  } else {
    console.log('Status: ⏸️  Stopped');
    console.log("\nRun 'babylon db start' to start the database.");
  }
}

async function showConnectionInfo(): Promise<void> {
  console.log('\nConnection Info:');
  console.log('  Host:     localhost');
  console.log('  Port:     5432');
  console.log('  Database: babylon');
  console.log('  User:     babylon');
  console.log('  Password: babylon_dev_password');
  console.log('\n  URL: postgresql://babylon:babylon_dev_password@localhost:5432/babylon');
}

async function runMigrations(): Promise<void> {
  logger.header('Running Database Migrations');

  if (!(await isContainerRunning())) {
    logger.fail('PostgreSQL is not running!');
    console.log("Start it first with: babylon db start");
    process.exit(1);
  }

  logger.step('Pushing schema changes...');
  await $`bunx drizzle-kit push`;
  logger.success('Migrations complete');
}

async function seedDatabase(): Promise<void> {
  logger.header('Seeding Database');

  if (!(await isContainerRunning())) {
    logger.fail('PostgreSQL is not running!');
    console.log("Start it first with: babylon db start");
    process.exit(1);
  }

  logger.step('Running seed script...');
  await $`bun run db:seed`;
  logger.success('Database seeded');
}

async function resetDatabase(): Promise<void> {
  logger.header('Resetting Database');

  logger.warn('This will delete all data!');

  if (!(await isContainerRunning())) {
    logger.fail('PostgreSQL is not running!');
    console.log("Start it first with: babylon db start");
    process.exit(1);
  }

  logger.step('Resetting schema...');
  await $`bunx drizzle-kit push --force`;
  logger.success('Database reset complete');
}

export async function runDbCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (wantsHelp(parsed)) {
    printHelp();
    return;
  }

  switch (parsed.command) {
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

    default:
      if (parsed.command) {
        logger.fail(`Unknown command: ${parsed.command}`);
      }
      printHelp();
      process.exit(parsed.command ? 1 : 0);
  }
}

