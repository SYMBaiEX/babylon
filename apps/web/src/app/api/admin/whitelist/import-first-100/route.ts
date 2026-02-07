/**
 * Admin Whitelist Import First 100 API
 *
 * @route POST /api/admin/whitelist/import-first-100 - Import users from NftSnapshot
 * @access Admin
 */

import { requireAdmin, successResponse, withErrorHandling } from '@babylon/api';
import { importFirst100FromSnapshot } from '@babylon/api/services/whitelist-service';
import type { NextRequest } from 'next/server';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const admin = await requireAdmin(request);

  const result = await importFirst100FromSnapshot(admin.dbUserId ?? undefined);

  return successResponse({
    success: true,
    imported: result.imported,
    skipped: result.skipped,
    total: result.total,
  });
});
