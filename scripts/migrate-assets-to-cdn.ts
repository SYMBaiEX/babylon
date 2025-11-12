#!/usr/bin/env bun

/**
 * Migrate existing public assets to CDN storage (Vercel Blob or MinIO)
 * 
 * This script:
 * 1. Scans public/assets and public/images directories
 * 2. Uploads all assets to CDN storage
 * 3. Creates a mapping file for URL references
 * 4. Optionally updates database references
 * 
 * Usage:
 *   bun run scripts/migrate-assets-to-cdn.ts [--dry-run] [--force]
 */

import { getStorageClient } from '../src/lib/storage/s3-client'
import { logger } from '../src/lib/logger'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, extname, relative } from 'path'
import { PrismaClient } from '@prisma/client'

const ASSETS_ROOT = join(process.cwd(), 'public')
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')

interface AssetMapping {
  oldPath: string
  newUrl: string
  size: number
}

const assetMappings: AssetMapping[] = []

// Directories to migrate
const DIRECTORIES_TO_MIGRATE = [
  'assets/user-profiles',
  'assets/user-banners',
  'assets/logos',
  'assets/icons',
  'images/actors',
  'images/actor-banners',
  'images/organizations',
  'images/org-banners',
]

// File extensions to include
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']

/**
 * Get content type from file extension
 */
function getContentType(filename: string): string {
  const ext = extname(filename).toLowerCase()
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  }
  return types[ext] || 'application/octet-stream'
}

/**
 * Recursively get all files in a directory
 */
function* getFiles(dir: string): Generator<string> {
  const entries = readdirSync(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    
    if (entry.isDirectory()) {
      yield* getFiles(fullPath)
    } else if (entry.isFile()) {
      yield fullPath
    }
  }
}

/**
 * Upload a single file to CDN
 */
async function uploadFile(
  storage: ReturnType<typeof getStorageClient>,
  filePath: string,
  relativePath: string
): Promise<AssetMapping | null> {
  const ext = extname(filePath).toLowerCase()
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    logger.info(`Skipping non-image file: ${relativePath}`, undefined, 'Script')
    return null
  }

  try {
    // Determine folder based on path
    let folder: string
    if (relativePath.includes('user-profiles')) folder = 'user-profiles'
    else if (relativePath.includes('user-banners')) folder = 'user-banners'
    else if (relativePath.includes('actors') && relativePath.includes('banners')) folder = 'actor-banners'
    else if (relativePath.includes('actors')) folder = 'actors'
    else if (relativePath.includes('organizations') && relativePath.includes('banners')) folder = 'org-banners'
    else if (relativePath.includes('organizations')) folder = 'organizations'
    else if (relativePath.includes('logos')) folder = 'logos'
    else if (relativePath.includes('icons')) folder = 'icons'
    else folder = 'static'

    const filename = relativePath.replace(/\//g, '_').replace(/^_/, '')
    
    // Check if already exists
    const existingKey = `${folder}/${filename}`
    if (!FORCE) {
      const exists = await storage.exists(existingKey)
      if (exists) {
        logger.info(`Skipping existing file: ${relativePath}`, undefined, 'Script')
        return null
      }
    }

    // Read file
    const buffer = readFileSync(filePath)
    const contentType = getContentType(filePath)

    if (DRY_RUN) {
      logger.info(`[DRY RUN] Would upload: ${relativePath} → ${folder}/${filename} (${(buffer.length / 1024).toFixed(2)} KB)`, undefined, 'Script')
      return {
        oldPath: `/${relativePath}`,
        newUrl: `[would-be-uploaded]/${folder}/${filename}`,
        size: buffer.length,
      }
    }

    // Upload to storage
    const result = await storage.uploadImage({
      file: buffer,
      filename,
      contentType,
      folder: folder as any,
      optimize: false, // Keep original quality for static assets
    })

    logger.info(`Uploaded: ${relativePath} → ${result.url} (${(result.size / 1024).toFixed(2)} KB)`, undefined, 'Script')

    return {
      oldPath: `/${relativePath}`,
      newUrl: result.url,
      size: result.size,
    }
  } catch (error) {
    logger.error(`Failed to upload ${relativePath}`, { error }, 'Script')
    return null
  }
}

/**
 * Update database references
 */
