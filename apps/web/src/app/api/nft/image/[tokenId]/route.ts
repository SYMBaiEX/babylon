/**
 * NFT Image Proxy API
 *
 * @route GET /api/nft/image/[tokenId] - Proxy NFT images from GitHub
 * @access Public
 *
 * @description
 * Proxies NFT images from GitHub repository to avoid CORS issues and token expiration.
 * Uses GitHub API to fetch images with proper authentication.
 * Includes in-memory caching and rate limiting to protect against abuse.
 */

import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const GITHUB_REPO = 'BabylonSocial/ProductManagementDocumentation';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

/** Collection size - configurable for different NFT collections */
const COLLECTION_SIZE = Number(process.env.NFT_COLLECTION_SIZE) || 100;

/** Max cache size to prevent memory leaks (LRU eviction when exceeded) */
const MAX_CACHE_SIZE = 100;

/** In-memory cache for image data (survives across requests in same worker) */
const imageCache = new Map<
  number,
  { buffer: ArrayBuffer; contentType: string; cachedAt: number }
>();

/** Cache TTL: 1 hour (images are immutable, but allow refresh for updates) */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Add to cache with LRU eviction when max size exceeded
 * Removes oldest entry (by cachedAt) when cache is full
 */
function addToCache(
  tokenId: number,
  buffer: ArrayBuffer,
  contentType: string
): void {
  // Evict oldest entry if cache is full
  if (imageCache.size >= MAX_CACHE_SIZE) {
    let oldestKey: number | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of imageCache.entries()) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) {
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

/**
 * Simple sliding window rate limiter
 * Limits requests per IP to prevent abuse of GitHub API
 */
const rateLimitWindow = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitWindow.get(ip);

  if (!entry || now > entry.resetAt) {
    // New window
    rateLimitWindow.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  entry.count++;
  return false;
}

// Cleanup old rate limit entries periodically (every 5 minutes)
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitWindow.entries()) {
      if (now > entry.resetAt) {
        rateLimitWindow.delete(ip);
      }
    }
  },
  5 * 60 * 1000
);

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
 * Proxy NFT image from GitHub with caching and rate limiting
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tokenId: string }> }
) {
  // Get client IP for rate limiting
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // Check rate limit (skip for cached responses)
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

  // Apply rate limit only for cache misses (actual GitHub API calls)
  if (isRateLimited(ip)) {
    logger.warn(
      `Rate limit exceeded for IP ${ip.slice(0, 8)}...`,
      undefined,
      'GET /api/nft/image/[tokenId]'
    );
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
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

    const metadata = await metadataResponse.json();
    const downloadUrl = metadata.download_url;

    if (!downloadUrl) {
      logger.warn(
        `No download URL for NFT image #${tokenId}`,
        undefined,
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

    // Store in cache (with LRU eviction)
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
      return NextResponse.json(
        { error: 'Gateway timeout' },
        { status: 504 }
      );
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
