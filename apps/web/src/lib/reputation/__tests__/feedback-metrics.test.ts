import { beforeEach, describe, expect, mock, test } from 'bun:test';

import { db, } from '@/db';
import { updateFeedbackMetrics } from '../reputation-service';

const baseMetrics = {
  id: 'test-id',
  userId: 'agent',
  totalFeedbackCount: 1,
  averageFeedbackScore: 60,
  intelFeedbackCount: 1,
  averageIntelScore: 60,
  positiveCount: 1,
  neutralCount: 0,
  negativeCount: 0,
  totalInteractions: 1,
  firstActivityAt: null as Date | null,
  updatedAt: new Date(),
};

// Mock the Drizzle query chain
const findFirstMock = mock(async () => ({ ...baseMetrics }));
const _updateSetMock = mock();
const updateWhereMock = mock(async () => [{}]);

// Create a mock query object
const mockQueryMetrics = {
  findFirst: findFirstMock,
};

// Create a mock update function that returns chain
const _mockUpdate = mock(() => ({
  set: mock(() => ({
    where: updateWhereMock,
  })),
}));

// Store captured update data for assertions
let capturedUpdateData: Record<string, number | Date | null> | null = null;

beforeEach(() => {
  findFirstMock.mockClear();
  updateWhereMock.mockClear();
  capturedUpdateData = null;

  // Mock the query.agentPerformanceMetrics
  // @ts-expect-error - overriding for tests
  db.query = {
    agentPerformanceMetrics: mockQueryMetrics,
  };

  // Mock db.update to capture the data being set
  // @ts-expect-error - overriding for tests
  db.update = mock(() => ({
    set: mock((data: Record<string, number | Date | null>) => {
      capturedUpdateData = data;
      return {
        where: mock(async () => [{}]),
      };
    }),
  }));
});

describe('updateFeedbackMetrics', () => {
  test('updates intel averages when category=intel', async () => {
    await updateFeedbackMetrics('agent', 90, { category: 'intel' });
    expect(capturedUpdateData).not.toBeNull();
    expect(capturedUpdateData?.intelFeedbackCount).toBeGreaterThan(1);
    expect(capturedUpdateData?.averageIntelScore).toBeGreaterThan(60);
  });

  test('leaves intel averages untouched when not intel', async () => {
    await updateFeedbackMetrics('agent', 20, { category: 'general' });
    expect(capturedUpdateData).not.toBeNull();
    expect(capturedUpdateData?.intelFeedbackCount).toBe(1);
    expect(capturedUpdateData?.averageIntelScore).toBe(60);
  });
});
