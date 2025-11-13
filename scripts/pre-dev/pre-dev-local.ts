#!/usr/bin/env bun
/**
 * Pre-Development Setup for Localnet
 * 
 * Sets up complete local development environment:
 * - Starts Anvil (local blockchain)
 * - Deploys contracts
 * - Starts PostgreSQL, Redis, MinIO
 * - Runs database migrations
 * - Seeds data
 */

// @ts-ignore - bun global is available in bun runtime
import { $ } from 'bun'
import { existsSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../../src/lib/logger'
import { validateEnvironment, printValidationResult } from '../../src/lib/deployment/env-detection'
import { loadDeployment } from '../../src/lib/deployment/validation'

const ANVIL_CONTAINER = 'babylon-anvil'
const POSTGRES_CONTAINER = 'babylon-postgres'
const REDIS_CONTAINER = 'babylon-redis'
const MINIO_CONTAINER = 'babylon-minio'

logger.info('Setting up localnet development environment...', undefined, 'Script')
logger.info('='.repeat(60), undefined, 'Script')

// Set environment for localnet
process.env.DEPLOYMENT_ENV = 'localnet'
process.env.NEXT_PUBLIC_CHAIN_ID = '31337'
process.env.NEXT_PUBLIC_RPC_URL = 'http://localhost:8545'

// 1. Check Docker
try {
  await $`docker --version`.quiet()
  await $`docker info`.quiet()
  logger.info('✅ Docker is running', undefined, 'Script')
} catch (error) {
  logger.error('❌ Docker is not running', undefined, 'Script')
  logger.info('Please start Docker Desktop or Docker daemon', undefined, 'Script')
  process.exit(1)
}

// 2. Check/create .env file
const envPath = join(process.cwd(), '.env')
if (!existsSync(envPath)) {
  logger.info('Creating .env file...', undefined, 'Script')
  const envTemplate = `DATABASE_URL="postgresql://babylon:babylon_dev_password@localhost:5433/babylon"
REDIS_URL="redis://localhost:6380"
DEPLOYMENT_ENV=localnet
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://localhost:8545
`
  writeFileSync(envPath, envTemplate)
  logger.info('✅ .env created', undefined, 'Script')
}

// 3. Start Anvil
const anvilRunning = await $`docker ps --filter name=${ANVIL_CONTAINER} --format "{{.Names}}"`.quiet().text()

if (anvilRunning.trim() !== ANVIL_CONTAINER) {
  logger.info('Starting Anvil...', undefined, 'Script')
  await $`docker-compose up -d anvil`

  // Wait for health check
  let attempts = 0
  while (attempts < 30) {
    try {
      const health = await $`docker inspect --format='{{.State.Health.Status}}' ${ANVIL_CONTAINER}`.quiet().text()
      if (health.trim() === 'healthy') {
        logger.info('✅ Anvil is ready', undefined, 'Script')
        break
      }
    } catch {
      // Not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
    attempts++
  }

  if (attempts === 30) {
    logger.error('❌ Anvil health check timeout', undefined, 'Script')
    process.exit(1)
  }
  
  // Add a small delay to allow the RPC server to stabilize after the health check passes
  await new Promise(resolve => setTimeout(resolve, 2000))
} else {
  logger.info('✅ Anvil is running', undefined, 'Script')
}

// Verify RPC endpoint is accessible
logger.info('Verifying Anvil RPC endpoint...', undefined, 'Script')
let rpcAttempts = 0
while (rpcAttempts < 30) {
  try {
    await $`cast block-number --rpc-url http://localhost:8545`.text()
    logger.info('✅ Anvil RPC is ready', undefined, 'Script')
    break
  } catch (error: any) {
    // Not ready yet
    if (rpcAttempts === 0) { // Log the error only on the first attempt
      const stderr = error.stderr ? error.stderr.toString() : 'No stderr output'
      logger.error(`Initial RPC connection error: ${error.message}`, undefined, 'Script')
      logger.error(`Stderr: ${stderr}`, undefined, 'Script')
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
    rpcAttempts++
  }
}

if (rpcAttempts === 30) {
  logger.error('❌ Anvil RPC endpoint timeout', undefined, 'Script')
  process.exit(1)
}

// 4. Check if contracts are deployed
let needsDeployment = false
const deployment = await loadDeployment('localnet')

if (!deployment || !deployment.contracts.diamond) {
  needsDeployment = true
  logger.info('No contracts deployed yet', undefined, 'Script')
} else {
  // Verify contracts are still there
  try {
    const code = await $`cast code ${deployment.contracts.diamond} --rpc-url http://localhost:8545`.quiet().text()
    if (code.trim() === '0x' || code.trim() === '0x0') {
      needsDeployment = true
      logger.warn('⚠️  Contracts not found (Anvil may have been reset)', undefined, 'Script')
    } else {
      logger.info('✅ Contracts are deployed', undefined, 'Script')
    }
  } catch {
    needsDeployment = true
  }
}

// 5. Deploy contracts if needed
if (needsDeployment) {
  logger.info('Deploying contracts to Anvil...', undefined, 'Script')
  logger.info('  - Diamond system', undefined, 'Script')
  logger.info('  - Oracle system (BabylonGameOracle, Predimarket)', undefined, 'Script')
  logger.info('  - Moderation system', undefined, 'Script')
  try {
    await $`bun run deploy:local`
    logger.info('✅ Contracts deployed', undefined, 'Script')
    
    // Verify oracle contracts deployed
    const updatedDeployment = await loadDeployment('localnet')
    if (updatedDeployment?.contracts.babylonOracle) {
      logger.info('✅ Oracle contracts deployed:', undefined, 'Script')
      logger.info(`   BabylonOracle: ${updatedDeployment.contracts.babylonOracle}`, undefined, 'Script')
      logger.info(`   Predimarket:   ${updatedDeployment.contracts.predimarket}`, undefined, 'Script')
      logger.info(`   TestToken:     ${updatedDeployment.contracts.testToken}`, undefined, 'Script')
    }
  } catch (error) {
    logger.error('❌ Contract deployment failed', error, 'Script')
    process.exit(1)
  }
}

// 6. Start PostgreSQL
const postgresRunning = await $`docker ps --filter name=${POSTGRES_CONTAINER} --format "{{.Names}}"`.quiet().text()

if (postgresRunning.trim() !== POSTGRES_CONTAINER) {
  logger.info('Starting PostgreSQL...', undefined, 'Script')
  await $`docker-compose up -d postgres`

  let attempts = 0
  while (attempts < 30) {
    try {
      const health = await $`docker inspect --format='{{.State.Health.Status}}' ${POSTGRES_CONTAINER}`.quiet().text()
      if (health.trim() === 'healthy') {
        logger.info('✅ PostgreSQL is ready', undefined, 'Script')
        break
      }
    } catch {
      // Not ready yet
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
  try {
    await $`docker-compose up -d redis`
    await new Promise(resolve => setTimeout(resolve, 2000))
    logger.info('✅ Redis started', undefined, 'Script')
  } catch (error) {
    logger.warn('⚠️  Redis start failed (optional, continuing)', undefined, 'Script')
  }
} else {
  logger.info('✅ Redis is running', undefined, 'Script')
}

// 8. Start MinIO (optional)
const minioRunning = await $`docker ps --filter name=${MINIO_CONTAINER} --format "{{.Names}}"`.quiet().text()

if (minioRunning.trim() !== MINIO_CONTAINER) {
  logger.info('Starting MinIO...', undefined, 'Script')
  try {
    await $`docker-compose up -d minio`
    await new Promise(resolve => setTimeout(resolve, 2000))
    logger.info('✅ MinIO started', undefined, 'Script')
  } catch (error) {
    logger.warn('⚠️  MinIO start failed (optional, continuing)', undefined, 'Script')
  }
} else {
  logger.info('✅ MinIO is running', undefined, 'Script')
}

// 9. Run database migrations and seed
const { PrismaClient } = await import('@prisma/client')
const prisma = new PrismaClient()

try {
  await prisma.$connect()
  logger.info('✅ Database connected', undefined, 'Script')

  const actorCount = await prisma.actor.count()

  if (actorCount === 0) {
    logger.info('Running database seed...', undefined, 'Script')
    await $`bun run db:seed`
    logger.info('✅ Database seeded', undefined, 'Script')
  } else {
    logger.info(`✅ Database has ${actorCount} actors`, undefined, 'Script')
  }
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  if (errorMessage.includes('does not exist') || errorMessage.includes('P2021')) {
    logger.info('Running database migrations...', undefined, 'Script')
    try {
      await $`bunx prisma migrate deploy`.quiet()
    } catch {
      await $`bunx prisma db push --skip-generate`.quiet()
    }

    logger.info('Running database seed...', undefined, 'Script')
    await $`bun run db:seed`
    logger.info('✅ Database ready', undefined, 'Script')
  } else {
    throw error
  }
} finally {
  await prisma.$disconnect()
}

// 10. Validate environment
logger.info('', undefined, 'Script')
const validation = validateEnvironment('localnet')
printValidationResult(validation)

logger.info('', undefined, 'Script')
logger.info('='.repeat(60), undefined, 'Script')
logger.info('✅ Localnet environment ready!', undefined, 'Script')
logger.info('', undefined, 'Script')
logger.info('Services:', undefined, 'Script')
logger.info('  Anvil:      http://localhost:8545', undefined, 'Script')
logger.info('  PostgreSQL: localhost:5433', undefined, 'Script')
logger.info('  Redis:      localhost:6380', undefined, 'Script')
logger.info('  MinIO:      http://localhost:9000 (console: :9001)', undefined, 'Script')
logger.info('', undefined, 'Script')
logger.info('App Routes:', undefined, 'Script')
logger.info('  Main:       http://localhost:3000', undefined, 'Script')
logger.info('  Betting:    http://localhost:3000/betting (Oracle-powered markets)', undefined, 'Script')
logger.info('', undefined, 'Script')
logger.info('Starting Next.js...', undefined, 'Script')
logger.info('='.repeat(60), undefined, 'Script')

