import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { NextRequest } from 'next/server';

const insertMock = mock(() => ({
  values: mock(() => Promise.resolve()),
}));
const generateSnowflakeIdMock = mock(() => Promise.resolve('evt-1'));

mock.module('@babylon/api', () => ({
  addPublicReadHeaders: () => {},
  authenticate: () =>
    Promise.resolve({
      userId: 'privy-user-1',
      walletAddress: '0x1234567890abcdef',
    }),
  ensureUserForAuth: () =>
    Promise.resolve({
      user: { id: 'user-1' },
    }),
  publicRateLimit: () =>
    Promise.resolve({
      error: null,
      user: null,
      rateLimitInfo: null,
    }),
  successResponse: (data: unknown) =>
    new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    }),
  withErrorHandling: (handler: (request: NextRequest) => Promise<Response>) =>
    handler,
}));

mock.module('@babylon/db', () => ({
  db: {
    insert: insertMock,
  },
  feedEvents: { _table: 'FeedEvent' },
}));

mock.module('@babylon/shared', () => ({
  generateSnowflakeId: generateSnowflakeIdMock,
}));

const { POST } = await import('./route');

beforeEach(() => {
  insertMock.mockClear();
  generateSnowflakeIdMock.mockClear();
});

describe('POST /api/feed/events', () => {
  it('accepts and stores a batch of feed events', async () => {
    const request = {
      json: () =>
        Promise.resolve({
          events: [
            {
              actionType: 'impression',
              surface: 'for_you',
              itemId: 'post-1',
              itemType: 'post',
              clusterId: 'cluster-1',
              topicKey: 'openai',
              authorId: 'author-1',
              feedPosition: 0,
            },
            {
              actionType: 'trade_after_view',
              surface: 'for_you',
              itemId: 'market-1',
              itemType: 'market',
              clusterId: 'market-1',
              marketId: 'market-1',
              topicKey: 'openai',
              feedPosition: 1,
              dwellMs: 2500,
            },
          ],
        }),
    } as unknown as NextRequest;

    const response = await POST(request);
    const payload = await response.json();

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(generateSnowflakeIdMock).toHaveBeenCalledTimes(2);
    expect(payload.success).toBe(true);
    expect(payload.accepted).toBe(2);
  });
});
