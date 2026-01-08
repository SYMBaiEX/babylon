/**
 * NFT Image Proxy API
 *
 * @route GET /api/nft/image/[tokenId] - Proxy NFT images from GitHub
 * @access Public
 *
 * @description
 * Proxies NFT images from GitHub repository to avoid CORS issues and token expiration.
 * Uses GitHub API to fetch images with proper authentication.
 * Includes in-memory caching and distributed rate limiting to protect against abuse.
 */

import {
  checkRateLimitAsync,
  getClientIp,
  RATE_LIMIT_CONFIGS,
} from '@babylon/api';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isValidGitHubUrl } from '../utils';

const GITHUB_REPO = 'BabylonSocial/ProductManagementDocumentation';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

/**
 * NFT collection size - determines valid tokenId range (1 to COLLECTION_SIZE).
 *
 * Configure via NFT_COLLECTION_SIZE environment variable.
 * Default: 100 (fallback when env var is not set or invalid)
 *
 * IMPORTANT: When deploying a new collection or expanding an existing one,
 * update NFT_COLLECTION_SIZE to match the actual collection size.
 * Requests for tokenIds outside this range will return 400 Bad Request.
 */
const COLLECTION_SIZE = Number(process.env.NFT_COLLECTION_SIZE) || 100;

/**
 * Max cache size to prevent memory leaks (FIFO eviction when exceeded).
 *
 * Memory considerations:
 * - Each entry contains an ArrayBuffer (typically 50KB-500KB for images)
 * - At MAX_CACHE_SIZE=100 entries, worst case memory is ~50MB
 * - Acceptable for Vercel serverless functions (1GB limit)
 * - If memory becomes an issue, consider:
 *   1. Reducing MAX_CACHE_SIZE
 *   2. Adding a MAX_CACHE_BYTES limit with size tracking
 *   3. Using external caching (Redis, Vercel CDN already handles this)
 */
const MAX_CACHE_SIZE = 100;

/**
 * In-memory cache for image data (survives across requests in same worker).
 *
 * Note: In serverless environments, each instance maintains a separate cache.
 * This means cache hits are not shared across instances, but this is acceptable
 * because:
 * 1. Vercel CDN provides the primary caching layer (immutable headers)
 * 2. This cache only reduces GitHub API calls for warm instances
 * 3. Images are immutable, so inconsistency between instances is not an issue
 */
const imageCache = new Map<
  number,
  { buffer: ArrayBuffer; contentType: string; cachedAt: number }
>();

/** Cache TTL: 1 hour (images are immutable, but allow refresh for updates) */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Add to cache with FIFO eviction when max size exceeded.
 * Leverages Map's insertion order: first key is the oldest entry.
 * Note: cachedAt is kept for TTL expiry checks.
 */
function addToCache(
  tokenId: number,
  buffer: ArrayBuffer,
  contentType: string
): void {
  // Evict oldest entry (first key by insertion order) if cache is full
  if (imageCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey !== undefined) {
      imageCache.delete(oldestKey);
    }
  }

  imageCache.set(tokenId, {
    buffer,
    contentType,
    cachedAt: Date.now(),
  });
}

/** Fetch timeout in milliseconds */
const FETCH_TIMEOUT_MS = 10 * 1000; // 10 seconds

/** Helper to create a fetch with timeout using AbortController */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Log warning at startup if GITHUB_TOKEN is not set
if (!GITHUB_TOKEN) {
  logger.warn(
    'GITHUB_TOKEN not set - image proxy will use unauthenticated requests with lower rate limits',
    undefined,
    'NFT Image Proxy'
  );
}

