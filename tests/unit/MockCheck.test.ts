
import { describe, test, expect, mock } from 'bun:test';

const mockPrisma = {
  user: {
    count: mock(() => Promise.resolve(42))
  }
};

mock.module('@/lib/prisma', () => ({
  prisma: mockPrisma
}));

import { prisma } from '@/lib/prisma';

describe('Mock Module Check', () => {
  test('should use mocked prisma', async () => {
    expect(await prisma.user.count()).toBe(42);
    expect(mockPrisma.user.count).toHaveBeenCalled();
  });
});

