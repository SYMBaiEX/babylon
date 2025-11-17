import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { prisma } from '@/lib/prisma'
import { updateFeedbackMetrics } from '../reputation-service'

const baseMetrics = {
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
}

const findUniqueMock = mock<typeof prisma.agentPerformanceMetrics.findUnique>(
  async () => ({ ...baseMetrics })
)

const updateMock = mock<typeof prisma.agentPerformanceMetrics.update>(async () => ({}))

beforeEach(() => {
  findUniqueMock.mockClear()
  updateMock.mockClear()
  // @ts-expect-error - overriding for tests
  prisma.agentPerformanceMetrics.findUnique = findUniqueMock
  // @ts-expect-error - overriding for tests
  prisma.agentPerformanceMetrics.update = updateMock
})

describe('updateFeedbackMetrics', () => {
  test('updates intel averages when category=intel', async () => {
    await updateFeedbackMetrics('agent', 90, { category: 'intel' })
    const call = updateMock.mock.calls[0]?.[0]
    expect(call?.data.intelFeedbackCount).toBeGreaterThan(1)
    expect(call?.data.averageIntelScore).toBeGreaterThan(60)
  })

  test('leaves intel averages untouched when not intel', async () => {
    await updateFeedbackMetrics('agent', 20, { category: 'general' })
    const call = updateMock.mock.calls[0]?.[0]
    expect(call?.data.intelFeedbackCount).toBe(1)
    expect(call?.data.averageIntelScore).toBe(60)
  })
})
