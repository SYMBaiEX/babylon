/**
 * Admin Audit Logs API
 *
 * @route GET /api/admin/audit-logs - Get admin audit logs
 * @access Admin
 *
 * @description
 * Returns admin audit logs for reviewing admin actions.
 * Supports pagination and filtering by admin, action type, and resource.
 *
 * @openapi
 * /api/admin/audit-logs:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get admin audit logs
 *     description: Returns admin audit logs with pagination (admin only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *       - name: adminId
 *         in: query
 *         schema:
 *           type: string
 *       - name: action
 *         in: query
 *         schema:
 *           type: string
 *       - name: resourceType
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */

import { requireAdmin, successResponse, withErrorHandling } from '@babylon/api';
import { adminAuditLogs, and, count, db, desc, eq, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

// Valid action and resource types for audit logs
const VALID_ACTIONS = [
  'view',
  'create',
  'modify',
  'delete',
  'ban',
  'privilege_change',
] as const;

const VALID_RESOURCE_TYPES = [
  'user',
  'post',
  'comment',
  'market',
  'report',
  'system',
] as const;

const AuditLogFiltersSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).max(10000).default(0), // Max offset to prevent abuse
  adminId: z.string().min(1).optional(),
  action: z.enum(VALID_ACTIONS).optional(),
  resourceType: z.enum(VALID_RESOURCE_TYPES).optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);

  // Validate query parameters with Zod
  const parseResult = AuditLogFiltersSchema.safeParse({
    limit: searchParams.get('limit') || undefined,
    offset: searchParams.get('offset') || undefined,
    adminId: searchParams.get('adminId') || undefined,
    action: searchParams.get('action') || undefined,
    resourceType: searchParams.get('resourceType') || undefined,
  });

  if (!parseResult.success) {
    return successResponse(
      {
        error: 'Invalid query parameters',
        details: parseResult.error.flatten(),
      },
      400
    );
  }

  const {
    limit,
    offset,
    adminId: filterAdminId,
    action: filterAction,
    resourceType: filterResourceType,
  } = parseResult.data;

  logger.info(
    'Admin audit logs requested',
    { limit, offset, filterAdminId, filterAction, filterResourceType },
    'GET /api/admin/audit-logs'
  );

  // Build conditions
  const conditions = [];
  if (filterAdminId) {
    conditions.push(eq(adminAuditLogs.adminId, filterAdminId));
  }
  if (filterAction) {
    conditions.push(eq(adminAuditLogs.action, filterAction));
  }
  if (filterResourceType) {
    conditions.push(eq(adminAuditLogs.resourceType, filterResourceType));
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count for proper pagination
  const [totalResult] = await db
    .select({ count: count() })
    .from(adminAuditLogs)
    .where(whereCondition);
  const total = totalResult?.count ?? 0;

  // Query logs with admin user info
  const logs = await db
    .select({
      id: adminAuditLogs.id,
      adminId: adminAuditLogs.adminId,
      action: adminAuditLogs.action,
      resourceType: adminAuditLogs.resourceType,
      resourceId: adminAuditLogs.resourceId,
      previousValue: adminAuditLogs.previousValue,
      newValue: adminAuditLogs.newValue,
      ipAddress: adminAuditLogs.ipAddress,
      metadata: adminAuditLogs.metadata,
      createdAt: adminAuditLogs.createdAt,
      adminUsername: users.username,
      adminDisplayName: users.displayName,
      adminProfileImageUrl: users.profileImageUrl,
    })
    .from(adminAuditLogs)
    .leftJoin(users, eq(adminAuditLogs.adminId, users.id))
    .where(whereCondition)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  // Get unique action types for filter dropdown
  const actionTypes = await db
    .selectDistinct({ action: adminAuditLogs.action })
    .from(adminAuditLogs)
    .orderBy(adminAuditLogs.action);

  // Get unique resource types for filter dropdown
  const resourceTypes = await db
    .selectDistinct({ resourceType: adminAuditLogs.resourceType })
    .from(adminAuditLogs)
    .orderBy(adminAuditLogs.resourceType);

  return successResponse({
    logs: logs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
      admin: {
        id: log.adminId,
        username: log.adminUsername,
        displayName: log.adminDisplayName,
        profileImageUrl: log.adminProfileImageUrl,
      },
    })),
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + logs.length < total,
    },
    filters: {
      actionTypes: actionTypes.map((a) => a.action),
      resourceTypes: resourceTypes.map((r) => r.resourceType),
    },
  });
});
