/**
 * IP Address Utility Functions
 *
 * Provides utilities for extracting and hashing IP addresses from requests.
 * Used for detecting self-referrals and preventing gaming of the referral system.
 */

import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Hash an IP address using SHA-256 for privacy
 *
 * @param ip - IP address to hash
 * @returns Hashed IP address (hex string)
 */
export function hashIpAddress(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

/**
 * Extract client IP address from NextRequest
 *
 * Handles various proxy headers and falls back to direct connection IP.
 * Checks X-Forwarded-For, X-Real-IP, and CF-Connecting-IP headers.
 *
 * @param request - Next.js request object
 * @returns Client IP address or null if not found
 */
export function getClientIp(request: NextRequest): string | null {
  // Check X-Forwarded-For header (most common proxy header)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one (original client)
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  // Check X-Real-IP header (nginx proxy)
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // Check CF-Connecting-IP header (Cloudflare)
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  // Fallback: try to get from headers
  const remoteAddress = request.headers.get('remote-addr');
  if (remoteAddress) return remoteAddress.trim();

  return null;
}

/**
 * Hash client IP from request
 *
 * Convenience function that combines getClientIp and hashIpAddress
 *
 * @param request - Next.js request object
 * @returns Hashed IP address or null if IP not found
 */
export function getHashedClientIp(request: NextRequest): string | null {
  const ip = getClientIp(request);
  if (!ip) return null;
  return hashIpAddress(ip);
}
