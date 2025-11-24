#!/usr/bin/env bun
/**
 * Pre-Development Setup for Localnet
 *
 * Sets up complete local development environment:
 * - Kills any processes on port 3000
 * - Checks for Hardhat node
 * - Deploys contracts
 * - Starts PostgreSQL, Redis, MinIO
 * - Runs database migrations
 * - Seeds data
 */

// @ts-ignore - bun global is available in bun runtime
import { $ } from 'bun'
import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { logger } from '../../src/lib/logger'
import { validateEnvironment, printValidationResult } from '../../src/lib/deployment/env-detection'
import { killPort } from '../utils/kill-port'
import '../utils/ensure-foundry-path' // Ensure Foundry tools are in PATH

const POSTGRES_CONTAINER = 'babylon-postgres'
const REDIS_CONTAINER = 'babylon-redis'
const MINIO_CONTAINER = 'babylon-minio'

logger.info('Setting up localnet development environment...', undefined, 'Script')
logger.info('='.repeat(60), undefined, 'Script')

// 0. Kill any processes on port 3000 to prevent port conflicts
logger.info('Checking for processes on port 3000...', undefined, 'Script')
const killedCount = await killPort(3000, process.pid)
if (killedCount > 0) {
  logger.info(`✅ Killed ${killedCount} process(es) on port 3000`, undefined, 'Script')
} else {
  logger.info('✅ Port 3000 is free', undefined, 'Script')
}

// 0.5. Clean up Next.js lock file if it exists
const nextLockPath = join(process.cwd(), '.next', 'dev', 'lock')
try {
  if (existsSync(nextLockPath)) {
    logger.info('Cleaning up Next.js lock file...', undefined, 'Script')
    unlinkSync(nextLockPath)
    logger.info('✅ Next.js lock file removed', undefined, 'Script')
  }
} catch (error) {
  logger.warn('Could not remove Next.js lock file (may not exist)', undefined, 'Script')
}

// Set environment for localnet
process.env.DEPLOYMENT_ENV = 'localnet'
process.env.NEXT_PUBLIC_CHAIN_ID = '31337'
process.env.NEXT_PUBLIC_RPC_URL = 'http://localhost:8545'

// 1. Check Docker
await $`docker --version`.quiet()
await $`docker info`.quiet().catch(() => {
  logger.error('❌ Docker is not running', undefined, 'Script')
  logger.info('Please start Docker Desktop or Docker daemon', undefined, 'Script')
  process.exit(1)
})
logger.info('✅ Docker is running', undefined, 'Script')

// 2. Check/create .env file
const envPath = join(process.cwd(), '.env')
if (!existsSync(envPath)) {
  logger.info('Creating .env file...', undefined, 'Script')
  const envTemplate = `DATABASE_URL="postgresql://babylon:babylon_dev_password@localhost:5433/babylon"
REDIS_URL="redis://localhost:6380"
DEPLOYMENT_ENV=localnet
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://localhost:8545
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
NEXT_PUBLIC_PRIVY_APP_ID=""
`
  writeFileSync(envPath, envTemplate)
  logger.info('✅ .env created', undefined, 'Script')
}

// 3. Start Hardhat Node (background process managed by concurrently in dev script)
// The pre-dev script just checks if port 8545 is available
logger.info('Checking port 8545 for Hardhat node...', undefined, 'Script')

// Kill any process on port 8545 to ensure clean start
const killed8545 = await killPort(8545, process.pid)
if (killed8545 > 0) {
  logger.info(`✅ Killed ${killed8545} process(es) on port 8545`, undefined, 'Script')
  // Wait a moment for port to be fully released
  await new Promise(resolve => setTimeout(resolve, 1000))
} else {
  logger.info('✅ Port 8545 is free', undefined, 'Script')
}

logger.info('Note: Hardhat node will be started automatically by the dev script', undefined, 'Script')
logger.info('      Contracts will be deployed once Hardhat is ready', undefined, 'Script')

// 4. Start PostgreSQL
const postgresRunning = await $`docker ps --filter name=${POSTGRES_CONTAINER} --format "{{.Names}}"`.quiet().text()

