#!/usr/bin/env bun
/**
 * Bootstrap NPC Agents - Initialize all NPCs at server startup
 *
 * This script:
 * 1. Loads all Actor records from database
 * 2. Registers each NPC in AgentRegistry
 * 3. Creates runtime instances using AgentRuntimeManager
 * 4. Sets up NPC-specific configurations
 *
 * Based on: agent-unified-architecture.md
 * Run this at server startup to initialize NPC agents.
 */

import { logger } from '@/lib/logger'
import { db } from '@/db'
import { npcBootstrapService } from '@/lib/services/npc-bootstrap.service'

async function main() {
  logger.info('🤖 Bootstrapping NPC agents...', undefined, 'Bootstrap')

  try {
    // Call the bootstrap service to initialize all NPCs
    const result = await npcBootstrapService.bootstrapAllNpcs()

    // Log results
    logger.info('', undefined, 'Bootstrap')
    logger.info('📊 Bootstrap Results:', undefined, 'Bootstrap')
    logger.info(`   Total NPCs: ${result.totalNpcs}`, undefined, 'Bootstrap')
    logger.info(`   ✅ Initialized: ${result.initialized}`, undefined, 'Bootstrap')
    logger.info(`   ❌ Failed: ${result.failed}`, undefined, 'Bootstrap')

    // Log any errors
    if (result.errors.length > 0) {
      logger.info('', undefined, 'Bootstrap')
      logger.warn('⚠️  Errors encountered:', undefined, 'Bootstrap')
      result.errors.forEach((error) => {
        logger.warn(
          `   ${error.actorId}: ${error.error}`,
          undefined,
          'Bootstrap',
        )
      })
    }

    logger.info('', undefined, 'Bootstrap')
    if (result.failed === 0) {
      logger.info('🎉 All NPCs bootstrapped successfully!', undefined, 'Bootstrap')
    } else {
      logger.info(
        `⚠️  Bootstrap complete with ${result.failed} failures`,
        undefined,
        'Bootstrap',
      )
    }

    logger.info('', undefined, 'Bootstrap')
    logger.info('Next steps:', undefined, 'Bootstrap')
    logger.info('1. NPCs are now registered in the AgentRegistry', undefined, 'Bootstrap')
    logger.info('2. Runtime instances are created and cached', undefined, 'Bootstrap')
    logger.info('3. NPCs are ready for autonomous actions', undefined, 'Bootstrap')
    logger.info('4. Check status with: bun run scripts/status.ts', undefined, 'Bootstrap')

    await db.$disconnect()

    // Exit with error code if any NPCs failed
    if (result.failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    logger.error(
      'Fatal error during NPC bootstrap:',
      error instanceof Error ? error : new Error(String(error)),
      'Bootstrap',
    )
    await db.$disconnect()
    process.exit(1)
  }
}

main().catch((error) => {
  logger.error(
    'Unhandled error in bootstrap script:',
    error instanceof Error ? error : new Error(String(error)),
    'Bootstrap',
  )
  process.exit(1)
})
