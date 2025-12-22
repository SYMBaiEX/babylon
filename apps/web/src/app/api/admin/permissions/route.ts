/**
 * Admin Permissions API
 *
 * @route GET /api/admin/permissions - Get current user's admin permissions
 * @access Admin
 */

import {
  getAdminRole,
  requireAdmin,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { ADMIN_PERMISSIONS, ROLE_PERMISSIONS } from '@babylon/db';
import type { NextRequest } from 'next/server';

/**
 * GET /api/admin/permissions
 * Returns the current user's admin role and permissions
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const admin = await requireAdmin(request);

  const { role, permissions } = await getAdminRole(admin.userId);

  return successResponse({
    userId: admin.userId,
    role,
    permissions,
    allPermissions: [...ADMIN_PERMISSIONS],
    rolePermissions: ROLE_PERMISSIONS,
    hasPermission: (permission: string) => permissions.includes(permission as typeof permissions[number]),
  });
});