if (postgresRunning.trim() !== POSTGRES_CONTAINER) {
  logger.info('Starting PostgreSQL...', undefined, 'Script')
  await $`docker-compose up -d postgres`

  let attempts = 0
  while (attempts < 30) {
    const health = await $`docker inspect --format='{{.State.Health.Status}}' ${POSTGRES_CONTAINER}`.quiet().text().catch(() => '')
    if (health.trim() === 'healthy') {
      logger.info('✅ PostgreSQL is ready', undefined, 'Script')
      break
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
    attempts++
  }

  if (attempts === 30) {
    logger.error('❌ PostgreSQL health check timeout', undefined, 'Script')
    process.exit(1)
  }
} else {
  logger.info('✅ PostgreSQL is running', undefined, 'Script')
}

// 7. Start Redis (optional)
const redisRunning = await $`docker ps --filter name=${REDIS_CONTAINER} --format "{{.Names}}"`.quiet().text()

if (redisRunning.trim() !== REDIS_CONTAINER) {
  logger.info('Starting Redis...', undefined, 'Script')
  await $`docker-compose up -d redis`.then(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000))
    logger.info('✅ Redis started', undefined, 'Script')
  }).catch(() => {
    logger.warn('⚠️  Redis start failed (optional, continuing)', undefined, 'Script')
  })
} else {
  logger.info('✅ Redis is running', undefined, 'Script')
}

// 8. Start MinIO (optional)
const minioRunning = await $`docker ps --filter name=${MINIO_CONTAINER} --format "{{.Names}}"`.quiet().text()

if (minioRunning.trim() !== MINIO_CONTAINER) {
  logger.info('Starting MinIO...', undefined, 'Script')
  await $`docker-compose up -d minio`.then(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000))
    logger.info('✅ MinIO started', undefined, 'Script')
  }).catch(() => {
    logger.warn('⚠️  MinIO start failed (optional, continuing)', undefined, 'Script')
  })
} else {
  logger.info('✅ MinIO is running', undefined, 'Script')
}

// 9. Run database migrations and seed
const { PrismaClient } = await import('@prisma/client')
const prisma = new PrismaClient()

await prisma.$connect()
logger.info('✅ Database connected', undefined, 'Script')

const actorCount = await prisma.actor.count().catch(async (error: Error) => {
  const errorMessage = error.message
  if (errorMessage.includes('does not exist') || errorMessage.includes('P2021')) {
    logger.info('Running database migrations...', undefined, 'Script')
    await $`bunx prisma migrate deploy`.quiet().catch(async () => {
      await $`bunx prisma db push --skip-generate`.quiet()
    })

    logger.info('Running database seed...', undefined, 'Script')
    await $`bun run db:seed`
    logger.info('✅ Database ready', undefined, 'Script')
    return 0
  }
  throw error
})

if (actorCount === 0) {
  logger.info('Running database seed...', undefined, 'Script')
  await $`bun run db:seed`
  logger.info('✅ Database seeded', undefined, 'Script')
} else if (actorCount > 0) {
  logger.info(`✅ Database has ${actorCount} actors`, undefined, 'Script')
}

await prisma.$disconnect()

// 10. Validate environment
logger.info('', undefined, 'Script')
const validation = validateEnvironment('localnet')
printValidationResult(validation)

logger.info('', undefined, 'Script')
logger.info('='.repeat(60), undefined, 'Script')
logger.info('✅ Localnet environment ready!', undefined, 'Script')
logger.info('', undefined, 'Script')
logger.info('Services:', undefined, 'Script')
logger.info('  Hardhat:    http://localhost:8545 (will be started automatically)', undefined, 'Script')
logger.info('  PostgreSQL: localhost:5433', undefined, 'Script')
logger.info('  Redis:      localhost:6380', undefined, 'Script')
logger.info('  MinIO:      http://localhost:9000 (console: :9001)', undefined, 'Script')
logger.info('', undefined, 'Script')
logger.info('App Routes:', undefined, 'Script')
logger.info('  Main:       http://localhost:3000', undefined, 'Script')
logger.info('  Betting:    http://localhost:3000/betting (Oracle-powered markets)', undefined, 'Script')
logger.info('', undefined, 'Script')
logger.info('Starting services (Hardhat, Next.js, Cron)...', undefined, 'Script')
logger.info('='.repeat(60), undefined, 'Script')

