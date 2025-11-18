/**
 * Monitored Storage Service
 * Wraps storage operations with performance monitoring
 */

import { getStorageClient } from '@/lib/storage/s3-client';
import { performanceMonitor } from './performance-monitor';

const storageClient = getStorageClient();

/**
 * Upload file with monitoring
 */
export async function monitoredUploadImage(options: {
  file: Buffer;
  filename: string;
  contentType: string;
  folder?: 'profiles' | 'covers' | 'posts' | 'user-profiles' | 'user-banners' | 'actors' | 'actor-banners' | 'organizations' | 'org-banners' | 'logos' | 'icons' | 'static';
  optimize?: boolean;
}): Promise<{ url: string; key: string; size: number }> {
  const startTime = performance.now();
  
  const result = await storageClient.uploadImage(options);
  const latency = performance.now() - startTime;
  
  performanceMonitor.recordStorageOperation('upload', latency, result.size);
  
  return result;
}

/**
 * Note: Storage client currently doesn't expose deleteFile method.
 * This is a placeholder for when that functionality is added.
 * For now, we only monitor uploads.
 */

