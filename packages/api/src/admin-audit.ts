/**
 * Admin Audit Logger
 *
 * @description Logs admin actions for audit trail and debugging purposes.
 * All admin API operations should log their actions through this utility.
 */

import { logger } from '@babylon/shared';

export interface AdminAuditContext {
  /** Admin user ID performing the action */
  adminId: string;
  /** IP address of the request (if available) */
  ipAddress?: string;
  /** Target resource type (e.g., 'group', 'user', 'message') */
  resourceType: string;
  /** Target resource ID */
  resourceId?: string;
  /** Additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * Log an admin action for audit purposes
 */
export function logAdminAction(
  action: string,
  context: AdminAuditContext
): void {
  logger.info(
    `[ADMIN_AUDIT] ${action}`,
    {
      action,
      adminId: context.adminId,
      ipAddress: context.ipAddress,
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      ...context.metadata,
      timestamp: new Date().toISOString(),
    },
    'AdminAudit'
  );
}

/**
 * Log admin viewing/reading a resource
 */
export function logAdminView(context: AdminAuditContext): void {
  logAdminAction('VIEW', context);
}

/**
 * Log admin modifying a resource
 */
export function logAdminModify(context: AdminAuditContext): void {
  logAdminAction('MODIFY', context);
}

/**
 * Log admin deleting a resource
 */
export function logAdminDelete(context: AdminAuditContext): void {
  logAdminAction('DELETE', context);
}

// Re-export getClientIp from utils for convenience
export { getClientIp } from './utils';
