/**
 * RULER Scoring Service Tests
 * 
 * Tests the core RULER scoring logic with real LLM calls.
 * These are integration tests that verify the actual scoring works.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { rulerScoringService } from '../RulerScoringService';
import { prisma } from '@/lib/prisma';
import { trajectoryRecorder } from '../TrajectoryRecorder';
import { generateSnowflakeId } from '@/lib/snowflake';

describe('RulerScoringService', () => {
  let testAgentId: string;
  let testTrajectoryIds: string[] = [];

  beforeAll(async () => {
    // Create test agent
    const testAgent = await prisma.user.findFirst({
      where: { username: 'ruler-test-agent' }
    });

    if (testAgent) {
      testAgentId = testAgent.id;
    } else {
      const newAgent = await prisma.user.create({
        data: {
          id: await generateSnowflakeId(),
          username: 'ruler-test-agent',
          displayName: 'RULER Test Agent',
          isAgent: true,
          isTest: true,
          agentSystem: 'You are a trading agent.',
          agentModelTier: 'pro',
          virtualBalance: 10000,
          updatedAt: new Date(),
        }
      });
      testAgentId = newAgent.id;
    }
  });

  afterAll(async () => {
    // Clean up test trajectories
    if (testTrajectoryIds.length > 0) {
      await prisma.trajectory.deleteMany({
        where: { trajectoryId: { in: testTrajectoryIds } }
      });
    }
    await prisma.$disconnect();
  });

  it('should group trajectories by scenarioId', async () => {
    const scenarioId = `test-scenario-${Date.now()}`;
    const windowId = new Date().toISOString().slice(0, 13) + ':00';

    // Create 3 trajectories in same scenario
    for (let i = 0; i < 3; i++) {
      const trajId = await trajectoryRecorder.startTrajectory({
        agentId: testAgentId,
        scenarioId,
        windowId
      });
      testTrajectoryIds.push(trajId);

      trajectoryRecorder.startStep(trajId, {
        agentBalance: 1000,
        agentPnL: i * 100,
        openPositions: 0,
        activeMarkets: 10
      });

      trajectoryRecorder.completeStep(trajId, {
        actionType: 'HOLD',
        parameters: {},
        success: true
      }, 0);

      await trajectoryRecorder.endTrajectory(trajId, {
        finalPnL: i * 100,
        finalBalance: 1000 + i * 100
      });
    }

    // Score them
    const scored = await rulerScoringService.scoreTrajectories(testTrajectoryIds);

    expect(scored).toBe(3);

    // Verify scores were assigned
    const scoredTrajs = await prisma.trajectory.findMany({
      where: { trajectoryId: { in: testTrajectoryIds } }
    });

    for (const traj of scoredTrajs) {
      expect(traj.aiJudgeReward).not.toBeNull();
      expect(traj.aiJudgeReward).toBeGreaterThanOrEqual(0);
      expect(traj.aiJudgeReward).toBeLessThanOrEqual(1);
      expect(traj.aiJudgeReasoning).not.toBeNull();
    }
  });

  it('should handle empty trajectory list', async () => {
    const scored = await rulerScoringService.scoreTrajectories([]);
    expect(scored).toBe(0);
  });

  it('should skip already scored trajectories', async () => {
    const scenarioId = `test-scenario-skip-${Date.now()}`;
    const windowId = new Date().toISOString().slice(0, 13) + ':00';

    const trajId = await trajectoryRecorder.startTrajectory({
      agentId: testAgentId,
      scenarioId,
      windowId
    });
    testTrajectoryIds.push(trajId);

    trajectoryRecorder.startStep(trajId, {
      agentBalance: 1000,
      agentPnL: 0,
      openPositions: 0
    });

    trajectoryRecorder.completeStep(trajId, {
      actionType: 'HOLD',
      parameters: {},
      success: true
    }, 0);

    await trajectoryRecorder.endTrajectory(trajId, {
      finalPnL: 0,
      finalBalance: 1000
    });

    // Score once
    const firstScore = await rulerScoringService.scoreTrajectories([trajId]);
    expect(firstScore).toBeGreaterThanOrEqual(0);

    // Try to score again (should skip)
    const secondScore = await rulerScoringService.scoreTrajectories([trajId]);
    expect(secondScore).toBe(0);
  });
});

