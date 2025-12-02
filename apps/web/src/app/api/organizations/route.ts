/**
 * Organizations API
 *
 * @route GET /api/organizations - Get organizations
 * @access Public
 *
 * @description
 * Returns list of organizations in the game world. Supports filtering by IDs
 * for batch lookups. Organizations represent groups, factions, and institutions
 * in the Babylon game world.
 *
 * @openapi
 * /api/organizations:
 *   get:
 *     tags:
 *       - Organizations
 *     summary: Get organizations
 *     description: Returns list of organizations, optionally filtered by IDs
 *     parameters:
 *       - in: query
 *         name: ids
 *         schema:
 *           type: string
 *         description: Comma-separated organization IDs for batch lookup
 *         example: org1,org2,org3
 *     responses:
 *       200:
 *         description: Organizations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 organizations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *                       description:
 *                         type: string
 *
 * @example
 * ```typescript
 * // Get all organizations
 * const response = await fetch('/api/organizations');
 * const { organizations } = await response.json();
 *
 * // Get specific organizations
 * const batch = await fetch('/api/organizations?ids=org1,org2');
 * ```
 *
 * @see {@link /lib/db/context} RLS context
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { optionalAuth } from '@babylon/api';
import { asPublic, asUser } from '@babylon/db';

/**
 * GET /api/organizations
 *
 * @description Get organizations, optionally filtered by IDs
 *
 * @param {Request} request - Request object
 *
 * @returns {Promise<NextResponse>} Organizations data
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');

  // Optional auth - organizations are public but RLS still applies
  const authUser = await optionalAuth(request as NextRequest).catch(() => null);

  const organizations =
    authUser && authUser.userId
      ? await asUser(authUser, async (db) => {
          if (!idsParam) {
            return await db.organization.findMany({
              select: {
                id: true,
                name: true,
                type: true,
                description: true,
              },
              take: 100,
            });
          }

          const ids = idsParam.split(',').filter(Boolean);

          return await db.organization.findMany({
            where: {
              id: { in: ids },
            },
            select: {
              id: true,
              name: true,
              type: true,
              description: true,
            },
          });
        })
      : await asPublic(async (db) => {
          if (!idsParam) {
            return await db.organization.findMany({
              select: {
                id: true,
                name: true,
                type: true,
                description: true,
              },
              take: 100,
            });
          }

          const ids = idsParam.split(',').filter(Boolean);

          return await db.organization.findMany({
            where: {
              id: { in: ids },
            },
            select: {
              id: true,
              name: true,
              type: true,
              description: true,
            },
          });
        });

  return NextResponse.json({
    success: true,
    organizations,
  });
}
