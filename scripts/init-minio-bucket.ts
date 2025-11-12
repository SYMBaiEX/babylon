#!/usr/bin/env bun

/**
 * Initialize MinIO bucket for local development
 * Creates the babylon-uploads bucket and sets public read policy
 */

import { getStorageClient } from '../src/lib/storage/s3-client'
import { logger } from '../src/lib/logger'

async function main() {
  logger.info('Initializing MinIO bucket...', undefined, 'Script')

  try {
    const storage = getStorageClient()
    await storage.initializeBucket()
    logger.info('MinIO bucket initialized successfully', undefined, 'Script')
  } catch (error) {
    logger.error('Failed to initialize MinIO bucket', { error }, 'Script')
    process.exit(1)
  }
}

main()