async function updateDatabaseReferences(mappings: AssetMapping[]) {
  if (DRY_RUN) {
    logger.info('[DRY RUN] Would update database references', undefined, 'Script')
    return
  }

  const prisma = new PrismaClient()

  try {
    // Update actor profile images
    for (const mapping of mappings) {
      if (mapping.oldPath.includes('/images/actors/') && !mapping.oldPath.includes('banners')) {
        const actorId = mapping.oldPath.split('/').pop()?.replace(/\.(jpg|png|webp)$/i, '')
        if (actorId) {
          const updated = await prisma.actor.updateMany({
            where: {
              id: actorId,
              profileImageUrl: mapping.oldPath,
            },
            data: {
              profileImageUrl: mapping.newUrl,
            },
          })
          if (updated.count > 0) {
            logger.info(`Updated actor ${actorId} profile image URL`, undefined, 'Script')
          }
        }
      }

      // Update organization profile images
      if (mapping.oldPath.includes('/images/organizations/')) {
        const orgId = mapping.oldPath.split('/').pop()?.replace(/\.(jpg|png|webp)$/i, '')
        if (orgId) {
          const updated = await prisma.organization.updateMany({
            where: {
              id: orgId,
              imageUrl: mapping.oldPath,
            },
            data: {
              imageUrl: mapping.newUrl,
            },
          })
          if (updated.count > 0) {
            logger.info(`Updated organization ${orgId} image URL`, undefined, 'Script')
          }
        }
      }
    }

    await prisma.$disconnect()
  } catch (error) {
    logger.error('Failed to update database references', { error }, 'Script')
    await prisma.$disconnect()
  }
}

/**
 * Main migration function
 */
async function main() {
  logger.info('Starting asset migration to CDN...', undefined, 'Script')
  
  if (DRY_RUN) {
    logger.info('🔍 DRY RUN MODE - No files will be uploaded', undefined, 'Script')
  }

  // Initialize storage
  const storage = getStorageClient()
  
  // Initialize bucket if using MinIO
  try {
    await storage.initializeBucket()
  } catch (error) {
    logger.warn('Bucket initialization skipped (may already exist)', { error }, 'Script')
  }

  // Process each directory
  let totalFiles = 0
  let uploadedFiles = 0
  let skippedFiles = 0
  let failedFiles = 0

  for (const dir of DIRECTORIES_TO_MIGRATE) {
    const fullPath = join(ASSETS_ROOT, dir)
    
    try {
      const stat = statSync(fullPath)
      if (!stat.isDirectory()) {
        logger.warn(`Not a directory: ${dir}`, undefined, 'Script')
        continue
      }
    } catch {
      logger.warn(`Directory not found: ${dir}`, undefined, 'Script')
      continue
    }

    logger.info(`Processing directory: ${dir}`, undefined, 'Script')

    for (const filePath of getFiles(fullPath)) {
      totalFiles++
      const relativePath = relative(ASSETS_ROOT, filePath)
      
      const result = await uploadFile(storage, filePath, relativePath)
      
      if (result) {
        assetMappings.push(result)
        uploadedFiles++
      } else {
        skippedFiles++
      }

      // Add a small delay to avoid overwhelming the storage service
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  // Save mapping file
  const mappingPath = join(process.cwd(), 'asset-cdn-mappings.json')
  writeFileSync(mappingPath, JSON.stringify(assetMappings, null, 2))
  logger.info(`Saved asset mappings to ${mappingPath}`, undefined, 'Script')

  // Update database references
  if (assetMappings.length > 0) {
    await updateDatabaseReferences(assetMappings)
  }

  // Summary
  logger.info('Migration complete!', undefined, 'Script')
  logger.info(`Total files scanned: ${totalFiles}`, undefined, 'Script')
  logger.info(`Files uploaded: ${uploadedFiles}`, undefined, 'Script')
  logger.info(`Files skipped: ${skippedFiles}`, undefined, 'Script')
  logger.info(`Files failed: ${failedFiles}`, undefined, 'Script')

  const totalSize = assetMappings.reduce((sum, m) => sum + m.size, 0)
  logger.info(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`, undefined, 'Script')

  if (DRY_RUN) {
    logger.info('', undefined, 'Script')
    logger.info('To perform the actual migration, run:', undefined, 'Script')
    logger.info('  bun run scripts/migrate-assets-to-cdn.ts', undefined, 'Script')
  }
}

main().catch((error) => {
  logger.error('Migration failed', { error }, 'Script')
  process.exit(1)
})


