/**
 * Admin Reports API
 * 
 * @route GET /api/admin/reports - Get reports list
 * @access Admin
 * 
 * @description
 * Returns paginated list of user reports with comprehensive filtering, sorting,
 * and moderation metrics. Includes reporter and reported user information.
 * Requires admin authentication.
 * 
 * @openapi
 * /api/admin/reports:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get reports list
 *     description: Returns paginated reports with filtering and sorting (admin only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, reviewed, resolved, dismissed]
 *         description: Filter by status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: Filter by priority
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *         description: Filter by report type
 *       - in: query
 *         name: reporterId
 *         schema:
 *           type: string
 *         description: Filter by reporter ID
 *       - in: query
 *         name: reportedUserId
 *         schema:
 *           type: string
 *         description: Filter by reported user ID
 *       - in: query
 *         name: reportedPostId
 *         schema:
 *           type: string
 *         description: Filter by reported post ID
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [created, updated]
 *           default: created
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Reports retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reports:
 *                   type: array
 *                 total:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 * 
 * @example
 * ```typescript
 * const response = await fetch('/api/admin/reports?status=pending&priority=high', {
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * });
 * ```
 * 
 * @see {@link /lib/api/admin-middleware} Admin middleware
 */

import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api/admin-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { db } from '@/db';
import { GetReportsSchema } from '@/lib/validation/schemas/moderation';
import { logger } from '@/lib/logger';

export const GET = withErrorHandling(async (request: NextRequest) => {
  // Require admin authentication
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const params = GetReportsSchema.parse({
    limit: searchParams.get('limit') || '50',
    offset: searchParams.get('offset') || '0',
    status: searchParams.get('status') || undefined,
    category: searchParams.get('category') || undefined,
    priority: searchParams.get('priority') || undefined,
    reportType: searchParams.get('reportType') || undefined,
    reporterId: searchParams.get('reporterId') || undefined,
    reportedUserId: searchParams.get('reportedUserId') || undefined,
    reportedPostId: searchParams.get('reportedPostId') || undefined,
    sortBy: searchParams.get('sortBy') || 'created',
    sortOrder: searchParams.get('sortOrder') || 'desc',
  });

  logger.info('Admin reports list requested', { params }, 'GET /api/admin/reports');

  // Build where clause
  const where: Record<string, unknown> = {};

  if (params.status) where.status = params.status;
  if (params.category) where.category = params.category;
  if (params.priority) where.priority = params.priority;
  if (params.reportType) where.reportType = params.reportType;
  if (params.reporterId) where.reporterId = params.reporterId;
  if (params.reportedUserId) where.reportedUserId = params.reportedUserId;
  if (params.reportedPostId) where.reportedPostId = params.reportedPostId;

  // Build orderBy
  const orderBy: Record<string, 'asc' | 'desc'> = {};
  if (params.sortBy === 'created') {
    orderBy.createdAt = params.sortOrder;
  } else if (params.sortBy === 'updated') {
    orderBy.updatedAt = params.sortOrder;
  } else if (params.sortBy === 'priority') {
    orderBy.priority = params.sortOrder;
  }

  // Get reports
  const [reports, total] = await Promise.all([
    db.report.findMany({
      where,
      orderBy,
      take: params.limit,
      skip: params.offset,
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            displayName: true,
            profileImageUrl: true,
          },
        },
        reportedUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            profileImageUrl: true,
            isBanned: true,
          },
        },
        resolver: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    }),
    db.report.count({ where }),
  ]);

  // Parse evaluation from resolution field if it exists
  const reportsWithEvaluation = reports.map(report => {
    let evaluation = null;
    if (report.resolution) {
      try {
        const parsed = JSON.parse(report.resolution);
        // Check if it's an evaluation object (has outcome, confidence, etc.)
        if (parsed.outcome && typeof parsed.confidence === 'number') {
          evaluation = parsed;
        }
      } catch {
        // Not JSON, treat as plain text resolution
      }
    }
    return {
      ...report,
      evaluation,
    };
  });

  return successResponse({
    reports: reportsWithEvaluation,
    pagination: {
      limit: params.limit,
      offset: params.offset,
      total,
    },
  });
});


