import { describe, expect, test } from 'bun:test'

import { calculateReputationScore } from '../reputation-service'

describe('calculateReputationScore', () => {
  test('mixes win rate and pnl', () => {
    const scoreLowWin = calculateReputationScore(0.5, 50, 10, 0.1, 50)
    const scoreHighWin = calculateReputationScore(0.5, 50, 10, 0.9, 50)
    expect(scoreHighWin).toBeGreaterThan(scoreLowWin)
  })

  test('boosts intel average', () => {
    const baseScore = calculateReputationScore(0.5, 50, 10, 0.5, 40)
    const intelScore = calculateReputationScore(0.5, 50, 10, 0.5, 90)
    expect(intelScore).toBeGreaterThan(baseScore)
  })

  test('caps between 0 and 100', () => {
    const maxScore = calculateReputationScore(1.5, 120, 200, 2, 200)
    const minScore = calculateReputationScore(-1, -50, 0, 0, -50)
    expect(maxScore).toBeLessThanOrEqual(100)
    expect(minScore).toBeGreaterThanOrEqual(0)
  })
})
