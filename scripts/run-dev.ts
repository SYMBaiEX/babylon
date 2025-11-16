#!/usr/bin/env bun
/**
 * Development Server Runner
 * 
 * Runs the pre-dev setup and then starts Next.js and cron simulator concurrently.
 * This script ensures proper execution order and handles process management.
 * 
 * Uses concurrently programmatically for better control and error handling.
 */

import { $ } from 'bun'
import { logger } from '../src/lib/logger'
import concurrently from 'concurrently'

async function main() {
  try {
    // Step 1: Run pre-dev setup
    logger.info('Running pre-dev setup...', undefined, 'DevRunner')
    
    try {
      const preDevResult = await $`bun run scripts/pre-dev/pre-dev-local.ts`.nothrow().quiet()
      if (preDevResult.exitCode === 0) {
        logger.info('✅ Pre-dev setup completed', undefined, 'DevRunner')
      } else {
        logger.warn('Pre-dev setup exited with non-zero code, but continuing...', { exitCode: preDevResult.exitCode }, 'DevRunner')
      }
    } catch (error) {
      logger.warn('Pre-dev setup had an error, but continuing...', error, 'DevRunner')
    }
    
    // Step 2: Start Next.js and cron simulator concurrently
    logger.info('Starting Next.js and cron simulator...', undefined, 'DevRunner')
    logger.info('Press Ctrl+C to stop all services', undefined, 'DevRunner')
    
    // Use concurrently programmatically
    // According to concurrently docs: killOthers: ['failure'] only kills on failure
    // The result promise resolves when all processes exit
    // On Linux, use npx/node directly instead of bunx to avoid Bun process handling issues
    const isLinux = process.platform === 'linux'
    
    // For Linux, use node/npx directly to avoid Bun's process wrapper issues
    // For Mac/other platforms, use bunx
    const nextCommand = isLinux 
      ? 'node node_modules/.bin/next dev' 
      : 'bunx next dev'
    
    const { result } = concurrently(
      [
        {
          command: nextCommand,
          name: 'next',
          prefixColor: 'cyan',
          env: {
            ...process.env,
            // Ensure we use the system PATH for node/npx on Linux
            PATH: isLinux ? process.env.PATH : undefined,
          },
        },
        {
          command: 'bun run scripts/local-cron-simulator.ts',
          name: 'cron',
          prefixColor: 'magenta',
        },
      ],
      {
        prefix: 'name',
        killOthers: ['failure'], // Only kill others on failure, not on success
        restartTries: 0,
        raw: false, // Don't use raw mode - let concurrently handle output
      }
    )
    
    // Set up signal handlers for graceful shutdown
    const shutdown = () => {
      logger.info('Shutting down...', undefined, 'DevRunner')
      process.exit(0)
    }
    
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    
    // Wait for result - this keeps the process alive
    // The processes should keep running until killed or they exit
    await result
    
  } catch (error) {
    logger.error('Failed to start dev server', error, 'DevRunner')
    process.exit(1)
  }
}

main()

