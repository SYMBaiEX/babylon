import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { NextRequest } from 'next/server';

const mockBuildForYouFeed = mock();
const mockPublicRateLimit = mock();

mock.module('@babylon/api', () => ({
  addPublicReadHeaders: (response: Response, rateLimitInfo: { limit: number }) => {
    response.headers.set('Cache-Control', 'public, max-age=30');
    response.headers.set('X-RateLimit-Limit', String(rateLimitInfo.limit));
  },
  publicRateLimit: mockPublicRateLimit,
  successResponse: (data: unknown) =>
    new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    }),
  withErrorHandling: (handler: (request: NextRequest) => Promise<Response>) =>
    handler,
}));

mock.module('./pipeline', () => ({
  buildForYouFeed: mockBuildForYouFeed,
}));

const { GET } = await import('./route');

const makeRequest = (): NextRequest =>
  ({
    url: 'https://babylon.social/api/feed/for-you',
    headers: { get: () => null },
  }) as unknown as NextRequest;

beforeEach(() => {
  mockBuildForYouFeed.mockReset();
  mockPublicRateLimit.mockReset();
});

describe('GET /api/feed/for-you', () => {
  it('returns a private personalized response for authenticated users', async () => {
    mockPublicRateLimit.mockResolvedValue({
      error: null,
      user: { userId: 'user-1' },
      rateLimitInfo: {
        limit: 60,
        remaining: 59,
        resetAt: new Date('2026-03-08T12:00:00.000Z'),
      },
    });
    mockBuildForYouFeed.mockResolvedValue({
      generatedAt: '2026-03-08T11:55:00.000Z',
      stories: [{ storyKey: 'story-1', posts: [] }],
    });

    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(mockBuildForYouFeed).toHaveBeenCalledWith('user-1');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(payload.generatedAt).toBe('2026-03-08T11:55:00.000Z');
    expect(payload.stories).toHaveLength(1);
  });

  it('returns a public response for anonymous users', async () => {
    mockPublicRateLimit.mockResolvedValue({
      error: null,
      user: null,
      rateLimitInfo: {
        limit: 100,
        remaining: 99,
        resetAt: new Date('2026-03-08T12:00:00.000Z'),
      },
    });
    mockBuildForYouFeed.mockResolvedValue({
      generatedAt: '2026-03-08T11:55:00.000Z',
      stories: [],
    });

    const response = await GET(makeRequest());

    expect(mockBuildForYouFeed).toHaveBeenCalledWith(null);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=30');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
  });
});
