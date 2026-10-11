import type { Buffer } from 'node:buffer';
/** Local MinIO storage and Cloudflare R2 production storage. */

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { logger } from '@babylon/shared';
import { R2StorageClient } from './r2-client';

// MinIO configuration (local development)
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'babylon';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'babylon_dev_password';
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'babylon-uploads';

interface UploadOptions {
  file: Buffer;
  filename: string;
  contentType: string;
  folder?:
    | 'profiles'
    | 'covers'
    | 'posts'
    | 'user-profiles'
    | 'user-banners'
    | 'actors'
    | 'actor-banners'
    | 'organizations'
    | 'org-banners'
    | 'logos'
    | 'icons'
    | 'static';
}

interface UploadResult {
  url: string;
  key: string;
  size: number;
}

class S3StorageClient {
  private client: S3Client | null = null;
  private bucket!: string;
  private publicUrl!: string | null;
  constructor() {
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: MINIO_ENDPOINT,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true,
    });
    this.bucket = MINIO_BUCKET;
    this.publicUrl = MINIO_ENDPOINT;
  }

  /**
   * Upload an image file
   * Images are uploaded as-is; optimization is handled by the web host.
   */
  async uploadImage(options: UploadOptions): Promise<UploadResult> {
    const buffer = options.file;

    // Generate path/key
    const folder = options.folder || 'uploads';
    const pathname = `${folder}/${options.filename}`;

    // Upload to MinIO/S3
    if (!this.client) {
      throw new Error('S3 client not initialized');
    }

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: pathname,
        Body: buffer,
        ContentType: options.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      },
    });

    await upload.done();

    // Generate public URL
    const url = this.publicUrl
      ? `${this.publicUrl}/${this.bucket}/${pathname}`
      : `http://localhost:9000/${this.bucket}/${pathname}`;

    logger.info('Image uploaded successfully to MinIO', {
      key: pathname,
      size: buffer.length,
      bucket: this.bucket,
    });

    return {
      url,
      key: pathname,
      size: buffer.length,
    };
  }

  /**
   * Delete an image file
   */
  async deleteImage(url: string): Promise<void> {
    // Delete from MinIO/S3
    if (!this.client) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from URL if full URL is provided
    let key = url;
    if (url.startsWith('http')) {
      // URL format: http://localhost:9000/babylon-uploads/folder/file.jpg
      // Extract: folder/file.jpg
      const urlParts = url.split(`/${this.bucket}/`);
      key = urlParts.length > 1 ? urlParts[1] || url : url;
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
    logger.info('Image deleted successfully from MinIO', { key });
  }

  /**
   * Initialize bucket (for development/MinIO only)
   */
  async initializeBucket(): Promise<void> {
    await this.client!.send(new CreateBucketCommand({ Bucket: this.bucket }));
    logger.info(`Created bucket: ${this.bucket}`);

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    };

    await this.client!.send(
      new PutBucketPolicyCommand({
        Bucket: this.bucket,
        Policy: JSON.stringify(policy),
      })
    );
    logger.info(`Set public policy for bucket: ${this.bucket}`);
  }

  /**
   * List objects in a folder
   */
  async listObjects(prefix: string): Promise<string[]> {
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    });
    const response = await this.client!.send(command);
    return (response.Contents || []).map((obj) => obj.Key || '');
  }

  /**
   * Check if an object exists
   */
  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    if (!this.client) {
      return false;
    }
    await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    return true;
  }
}

// Singleton instance
let storageClient: S3StorageClient | R2StorageClient | null = null;

export function getStorageClient(): S3StorageClient | R2StorageClient {
  if (!storageClient) {
    storageClient =
      process.env.STORAGE_PROVIDER === 'r2'
        ? new R2StorageClient()
        : new S3StorageClient();
  }
  return storageClient;
}

export type { UploadOptions, UploadResult };
