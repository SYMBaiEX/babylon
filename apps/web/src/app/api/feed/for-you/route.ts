import {
  addPublicReadHeaders,
  publicRateLimit,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import type { NextRequest } from 'next/server';
import { buildForYouFeed } from './pipeline';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const {
    error: rateLimitError,
    user,
    rateLimitInfo,
  } = await publicRateLimit(request, 'read');
  if (rateLimitError) {
    return rateLimitError;
  }

  const payload = await buildForYouFeed(user?.userId ?? null);

  const response = successResponse({
    success: true,
    stories: payload.stories,
    generatedAt: payload.generatedAt,
  });

  if (rateLimitInfo) {
    if (user?.userId) {
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('X-RateLimit-Limit', rateLimitInfo.limit.toString());
      response.headers.set(
        'X-RateLimit-Remaining',
        rateLimitInfo.remaining.toString()
      );
      response.headers.set(
        'X-RateLimit-Reset',
        rateLimitInfo.resetAt.toISOString()
      );
    } else {
      addPublicReadHeaders(response, rateLimitInfo);
    }
  }

  return response;
});
