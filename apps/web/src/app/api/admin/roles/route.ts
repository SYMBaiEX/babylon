/**
 * Admin Roles Management API
 *
 * @route GET /api/admin/roles - List all admins with their roles
 * @route POST /api/admin/roles - Grant or revoke admin roles (SUPER_ADMIN only)
 * @access Admin (GET), Super Admin (POST)
 */

import {
  getAllAdmins,
  requireAdmin,
  requireSuperAdmin,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import {
  adminRoles,
  type AdminPermission,
  type AdminRoleType,
  db,
  eq,
  generateSnowflakeId,
  ROLE_PERMISSIONS,
  users,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

/**
 * GET /api/admin/roles
 * Returns list of all admins with their roles
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request);

  const admins = await getAllAdmins();

  return successResponse({
    admins: admins.map((admin) => ({
      userId: admin.userId,
      username: admin.username,
      displayName: admin.displayName,
      profileImageUrl: admin.profileImageUrl,
      role: admin.role,
      permissions: admin.permissions,
      grantedAt: admin.grantedAt.toISOString(),
      grantedBy: admin.grantedBy,
    })),
    total: admins.length,
  });
});

/**
 * POST /api/admin/roles
 * Grant or revoke admin roles
 *
 * Body:
 * - userId: string (required)
 * - action: 'grant' | 'revoke' (required)
 * - role: 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER' (required for grant)
 * - permissions: string[] (optional, for custom permissions)
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const admin = await requireSuperAdmin(request);

  const body = await request.json();
  const { userId, action, role, permissions } = body as {
    userId: string;
    action: 'grant' | 'revoke';
    role?: AdminRoleType;
    permissions?: AdminPermission[];
  };

  if (!userId || !action) {
    return successResponse(
      { error: 'userId and action are required' },
      400
    );
  }

  if (action !== 'grant' && action !== 'revoke') {
    return successResponse(
      { error: 'action must be grant or revoke' },
      400
    );
  }

  // Check if target user exists
  const [targetUser] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!targetUser) {
    return successResponse({ error: 'User not found' }, 404);
  }

  if (action === 'grant') {
    if (!role || !['SUPER_ADMIN', 'ADMIN', 'VIEWER'].includes(role)) {
      return successResponse(
        { error: 'Valid role is required for grant action' },
        400
      );
    }

    // Use custom permissions or default role permissions
    const finalPermissions = permissions || ROLE_PERMISSIONS[role];

    // Check if user already has a role
    const [existingRole] = await db
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.userId, userId))
      .limit(1);

    if (existingRole) {
      // Update existing role
      await db
        .update(adminRoles)
        .set({
          role,
          permissions: finalPermissions,
          grantedBy: admin.userId,
          grantedAt: new Date(),
          revokedAt: null,
        })
        .where(eq(adminRoles.userId, userId));

      logger.info(
        'Admin role updated',
        {
          targetUserId: userId,
          role,
          updatedBy: admin.userId,
        },
        'POST /api/admin/roles'
      );
    } else {
      // Create new role
      await db.insert(adminRoles).values({
        id: `admin_role_${generateSnowflakeId()}`,
        userId,
        role,
        permissions: finalPermissions,
        grantedBy: admin.userId,
        grantedAt: new Date(),
      });

      logger.info(
        'Admin role granted',
        {
          targetUserId: userId,
          role,
          grantedBy: admin.userId,
        },
        'POST /api/admin/roles'
      );
    }

    return successResponse({
      success: true,
      message: `${role} role granted to user`,
      user: {
        userId,
        username: targetUser.username,
        displayName: targetUser.displayName,
        role,
        permissions: finalPermissions,
      },
    });
  }
  // Revoke action
  // Check if user has an admin role
  const [existingRole] = await db
    .select()
    .from(adminRoles)
    .where(eq(adminRoles.userId, userId))
    .limit(1);

  if (!existingRole) {
    return successResponse(
      { error: 'User does not have an admin role' },
      400
    );
  }

  // Prevent self-revocation of SUPER_ADMIN
  if (admin.userId === userId) {
    return successResponse(
      { error: 'Cannot revoke your own admin role' },
      400
    );
  }

  // Mark as revoked
  await db
    .update(adminRoles)
    .set({ revokedAt: new Date() })
    .where(eq(adminRoles.userId, userId));

  // Also update the legacy isAdmin flag for backward compatibility
  await db.update(users).set({ isAdmin: false }).where(eq(users.id, userId));

  logger.info(
    'Admin role revoked',
    {
      targetUserId: userId,
      revokedBy: admin.userId,
    },
    'POST /api/admin/roles'
  );

  return successResponse({
    success: true,
    message: 'Admin role revoked',
    user: {
      userId,
      username: targetUser.username,
      displayName: targetUser.displayName,
    },
  });
});
