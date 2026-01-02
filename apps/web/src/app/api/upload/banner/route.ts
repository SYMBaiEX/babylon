/**
 * Banner Upload API
 *
 * @description Handles banner/cover image uploads for agent and user profiles.
 *
 * @route POST /api/upload/banner
 * @access Authenticated
 */

import {
  authenticate,
  checkRateLimitAndDuplicates,
  getStorageClient,
  RATE_LIMIT_CONFIGS,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db, eq, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const MAX_BANNER_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * POST /api/upload/banner
 * Upload banner image for user or agent profile
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  // Rate limiting
  const rateLimitError = checkRateLimitAndDuplicates(
    user.userId,
    null,
    RATE_LIMIT_CONFIGS.UPLOAD_IMAGE
  );
  if (rateLimitError) {
    return rateLimitError;
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const targetId = formData.get('targetId') as string; // user or agent ID
  const targetType = (formData.get('targetType') as string) || 'user'; // 'user' or 'agent'

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_BANNER_SIZE) {
    return NextResponse.json(
      { error: `File too large. Max size: ${MAX_BANNER_SIZE / 1024 / 1024}MB` },
      { status: 400 }
    );
  }

  // Verify ownership
  const effectiveTargetId = targetId || user.userId;
  if (targetType === 'agent') {
    // Verify user owns/manages the agent
    const [agent] = await db
      .select({ managedBy: users.managedBy, isAgent: users.isAgent })
      .from(users)
      .where(eq(users.id, effectiveTargetId))
      .limit(1);

    if (!agent || !agent.isAgent || agent.managedBy !== user.userId) {
      return NextResponse.json(
        { error: 'You can only upload banners for your own agents' },
        { status: 403 }
      );
    }
  } else if (effectiveTargetId !== user.userId) {
    return NextResponse.json(
      { error: 'You can only upload banners for your own profile' },
      { status: 403 }
    );
  }

  // Upload to storage
  const storage = getStorageClient();
  const timestamp = Date.now();
  const extension = file.type.split('/')[1];
  const filename = `${effectiveTargetId}_${timestamp}.${extension}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const folder = targetType === 'agent' ? 'actor-banners' : 'user-banners';
  const result = await storage.uploadImage({
    file: buffer,
    filename,
    contentType: file.type,
    folder,
  });

  // Update database - both agents and users use the User table with coverImageUrl
  await db
    .update(users)
    .set({ coverImageUrl: result.url })
    .where(eq(users.id, effectiveTargetId));

  logger.info(
    `Banner uploaded for ${targetType}`,
    { targetId: effectiveTargetId, url: result.url },
    'BannerUpload'
  );

  return successResponse({
    url: result.url,
    filename,
    size: result.size,
  });
});
