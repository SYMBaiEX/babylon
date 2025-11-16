/**
 * Admin Management API
 * 
 * @route GET /api/admin/admins - Get admin users
 * @access Admin
 * 
 * @description
 * Returns list of all admin users with their details. Excludes NPCs/actors.
 * Admin only endpoint.
 * 
 * @openapi
 * /api/admin/admins:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get admin users
 *     description: Returns list of all admin users (admin only)
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Admins retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 admins:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       displayName:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 * 
 * @example
 * ```typescript
 * const { admins } = await fetch('/api/admin/admins', {
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * }).then(r => r.json());
 * ```
 */

import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api/admin-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const GET = withErrorHandling(async (request: NextRequest) => {
  // Require admin authentication
  await requireAdmin(request);

  logger.info(`Admin list requested`, {}, 'GET /api/admin/admins');

  // Get all admin users
  const admins = await prisma.user.findMany({
    where: {
      isAdmin: true,
      isActor: false, // Exclude NPCs
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      walletAddress: true,
      profileImageUrl: true,
      isActor: true,
      isAdmin: true,
      isBanned: true,
      onChainRegistered: true,
      hasFarcaster: true,
      hasTwitter: true,
      farcasterUsername: true,
      twitterUsername: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: 'asc', // Oldest admins first
    },
  });

  logger.info(`Found ${admins.length} admins`, {}, 'GET /api/admin/admins');

  return successResponse({
    admins,
    total: admins.length,
  });
});


