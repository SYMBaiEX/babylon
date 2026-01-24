/**
 * SIWE Nonce Endpoint
 *
 * @route GET /api/auth/siwe/nonce
 * @access Public (rate limited)
 *
 * @description
 * Generates a time-limited nonce for SIWE (Sign-In With Ethereum) authentication.
 * The nonce is single-use and expires after 5 minutes.
 *
 * @openapi
 * /api/auth/siwe/nonce:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: Get SIWE nonce
 *     description: Generate a nonce for SIWE message signing. Rate limited to 10/min per IP.
 *     responses:
 *       200:
 *         description: Nonce generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nonce:
 *                   type: string
 *                   description: Random nonce to include in SIWE message
 *                 issuedAt:
 *                   type: string
 *                   format: date-time
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                 domain:
 *                   type: string
 *                   description: Domain to use in SIWE message
 *       429:
 *         description: Rate limit exceeded
 *
 * @example
 * ```bash
 * curl https://babylon.market/api/auth/siwe/nonce
 * ```
 */

import {
  checkRateLimitAsync,
  generateNonce,
  getClientIp,
  RATE_LIMIT_CONFIGS,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { logger } from '@babylon/shared';
import { type NextRequest, NextResponse } from 'next/server';

export const GET = withErrorHandling(async (request: NextRequest) => {
  // Rate limit by IP
  const clientIp = getClientIp(request.headers) || 'unknown';
  const rateLimitResult = await checkRateLimitAsync(
    clientIp,
    RATE_LIMIT_CONFIGS.SIWE_NONCE
  );

  if (!rateLimitResult.allowed) {
    logger.warn(
      'SIWE nonce rate limit exceeded',
      { ip: clientIp.slice(0, 10) + '...' },
      'SIWE'
    );
    const retryAfterSeconds = Math.max(1, rateLimitResult.retryAfter ?? 60);
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
        },
      }
    );
  }

  const nonceResponse = await generateNonce();

  return successResponse({
    nonce: nonceResponse.nonce,
    issuedAt: nonceResponse.issuedAt.toISOString(),
    expiresAt: nonceResponse.expiresAt.toISOString(),
    domain: nonceResponse.domain,
  });
});
