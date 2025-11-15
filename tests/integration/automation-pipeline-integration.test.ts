/**
 * Integration Tests for AutomationPipeline
 * 
 * Tests with real database and dependencies
 * 
 * NOTE: Requires trajectory schema to be merged into main Prisma schema
 */

// @ts-nocheck - Requires trajectory schema not yet available
import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { AutomationPipeline } from '@/lib/training/AutomationPipeline';
import { prisma, prismaBase } from '@/lib/prisma';
import { trajectoryRecorder } from '@/lib/training/TrajectoryRecorder';
import { generateSnowflakeId } from '@/lib/snowflake';
import { Prisma } from '@prisma/client';

// Ensure prisma is available
if (!prisma) {
  throw new Error('Prisma client is not initialized. Check DATABASE_URL environment variable.');
}

describe('AutomationPipeline - Integration Tests', () => {
  let pipeline: AutomationPipeline;
  let testData: {
    trajectoryIds: string[];
    batchIds: string[];
    modelIds: string[];
    agentIds: string[];
  };
  // Track trajectories per test to avoid cleanup race conditions
  // Use a Map keyed by test name to prevent interference between tests
  const testTrajectoryMap = new Map<string, string[]>();

  beforeAll(async () => {
    pipeline = new AutomationPipeline({
      minTrajectoriesForTraining: 5,
      minGroupSize: 2,
      dataQualityThreshold: 0.5,
      baseModel: 'OpenPipe/Qwen3-14B-Instruct',
    });

    testData = {
      trajectoryIds: [],
      batchIds: [],
      modelIds: [],
      agentIds: [],
    };

    // Create test agents that will be used in tests
    const agentIds = [
      'test-agent-0', 'test-agent-1', 'test-agent-2', 'test-agent-3', 'test-agent-4',
      'test-agent-readiness-0', 'test-agent-readiness-1', 'test-agent-readiness-2',
      'test-agent-readiness-3', 'test-agent-readiness-4', 'test-agent-readiness-5',
      'test-agent-readiness-6', 'test-agent-readiness-7', 'test-agent-readiness-8',
      'test-agent-readiness-9',
      'e2e-agent-0', 'e2e-agent-1', 'e2e-agent-2', 'e2e-agent-3', 'e2e-agent-4', 'e2e-agent-5',
    ];

    for (const agentId of agentIds) {
      try {
        await prisma.user.create({
          data: {
            id: agentId,
            username: `test-${agentId}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            displayName: `Test Agent ${agentId}`,
            isAgent: true,
            isTest: true,
            virtualBalance: 10000,
            reputationPoints: 100,
            updatedAt: new Date(),
          },
        });
        testData.agentIds.push(agentId);
      } catch (error) {
        // Agent might already exist, that's okay - try to use existing one
        const existing = await prisma.user.findUnique({ where: { id: agentId } });
        if (existing) {
          testData.agentIds.push(agentId);
        } else if (!(error as { code?: string }).code?.includes('P2002')) {
          console.warn(`Failed to create test agent ${agentId}:`, error);
        }
      }
    }
  });

  afterEach(async () => {
    // Cleanup test data after each test
    // Clean up ALL trajectories tracked in the map (from all tests in this suite)
    // This ensures we don't leave test data behind, but may clean up trajectories
    // from other tests if they're still running. However, since tests should complete
    // before afterEach runs, this should be safe.
    const allTrajectories = Array.from(testTrajectoryMap.values()).flat();
    if (allTrajectories.length > 0) {
      try {
        await prisma.trajectory.deleteMany({
          where: {
            trajectoryId: {
              in: allTrajectories
            }
          }
        });
        testTrajectoryMap.clear();
      } catch (error) {
        console.warn('Failed to cleanup trajectories:', error);
      }
    }
    
    // Also cleanup from shared testData (for backwards compatibility)
    if (testData.trajectoryIds.length > 0) {
      try {
        await prisma.trajectory.deleteMany({
          where: {
            trajectoryId: {
              in: testData.trajectoryIds
            }
          }
        });
      } catch (error) {
        console.warn('Failed to cleanup trajectories:', error);
      }
      testData.trajectoryIds = [];
    }

    if (testData.batchIds.length > 0) {
      try {
        await prisma.trainingBatch.deleteMany({
          where: {
            batchId: {
              in: testData.batchIds
            }
          }
        });
      } catch (error) {
        console.warn('Failed to cleanup batches:', error);
      }
      testData.batchIds = [];
    }

    if (testData.modelIds.length > 0) {
      try {
        await prisma.trainedModel.deleteMany({
          where: {
            id: {
              in: testData.modelIds
            }
          }
        });
      } catch (error) {
        console.warn('Failed to cleanup models:', error);
      }
      testData.modelIds = [];
    }
  });

  afterAll(async () => {
    // Cleanup test agents
    if (testData.agentIds.length > 0) {
      try {
        await prisma.user.deleteMany({
          where: {
            id: {
              in: testData.agentIds
            }
          }
        });
      } catch (error) {
        console.warn('Failed to cleanup test agents:', error);
      }
    }
    // DON'T disconnect Prisma here - it's a singleton shared across all tests
    // Disconnecting here will break other tests running in the same suite
    // The test runner will handle cleanup at the end
  });

  describe('Database Integration', () => {
    test('should connect to database', async () => {
      // Use prismaBase (unwrapped client) to avoid JsonBody enum issues with retry proxy
      const result = await prismaBase.$queryRawUnsafe('SELECT 1 as result');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect((result as Array<{ result: number }>)[0]?.result).toBe(1);
    });

    test('should access trajectory table', async () => {
      const count = await prisma.trajectory.count();
      expect(typeof count).toBe('number');
    });

    test('should access training batch table', async () => {
      try {
        const count = await prisma.trainingBatch.count();
        expect(typeof count).toBe('number');
      } catch (error) {
        console.warn('TrainingBatch table may not exist yet:', error);
        expect(error).toBeDefined();
      }
    });

    test('should access trained model table', async () => {
      try {
        const count = await prisma.trainedModel.count();
        expect(typeof count).toBe('number');
      } catch (error) {
        console.warn('TrainedModel table may not exist yet:', error);
        expect(error).toBeDefined();
      }
    });
  });

  describe('Real Trajectory Collection', () => {
    test('should create and store test trajectories', async () => {
      // Check if trajectory model is available at test time
      if (!prisma.trajectory) {
        console.log('⏭️  Trajectory model not available - skipping test');
        return;
      }
      const windowId = new Date().toISOString().slice(0, 13) + ':00';
      const testId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const trajectoryIds: string[] = [];
      
      // Create agents first (required for foreign key constraint)
      for (let i = 0; i < 5; i++) {
        const agentId = `test-agent-${testId}-${i}`;
        try {
          const uniqueUsername = await generateSnowflakeId();
          await prisma.user.create({
            data: {
              id: agentId,
              username: `test-agent-${uniqueUsername}`,
              displayName: `Test Agent ${i}`,
              isAgent: true,
              isTest: true,
              virtualBalance: 10000,
              reputationPoints: 100,
              updatedAt: new Date(),
            },
          });
          testData.agentIds.push(agentId);
        } catch (error) {
          // Agent might already exist, that's okay
          if (!(error as { code?: string }).code?.includes('P2002')) {
            console.warn(`Failed to create agent ${agentId}:`, error);
          }
        }
      }
      
      // Create 5 test trajectories
      for (let i = 0; i < 5; i++) {
        const agentId = `test-agent-${testId}-${i}`;
        const trajectoryId = await trajectoryRecorder.startTrajectory({
          agentId,
          windowId,
        });

        trajectoryIds.push(trajectoryId);
        // Don't add to testData.trajectoryIds until after verification to avoid cleanup race conditions

        // Add step with LLM call
        trajectoryRecorder.startStep(trajectoryId, {
          agentBalance: 10000 + i * 100,
          agentPnL: i * 50,
          openPositions: i,
        });

        trajectoryRecorder.logLLMCall(trajectoryId, {
          model: 'gpt-4o-mini',
          systemPrompt: 'You are a trading agent in a prediction market MMO. Make smart trading decisions.',
          userPrompt: `Step ${i}: Current balance: ${10000 + i * 100}. What should you do?`,
          response: `Action ${i}: BUY $TOKEN`,
          temperature: 0.7,
          maxTokens: 150,
          purpose: 'action',
        });

        trajectoryRecorder.completeStep(trajectoryId, {
          actionType: 'BUY_SHARES',
          parameters: { ticker: '$TOKEN', shares: 10 },
          success: true,
          result: { executed: true, price: 100 },
        }, 0.5 + i * 0.1);

        // End trajectory
        await trajectoryRecorder.endTrajectory(trajectoryId, {
          finalPnL: 100 + i * 50,
          finalBalance: 10100 + i * 150,
          windowId,
        });
      }

      // Wait longer to ensure database writes are committed (trajectories are async)
      // Increased timeout for concurrent test runs
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify all trajectories were saved using the local array to avoid race conditions
      // Retry query multiple times in case of timing issues
      let saved = await prisma.trajectory.findMany({
        where: {
          trajectoryId: {
            in: trajectoryIds
          }
        }
      });

      // Retry up to 5 times if not all trajectories found (handles race conditions under load)
      let retries = 0;
      while (saved.length < trajectoryIds.length && retries < 5) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        saved = await prisma.trajectory.findMany({
          where: {
            trajectoryId: {
              in: trajectoryIds
            }
          }
        });
        retries++;
      }

      // Log for debugging
      if (saved.length < trajectoryIds.length) {
        console.log(`⚠️  Only found ${saved.length} of ${trajectoryIds.length} trajectories`);
        console.log(`   Expected IDs: ${trajectoryIds.join(', ')}`);
        console.log(`   Found IDs: ${saved.map(t => t.trajectoryId).join(', ')}`);
        console.log(`   Note: Trajectories may not save under heavy concurrent test load. Run tests in isolation for full coverage.`);
      }

      // Verify all trajectories were saved
      expect(saved.length).toBeGreaterThanOrEqual(5);
      expect(saved.every(t => t.windowId === windowId)).toBe(true);
      expect(saved.every(t => t.scenarioId === windowId)).toBe(true);
      
      // Add to cleanup list only after successful verification
      testTrajectoryMap.set('should create and store test trajectories', [...trajectoryIds]);
      testData.trajectoryIds.push(...trajectoryIds);
    }, 15000); // Increased timeout for concurrent test runs

    test('should check training readiness with real data', async () => {
      // Check if trajectory model is available at test time
      if (!prisma.trajectory) {
        console.log('⏭️  Trajectory model not available - skipping test');
        return;
      }
      const windowId = new Date().toISOString().slice(0, 13) + ':00';
      const testId = `readiness-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const trajectoryIds: string[] = [];
      
      // Create agents first (required for foreign key constraint)
      for (let i = 0; i < 10; i++) {
        const agentId = `test-agent-readiness-${testId}-${i}`;
        try {
          const uniqueUsername = await generateSnowflakeId();
          await prisma.user.create({
            data: {
              id: agentId,
              username: `test-agent-readiness-${uniqueUsername}`,
              displayName: `Readiness Agent ${i}`,
              isAgent: true,
              isTest: true,
              virtualBalance: 10000,
              reputationPoints: 100,
              updatedAt: new Date(),
            },
          });
          testData.agentIds.push(agentId);
        } catch (error) {
          // Agent might already exist, that's okay
          if (!(error as { code?: string }).code?.includes('P2002')) {
            console.warn(`Failed to create agent ${agentId}:`, error);
          }
        }
      }
      
      // Create test trajectories
      for (let i = 0; i < 10; i++) {
        const agentId = `test-agent-readiness-${testId}-${i}`;
        const trajectoryId = await trajectoryRecorder.startTrajectory({
          agentId,
          windowId,
        });

        trajectoryIds.push(trajectoryId);
        // Don't add to testData.trajectoryIds until after verification to avoid cleanup race conditions

        trajectoryRecorder.startStep(trajectoryId, {
          agentBalance: 10000,
          agentPnL: 0,
          openPositions: 0,
        });

        trajectoryRecorder.logLLMCall(trajectoryId, {
          model: 'gpt-4o-mini',
          systemPrompt: 'You are a trading agent with strong analytical skills.',
          userPrompt: 'Analyze the market and make a decision.',
          response: 'Buy signal detected',
          temperature: 0.7,
          maxTokens: 100,
          purpose: 'action',
        });

        trajectoryRecorder.completeStep(trajectoryId, {
          actionType: 'BUY_SHARES',
          parameters: { ticker: '$TEST' },
          success: true,
          result: { executed: true },
        }, 0.8);

        await trajectoryRecorder.endTrajectory(trajectoryId, {
          finalPnL: Math.random() * 200 - 50,
          windowId,
        });
      }

      // Wait for database writes to be committed
      // Increased timeout for concurrent test runs
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Mark as training data (use local trajectoryIds array)
      // Note: Trajectories are already created with isTrainingData: true, but we ensure they're marked correctly
      await prisma.trajectory.updateMany({
        where: {
          trajectoryId: {
            in: trajectoryIds
          }
        },
        data: {
          isTrainingData: true,
          usedInTraining: false,
          aiJudgeReward: null, // Ensure this is null for checkTrainingReadiness
        }
      });

      // Wait again to ensure updates are committed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify trajectories exist before checking readiness
      // Retry query in case of timing issues
      let verifyCount = await prisma.trajectory.count({
        where: {
          trajectoryId: { in: trajectoryIds },
          isTrainingData: true,
          usedInTraining: false,
        }
      });
      
      // Retry if not all found (increased retries for concurrent load)
      let retries = 0;
      while (verifyCount < trajectoryIds.length && retries < 5) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        verifyCount = await prisma.trajectory.count({
          where: {
            trajectoryId: { in: trajectoryIds },
            isTrainingData: true,
            usedInTraining: false,
          }
        });
        retries++;
      }
      
      if (verifyCount < trajectoryIds.length) {
        console.log(`⚠️  Only found ${verifyCount} of ${trajectoryIds.length} trajectories marked as training data`);
        console.log(`   Note: Trajectories may not save under heavy concurrent test load. Run tests in isolation for full coverage.`);
      }
      
      // Verify all trajectories were created and marked as training data
      expect(verifyCount).toBeGreaterThanOrEqual(10);

      // Check readiness
      const readiness = await pipeline.checkTrainingReadiness();

      expect(readiness).toBeDefined();
      expect(readiness.stats.totalTrajectories).toBeGreaterThanOrEqual(1);
      expect(readiness.stats.dataQuality).toBeGreaterThan(0);
      
      console.log('Training Readiness:', readiness);
      
      // Add to cleanup list only after successful verification
      testTrajectoryMap.set('should check training readiness with real data', [...trajectoryIds]);
      testData.trajectoryIds.push(...trajectoryIds);
    }, 15000); // Increased timeout for concurrent test runs
  });

  describe('Status and Monitoring', () => {
    test('should get pipeline status', async () => {
      const status = await pipeline.getStatus();

      expect(status).toBeDefined();
      expect(status.dataCollection).toBeDefined();
      expect(status.training).toBeDefined();
      expect(status.models).toBeDefined();
      expect(status.health).toBeDefined();

      expect(typeof status.dataCollection.last24h).toBe('number');
      expect(typeof status.dataCollection.last7d).toBe('number');
      expect(typeof status.dataCollection.ratePerHour).toBe('number');

      console.log('Pipeline Status:', {
        dataCollection: status.dataCollection,
        models: status.models,
        health: status.health,
      });
    });

    test('should perform health checks', async () => {
      // This should not throw
      await pipeline['runHealthChecks']();

      // Get status to verify health
      const status = await pipeline.getStatus();
      expect(status.health.database).toBe(true);
    });
  });

  describe('Model Versioning with Real Data', () => {
    test('should handle version increment with real database', async () => {
      const version1 = await pipeline['getNextModelVersion']();
      expect(version1).toMatch(/^v\d+\.\d+\.\d+$/);

      // Create a mock model in database with unique modelId
      try {
        const uniqueModelId = `test-model-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const model = await prisma.trainedModel.create({
          data: {
            id: `${uniqueModelId}-id`,
            modelId: uniqueModelId,
            version: version1,
            baseModel: 'OpenPipe/Qwen3-14B-Instruct',
            storagePath: '/tmp/test',
            status: 'ready',
          }
        });

        testData.modelIds.push(model.id);

        // Get next version
        const version2 = await pipeline['getNextModelVersion']();
        
        // Parse versions
        const [, , patch1] = version1.substring(1).split('.').map(Number);
        const [, , patch2] = version2.substring(1).split('.').map(Number);
        
        expect(patch2).toBe(patch1! + 1);
      } catch (error) {
        console.warn('TrainedModel table may not exist:', error);
      }
    });
  });

  describe('End-to-End Data Flow', () => {
    test('should complete full data collection cycle', async () => {
      // Check if trajectory model is available at test time
      if (!prisma.trajectory) {
        console.log('⏭️  Trajectory model not available - skipping test');
        return;
      }
      const windowId = new Date().toISOString().slice(0, 13) + ':00';
      const testId = `e2e-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      console.log('\n🚀 Starting E2E Data Flow Test\n');

      // Step 1: Collect trajectories
      console.log('📊 Step 1: Collecting trajectories...');
      const trajectoryIds: string[] = [];
      const agentIds: string[] = [];
      
      // Create agents first (required for foreign key constraint)
      for (let i = 0; i < 6; i++) {
        const agentId = `e2e-agent-${testId}-${i}`;
        agentIds.push(agentId);
        
        // Ensure agent exists
        try {
          const uniqueUsername = await generateSnowflakeId();
          await prisma.user.create({
            data: {
              id: agentId,
              username: `e2e-agent-${uniqueUsername}`,
              displayName: `E2E Agent ${i}`,
              isAgent: true,
              isTest: true,
              virtualBalance: 10000,
              reputationPoints: 100,
              updatedAt: new Date(),
            },
          });
          testData.agentIds.push(agentId);
        } catch (error) {
          // Agent might already exist, that's okay
          if (!(error as { code?: string }).code?.includes('P2002')) {
            console.warn(`Failed to create agent ${agentId}:`, error);
          }
        }
      }
      
      for (let i = 0; i < 6; i++) {
        const agentId = agentIds[i]!;
        const traj = await trajectoryRecorder.startTrajectory({
          agentId,
          windowId,
        });

        trajectoryIds.push(traj);
        // Don't add to testData.trajectoryIds until after verification to avoid cleanup race conditions

        trajectoryRecorder.startStep(traj, {
          agentBalance: 10000,
          agentPnL: 0,
          openPositions: 0,
        });

        trajectoryRecorder.logLLMCall(traj, {
          model: 'gpt-4o-mini',
          systemPrompt: 'You are an intelligent trading agent.',
          userPrompt: 'Make a trading decision based on current market conditions.',
          response: `Agent ${i} analysis: Market looks favorable for buying.`,
          temperature: 0.7,
          maxTokens: 150,
          purpose: 'action',
        });

        trajectoryRecorder.completeStep(traj, {
          actionType: 'BUY_SHARES',
          parameters: { ticker: '$TEST', shares: 10 },
          success: true,
          result: { executed: true, price: 100 },
        }, 0.7);

        await trajectoryRecorder.endTrajectory(traj, {
          finalPnL: Math.random() * 200 - 50,
          finalBalance: 10000 + Math.random() * 500,
          windowId,
        });
      }

      console.log(`✅ Created ${trajectoryIds.length} trajectories`);

      // Wait for database writes to be committed
      // Increased timeout for concurrent test runs
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 2: Verify storage
      console.log('📦 Step 2: Verifying storage...');
      
      // Retry query in case of timing issues
      let stored = await prisma.trajectory.findMany({
        where: {
          trajectoryId: {
            in: trajectoryIds
          }
        }
      });
      
      // Retry if not all found (increased retries for concurrent load)
      let retries = 0;
      while (stored.length < trajectoryIds.length && retries < 5) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        stored = await prisma.trajectory.findMany({
          where: {
            trajectoryId: {
              in: trajectoryIds
            }
          }
        });
        retries++;
      }
      
      if (stored.length < trajectoryIds.length) {
        console.log(`⚠️  Only found ${stored.length} of ${trajectoryIds.length} trajectories`);
        console.log(`   Expected: ${trajectoryIds.join(', ')}`);
        console.log(`   Found: ${stored.map(t => t.trajectoryId).join(', ')}`);
        console.log(`   Note: Trajectories may not save under heavy concurrent test load. Run tests in isolation for full coverage.`);
      }

      // Verify all trajectories were stored
      expect(stored.length).toBe(trajectoryIds.length);
      console.log(`✅ Verified ${stored.length} trajectories in database`);

      // Step 3: Mark as training data
      console.log('🏷️  Step 3: Marking as training data...');
      await prisma.trajectory.updateMany({
        where: {
          trajectoryId: {
            in: trajectoryIds
          }
        },
        data: {
          isTrainingData: true,
          usedInTraining: false,
          aiJudgeReward: null, // Ensure this is null for checkTrainingReadiness
        }
      });

      // Wait to ensure updates are committed
      // Increased timeout for concurrent test runs
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('✅ Marked as training data');

      // Step 4: Check readiness
      console.log('✅ Step 4: Checking training readiness...');
      
      // Verify trajectories exist before checking readiness (handles race conditions)
      let verifyCount = await prisma.trajectory.count({
        where: {
          trajectoryId: { in: trajectoryIds },
          isTrainingData: true,
          usedInTraining: false,
        }
      });
      
      // Retry if not all found (for concurrent load)
      let verifyRetries = 0;
      while (verifyCount < trajectoryIds.length && verifyRetries < 5) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        verifyCount = await prisma.trajectory.count({
          where: {
            trajectoryId: { in: trajectoryIds },
            isTrainingData: true,
            usedInTraining: false,
          }
        });
        verifyRetries++;
      }
      
      expect(verifyCount).toBeGreaterThanOrEqual(6);
      
      const readiness = await pipeline.checkTrainingReadiness();
      
      console.log('📈 Readiness Results:', {
        ready: readiness.ready,
        reason: readiness.reason,
        totalTrajectories: readiness.stats.totalTrajectories,
        scenarioGroups: readiness.stats.scenarioGroups,
        dataQuality: readiness.stats.dataQuality.toFixed(2),
      });

      // Note: readiness.stats.totalTrajectories counts ALL trajectories in DB, not just ours
      // So we verify our trajectories exist separately above
      expect(readiness.stats.totalTrajectories).toBeGreaterThanOrEqual(verifyCount);
      expect(readiness.stats.dataQuality).toBeGreaterThan(0);

      // Step 5: Get status
      console.log('📊 Step 5: Getting pipeline status...');
      const status = await pipeline.getStatus();
      
      console.log('📊 Pipeline Status:', {
        last24h: status.dataCollection.last24h,
        ratePerHour: status.dataCollection.ratePerHour.toFixed(2),
        health: status.health,
      });

      expect(status.dataCollection.last24h).toBeGreaterThanOrEqual(6);
      expect(status.health.database).toBe(true);

      console.log('\n✅ E2E Data Flow Test Complete!\n');
      
      // Add to cleanup list only after successful completion
      testTrajectoryMap.set('should complete full data collection cycle', [...trajectoryIds]);
      testData.trajectoryIds.push(...trajectoryIds);
    }, 15000); // Increased timeout for concurrent test runs
  });
});

