/**
 * API Route: /api/upload/image
 * Methods: POST (upload image)
 *
 * Handles image uploads for user profiles (avatar, cover images)
 * Uses S3-compatible storage (MinIO for dev, Cloudflare R2 for production)
 * Falls back to local filesystem storage if external storage is unavailable
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { ImageUploadSchema } from '@/lib/validation/schemas'
import { getStorageClient } from '@/lib/storage/s3-client'
import { logger } from '@/lib/logger'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'

// Configuration
const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === 'true' || process.env.NODE_ENV === 'development'

/**
 * POST /api/upload/image
 * Upload an image file to S3-compatible storage
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  // Authenticate user
  const authUser = await authenticate(request)

  // Parse multipart form data
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const imageType = formData.get('type') as string | null // 'profile', 'cover', or 'post'

  // Validate using schema
  ImageUploadSchema.parse({
    file: file ? { size: file.size, type: file.type } : null,
    type: imageType || undefined
  })

  if (!file) {
    throw new Error('No file provided')
  }

  // Determine folder based on image type
  let folder: 'profiles' | 'covers' | 'posts' = 'posts'
  if (imageType === 'profile') folder = 'profiles'
  else if (imageType === 'cover') folder = 'covers'

  // Generate unique filename
  const timestamp = Date.now()
  const randomString = Math.random().toString(36).substring(7)
  const extension = 'webp' // We'll convert all images to webp for optimization
  const filename = `${authUser.userId}_${timestamp}_${randomString}.${extension}`

  // Convert file to buffer
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Use local storage for development or when configured
  if (USE_LOCAL_STORAGE) {
    try {
      // Optimize image
      const optimized = await sharp(buffer)
        .webp({ quality: 85 })
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .toBuffer()

      // Create upload directory structure
      const uploadDir = join(process.cwd(), 'public', 'uploads', folder)
      await mkdir(uploadDir, { recursive: true })

      // Save file to public/uploads
      const filePath = join(uploadDir, filename)
      await writeFile(filePath, optimized)

      const url = `/uploads/${folder}/${filename}`

      logger.info(`Image uploaded successfully to local storage`, {
        userId: authUser.userId,
        filename,
        path: filePath,
        size: optimized.length,
        originalSize: file.size,
        type: imageType || 'unknown',
      }, 'POST /api/upload/image')

      return successResponse({
        success: true,
        url,
        key: `${folder}/${filename}`,
        size: optimized.length,
        filename,
      })
    } catch (localError) {
      logger.error('Local storage upload failed:', localError, 'POST /api/upload/image')
      // Fall through to try external storage
    }
  }

  // Upload to S3-compatible storage (production or fallback)
  const storage = getStorageClient()
  const result = await storage.uploadImage({
    file: buffer,
    filename,
    contentType: 'image/webp',
    folder,
    optimize: true, // Enable image optimization
  })

  logger.info(`Image uploaded successfully to external storage`, {
    userId: authUser.userId,
    filename,
    key: result.key,
    size: result.size,
    originalSize: file.size,
    type: imageType || 'unknown',
  }, 'POST /api/upload/image')

  return successResponse({
    success: true,
    url: result.url,
    key: result.key,
    size: result.size,
    filename,
  })
})