/**
 * GET /api/nft/image/[tokenId]
 * Proxy NFT image from GitHub with caching and distributed rate limiting
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tokenId: string }> }
) {
  // Get client IP for rate limiting using centralized helper
  const clientIp = getClientIp(request.headers);

  // Validate tokenId before any expensive operations
  const { tokenId: tokenIdStr } = await context.params;
  const tokenId = Number(tokenIdStr);

  if (
    !tokenIdStr ||
    isNaN(tokenId) ||
    tokenId < 1 ||
    tokenId > COLLECTION_SIZE
  ) {
    return NextResponse.json({ error: 'Invalid token ID' }, { status: 400 });
  }

  // Check in-memory cache first (doesn't count against rate limit)
  const cached = imageCache.get(tokenId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return new NextResponse(cached.buffer, {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'public, max-age=31536000',
        'Vercel-CDN-Cache-Control': 'public, max-age=31536000',
        'X-Cache': 'HIT',
      },
    });
  }

  // Apply distributed rate limit for cache misses (actual GitHub API calls)
  // Uses Redis for distributed enforcement across serverless workers
  const rateLimitConfig = clientIp
    ? RATE_LIMIT_CONFIGS.PUBLIC_NFT_IMAGE
    : RATE_LIMIT_CONFIGS.PUBLIC_NFT_IMAGE_ANONYMOUS;
  const rateLimitKey = clientIp ? `ip:${clientIp}` : 'ip:anonymous';
  const rateLimit = await checkRateLimitAsync(rateLimitKey, rateLimitConfig);

  if (!rateLimit.allowed) {
    const retryAfterSeconds = rateLimit.retryAfter ?? 60;
    logger.warn(
      `Rate limit exceeded for NFT image request`,
      { ip: clientIp?.slice(0, 8), tokenId, retryAfter: retryAfterSeconds },
      'GET /api/nft/image/[tokenId]'
    );
    return NextResponse.json(
      { error: 'Too many requests', retryAfter: retryAfterSeconds },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
        },
      }
    );
  }

  try {
    // Fetch file metadata from GitHub API
    const filePath = `NFT Protomonkeys/images/${tokenId}.png`;
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Babylon-NFT-Proxy/1.0',
    };
    if (GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    }

    const metadataResponse = await fetchWithTimeout(apiUrl, { headers });

    if (!metadataResponse.ok) {
      logger.warn(
        `Failed to fetch NFT metadata #${tokenId} from GitHub API`,
        { status: metadataResponse.status },
        'GET /api/nft/image/[tokenId]'
      );
      return NextResponse.json(
        { error: 'Image not found' },
        { status: metadataResponse.status === 404 ? 404 : 502 }
      );
    }

    // Type for GitHub Contents API response
    interface GitHubContentMetadata {
      download_url: string | null;
      name?: string;
      path?: string;
      sha?: string;
      size?: number;
      type?: string;
    }

    function isGitHubContentMetadata(
      data: unknown
    ): data is GitHubContentMetadata {
      return (
        data !== null &&
        typeof data === 'object' &&
        'download_url' in data &&
        (typeof (data as GitHubContentMetadata).download_url === 'string' ||
          (data as GitHubContentMetadata).download_url === null)
      );
    }

    const metadata: unknown = await metadataResponse.json();

    if (!isGitHubContentMetadata(metadata)) {
      logger.warn(
        `Invalid GitHub response for NFT metadata #${tokenId}`,
        { tokenId },
        'GET /api/nft/image/[tokenId]'
      );
      return NextResponse.json(
        { error: 'Invalid GitHub response' },
        { status: 502 }
      );
    }

    const downloadUrl = metadata.download_url;

    // Validate download URL exists and is from a trusted GitHub domain
    if (!downloadUrl) {
      logger.warn(
        `No download URL for NFT image #${tokenId}`,
        undefined,
        'GET /api/nft/image/[tokenId]'
      );
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    if (!isValidGitHubUrl(downloadUrl)) {
      logger.warn(
        `Invalid or untrusted download URL for NFT image #${tokenId}`,
        { tokenId, url: String(downloadUrl).slice(0, 200) },
        'GET /api/nft/image/[tokenId]'
      );
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Fetch the image from GitHub with timeout
    const imageResponse = await fetchWithTimeout(downloadUrl, {
      headers: { 'User-Agent': 'Babylon-NFT-Proxy/1.0' },
    });

    if (!imageResponse.ok) {
      logger.warn(
        `Failed to fetch NFT image #${tokenId} from GitHub`,
        { status: imageResponse.status, url: downloadUrl },
        'GET /api/nft/image/[tokenId]'
      );
      return NextResponse.json(
        { error: 'Failed to fetch image' },
        { status: imageResponse.status }
      );
    }

    // Get image data
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType =
      imageResponse.headers.get('content-type') || 'image/png';

    // Store in cache (with FIFO eviction based on insertion time)
    addToCache(tokenId, imageBuffer, contentType);

    // Return image with proper headers and caching
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
        'CDN-Cache-Control': 'public, max-age=31536000',
        'Vercel-CDN-Cache-Control': 'public, max-age=31536000',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    // Handle abort/timeout errors
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn(
        `Timeout fetching NFT image #${tokenId}`,
        { tokenId },
        'GET /api/nft/image/[tokenId]'
      );
      return NextResponse.json({ error: 'Gateway timeout' }, { status: 504 });
    }

    logger.error(
      `Error proxying NFT image #${tokenId}`,
      {
        tokenId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'GET /api/nft/image/[tokenId]'
    );

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
