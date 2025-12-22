// GET /api/admin/roles - List admins
// POST /api/admin/roles - Grant/revoke roles (SUPER_ADMIN only)

import {
  getAllAdmins,
  requireAdmin,
  requireSuperAdmin,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import {
  ADMIN_ROLES,
  type AdminPermission,
  type AdminRoleType,
  adminRoles,
  db,
  eq,
  generateSnowflakeId,
  ROLE_PERMISSIONS,
  users,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

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
    return successResponse({ error: 'userId and action are required' }, 400);
  }

  if (action !== 'grant' && action !== 'revoke') {
    return successResponse({ error: 'action must be grant or revoke' }, 400);
  }

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
    if (!role || !ADMIN_ROLES.includes(role)) {
      return successResponse(
        {
          error: `Valid role is required. Must be one of: ${ADMIN_ROLES.join(', ')}`,
        },
        400
      );
    }

    const finalPermissions = permissions || ROLE_PERMISSIONS[role];

    const [existingRole] = await db
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.userId, userId))
      .limit(1);

    if (existingRole) {
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
        { targetUserId: userId, role, updatedBy: admin.userId },
        'POST /api/admin/roles'
      );
    } else {
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
        { targetUserId: userId, role, grantedBy: admin.userId },
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

  const [existingRole] = await db
    .select()
    .from(adminRoles)
    .where(eq(adminRoles.userId, userId))
    .limit(1);

  if (!existingRole) {
    return successResponse({ error: 'User does not have an admin role' }, 400);
  }

  if (admin.userId === userId) {
    return successResponse({ error: 'Cannot revoke your own admin role' }, 400);
  }

  await db
    .update(adminRoles)
    .set({ revokedAt: new Date() })
    .where(eq(adminRoles.userId, userId));

  await db.update(users).set({ isAdmin: false }).where(eq(users.id, userId));

  logger.info(
    'Admin role revoked',
    { targetUserId: userId, revokedBy: admin.userId },
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
