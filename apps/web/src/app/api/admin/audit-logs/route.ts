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
import { adminAuditLogs, and, db, desc, eq, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get('limit') || '50', 10), 1),
    100
  );
  const offset = Math.max(
    Number.parseInt(searchParams.get('offset') || '0', 10),
    0
  );
  const filterAdminId = searchParams.get('adminId');
  const filterAction = searchParams.get('action');
  const filterResourceType = searchParams.get('resourceType');

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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
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
      hasMore: logs.length === limit,
    },
    filters: {
      actionTypes: actionTypes.map((a) => a.action),
      resourceTypes: resourceTypes.map((r) => r.resourceType),
    },
  });
});
