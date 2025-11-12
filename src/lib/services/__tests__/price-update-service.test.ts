import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PriceUpdateService } from '../price-update-service';

const mockFindUnique = vi.fn();
const mockUpdateOrg = vi.fn();
const mockRecordPriceUpdate = vi.fn();
const mockBroadcast = vi.fn();
const mockUpdatePositions = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: mockFindUnique,
      update: mockUpdateOrg,
    },
  },
}));

vi.mock('@/lib/database-service', () => ({
  db: {
    recordPriceUpdate: mockRecordPriceUpdate,
  },
}));

vi.mock('@/lib/sse/event-broadcaster', () => ({
  broadcastToChannel: mockBroadcast,
}));

vi.mock('@/lib/perps-service', () => ({
  getReadyPerpsEngine: vi.fn().mockResolvedValue({
    updatePositions: mockUpdatePositions,
  }),
}));

describe('PriceUpdateService.applyUpdates', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdateOrg.mockReset();
    mockRecordPriceUpdate.mockReset();
    mockBroadcast.mockReset();
    mockUpdatePositions.mockReset();
  });

  it('persists price update and notifies engine/SSE', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'org-1', currentPrice: 100 });

    const updates = await PriceUpdateService.applyUpdates([
      {
        organizationId: 'org-1',
        newPrice: 105,
        source: 'system',
        reason: 'test',
      },
    ]);

    expect(mockUpdateOrg).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { currentPrice: 105 },
    });
    expect(mockRecordPriceUpdate).toHaveBeenCalledWith('org-1', 105, 5, 5);
    expect(mockUpdatePositions).toHaveBeenCalledWith(new Map([['org-1', 105]]));
    expect(mockBroadcast).toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(updates[0]?.organizationId).toBe('org-1');
  });

  it('skips updates with invalid price', async () => {
    const result = await PriceUpdateService.applyUpdates([
      {
        organizationId: 'org-1',
        newPrice: -10,
        source: 'system',
      },
    ]);

    expect(result).toHaveLength(0);
    expect(mockUpdateOrg).not.toHaveBeenCalled();
    expect(mockUpdatePositions).not.toHaveBeenCalled();
  });
});
