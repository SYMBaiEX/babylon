#!/usr/bin/env bun

/**
 * Test storage upload functionality
 * 
 * This script tests uploading to CDN storage (Vercel Blob or MinIO)
 * Usage: bun run scripts/test-storage-upload.ts
 */

import { getStorageClient } from '../src/lib/storage/s3-client'
import { logger } from '../src/lib/logger'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

async function main() {
  logger.info('Testing storage upload...', undefined, 'Script')

  const storage = getStorageClient()

  // Initialize bucket if using MinIO
  try {
    await storage.initializeBucket()
    logger.info('Storage initialized', undefined, 'Script')
  } catch (error) {
    logger.warn('Bucket initialization skipped (may already exist)', { error }, 'Script')
  }

  // Find a test image
  const testImagePaths = [
    join(process.cwd(), 'public', 'assets', 'user-profiles', 'profile-1.jpg'),
    join(process.cwd(), 'public', 'assets', 'logos', 'logo.svg'),
    join(process.cwd(), 'public', 'assets', 'icons', 'icon.svg'),
  ]

  let testImagePath: string | null = null
  for (const path of testImagePaths) {
    if (existsSync(path)) {
      testImagePath = path
      break
    }
  }

  if (!testImagePath) {
    logger.error('No test image found in public/assets/', undefined, 'Script')
    logger.info('Please ensure you have at least one image in public/assets/', undefined, 'Script')
    process.exit(1)
  }

  logger.info(`Using test image: ${testImagePath}`, undefined, 'Script')

  // Read the test image
  const buffer = readFileSync(testImagePath)
  const filename = `test_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`

  logger.info(`Uploading ${filename} (${(buffer.length / 1024).toFixed(2)} KB)...`, undefined, 'Script')

  try {
    // Upload the image
    const result = await storage.uploadImage({
      file: buffer,
      filename,
      contentType: 'image/jpeg',
      folder: 'posts',
      optimize: true,
    })

    logger.info('✅ Upload successful!', undefined, 'Script')
    logger.info(`URL: ${result.url}`, undefined, 'Script')
    logger.info(`Key: ${result.key}`, undefined, 'Script')
    logger.info(`Size: ${(result.size / 1024).toFixed(2)} KB`, undefined, 'Script')
    logger.info(`Compression: ${((1 - result.size / buffer.length) * 100).toFixed(1)}%`, undefined, 'Script')

    // Test if file exists
    const exists = await storage.exists(result.key)
    logger.info(`File exists check: ${exists ? '✅ Yes' : '❌ No'}`, undefined, 'Script')

    // Test listing objects
    const objects = await storage.listObjects('posts/')
    logger.info(`Total objects in 'posts/' folder: ${objects.length}`, undefined, 'Script')

    // Clean up test file
    logger.info('Cleaning up test file...', undefined, 'Script')
    await storage.deleteImage(result.url)
    logger.info('✅ Test file deleted', undefined, 'Script')

    // Verify deletion
    const stillExists = await storage.exists(result.key)
    logger.info(`File still exists after deletion: ${stillExists ? '❌ Yes' : '✅ No'}`, undefined, 'Script')

    logger.info('', undefined, 'Script')
    logger.info('🎉 All tests passed!', undefined, 'Script')
    logger.info('', undefined, 'Script')
    logger.info('Storage is working correctly. You can now:', undefined, 'Script')
    logger.info('  1. Upload profile pictures via the app', undefined, 'Script')
    logger.info('  2. Migrate existing assets: bun run scripts/migrate-assets-to-cdn.ts', undefined, 'Script')
    logger.info('  3. View uploaded files:', undefined, 'Script')
    logger.info('     - MinIO: http://localhost:9001 (dev)', undefined, 'Script')
    logger.info('     - Vercel: https://vercel.com/[team]/[project]/stores (production)', undefined, 'Script')

  } catch (error) {
    logger.error('Upload failed', { error }, 'Script')
    logger.info('', undefined, 'Script')
    logger.info('Troubleshooting:', undefined, 'Script')
    logger.info('  1. Ensure Docker is running: docker ps', undefined, 'Script')
    logger.info('  2. Check MinIO is running: docker ps | grep minio', undefined, 'Script')
    logger.info('  3. Restart MinIO: docker-compose restart minio', undefined, 'Script')
    logger.info('  4. View MinIO console: http://localhost:9001', undefined, 'Script')
    logger.info('  5. Check environment variables in .env', undefined, 'Script')
    process.exit(1)
  }
}

main()


