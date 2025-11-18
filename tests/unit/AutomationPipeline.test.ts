/**
 * Unit Tests for AutomationPipeline
 * 
 * Tests core functionality without external dependencies
 */

import { describe, test, expect, beforeEach, beforeAll, mock } from 'bun:test';
import type { Trajectory, TrainingBatch, TrainedModel } from '@prisma/client';
import type { AutomationPipeline as AutomationPipelineType, AutomationConfig } from '@/lib/training/AutomationPipeline';

// Define mocks
const mockPrisma = {
  trajectory: {
    count: mock(),
    groupBy: mock(),
    findMany: mock(),
    updateMany: mock(),
  },
  trainingBatch: {
    create: mock(),
    findUnique: mock(),
    findFirst: mock(),
    count: mock(),
    update: mock(),
  },
  trainedModel: {
    findFirst: mock(),
    create: mock(),
    count: mock(),
    update: mock(),
  },
  user: {
    count: mock(),
  },
  $queryRaw: mock(),
};

const mockLogger = {
  info: mock(),
  warn: mock(),
  error: mock(),
};

// Mock modules
mock.module('@/lib/prisma', () => ({
  prisma: mockPrisma
}));

mock.module('@/lib/logger', () => ({
  logger: mockLogger
}));

describe('AutomationPipeline - Unit Tests', () => {
  let AutomationPipeline: any; // Constructor
  let pipeline: AutomationPipelineType;
  let mockConfig: Partial<AutomationConfig>;

  beforeAll(async () => {
    // Set dummy DATABASE_URL to prevent Prisma from complaining
    // This must be done before importing the module
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://mock:mock@localhost:5432/mock';
    
    // Dynamic import to ensure env var is set and mocks are applied
    const module = await import('@/lib/training/AutomationPipeline');
    AutomationPipeline = module.AutomationPipeline;
  });

  beforeEach(() => {
    // Reset all mocks
    Object.values(mockPrisma).forEach(model => {
      if (typeof model === 'object') {
        Object.values(model).forEach((fn: any) => fn.mockClear && fn.mockClear());
      } else if ((model as any).mockClear) {
        (model as any).mockClear();
      }
    });
    Object.values(mockLogger).forEach(fn => fn.mockClear());

    // Default mock implementations
    mockPrisma.trajectory.count.mockResolvedValue(0);
    mockPrisma.trajectory.groupBy.mockResolvedValue([]);
    mockPrisma.trajectory.findMany.mockResolvedValue([]);
    mockPrisma.trainingBatch.findUnique.mockResolvedValue(null);
    mockPrisma.trainingBatch.findFirst.mockResolvedValue(null);
    mockPrisma.trainingBatch.count.mockResolvedValue(0);
    mockPrisma.trainingBatch.create.mockResolvedValue({ id: 'batch-1' });
    mockPrisma.trainingBatch.update.mockResolvedValue({});
    mockPrisma.trainedModel.findFirst.mockResolvedValue(null);
    mockPrisma.trainedModel.count.mockResolvedValue(0);
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);

    mockConfig = {
      minTrajectoriesForTraining: 50,
      minGroupSize: 3,
      dataQualityThreshold: 0.9,
      autoTriggerTraining: true,
      trainingInterval: 12,
      baseModel: 'OpenPipe/Qwen3-14B-Instruct',
      modelNamePrefix: 'test-model',
      wandbProject: 'test-project',
    };

    pipeline = new AutomationPipeline(mockConfig);
  });

  describe('Configuration', () => {
    test('should use default configuration when not provided', () => {
      const defaultPipeline = new AutomationPipeline();
      const status = defaultPipeline['config'];

      // Check that it uses environment variables if set, or defaults to 1
      // Logic matches implementation: must be finite and > 0
      const envMinTraj = parseInt(process.env.TRAINING_MIN_TRAJECTORIES || '', 10);
      const expectedMinTrajectories = (Number.isFinite(envMinTraj) && envMinTraj > 0) ? envMinTraj : 1;
      
      const envMinGroup = parseInt(process.env.TRAINING_MIN_GROUP_SIZE || '', 10);
      const expectedMinGroupSize = (Number.isFinite(envMinGroup) && envMinGroup > 0) ? envMinGroup : 1;

      expect(status.minTrajectoriesForTraining).toBe(expectedMinTrajectories);
      expect(status.minGroupSize).toBe(expectedMinGroupSize);
      expect(status.dataQualityThreshold).toBe(0.95);
      expect(status.baseModel).toBe('OpenPipe/Qwen3-14B-Instruct');
    });

    test('should merge custom config with defaults', () => {
      const config = (pipeline as any)['config'];
      
      expect(config.minTrajectoriesForTraining).toBe(50);
      expect(config.minGroupSize).toBe(3);
      expect(config.dataQualityThreshold).toBe(0.9);
      expect(config.baseModel).toBe('OpenPipe/Qwen3-14B-Instruct');
    });

    test('should use OpenPipe model by default', () => {
      const defaultPipeline = new AutomationPipeline();
      expect((defaultPipeline as any)['config'].baseModel).toBe('OpenPipe/Qwen3-14B-Instruct');
    });

    test('should allow custom model override', () => {
      const customPipeline = new AutomationPipeline({
        baseModel: 'custom-model'
      });
      expect((customPipeline as any)['config'].baseModel).toBe('custom-model');
    });
  });

  describe('Training Readiness Check', () => {
    test('should be not ready when insufficient trajectories', async () => {
      mockPrisma.trajectory.count.mockResolvedValue(30);

      const result = await pipeline.checkTrainingReadiness();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('more trajectories');
      expect(result.stats.totalTrajectories).toBe(30);
    });

    test('should be not ready when insufficient scenario groups', async () => {
      let callCount = 0;
      mockPrisma.trajectory.count.mockImplementation(() => {
        callCount++;
        // First call for scoredAndReady, second call for unscored
        return Promise.resolve(callCount === 1 ? 100 : 0);
      });
      
      mockPrisma.trajectory.groupBy.mockResolvedValue([
        { scenarioId: 'scenario-1', _count: 5 },
        { scenarioId: 'scenario-2', _count: 4 },
      ]);

      const result = await pipeline.checkTrainingReadiness();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('scenario groups');
      expect(result.stats.scenarioGroups).toBe(2);
    });

    test('should be ready when all conditions met', async () => {
      mockPrisma.trajectory.count.mockResolvedValue(100);
      mockPrisma.trajectory.groupBy.mockResolvedValue(
        Array.from({ length: 15 }, (_, i) => ({
          scenarioId: `scenario-${i}`,
          _count: 5
        }))
      );
      
      mockPrisma.trajectory.findMany.mockResolvedValue(
        Array.from({ length: 50 }, (_, i): Pick<Trajectory, 'trajectoryId' | 'stepsJson'> => ({
          trajectoryId: `traj-${i}`,
          stepsJson: JSON.stringify([{
            llmCalls: [{
              systemPrompt: 'a'.repeat(100),
              userPrompt: 'b'.repeat(150),
              response: 'Test'
            }],
            providerAccesses: [{ provider: 'test' }],
            action: { result: 'success' }
          }])
        }))
      );

      const result = await pipeline.checkTrainingReadiness();

      expect(result.ready).toBe(true);
      expect(result.reason).toBe('Ready to train!');
      expect(result.stats.scenarioGroups).toBeGreaterThanOrEqual(10);
    });

    test('should check data quality', async () => {
      let callCount = 0;
      mockPrisma.trajectory.count.mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? 100 : 0);
      });
      
      mockPrisma.trajectory.groupBy.mockResolvedValue(
        Array.from({ length: 15 }, (_, i) => ({
          scenarioId: `scenario-${i}`,
          _count: 5
        }))
      );

      // Mock poor quality data
      mockPrisma.trajectory.findMany.mockResolvedValue(
        Array.from({ length: 50 }, (): Pick<Trajectory, 'trajectoryId' | 'stepsJson'> => ({
          trajectoryId: 'traj-poor-quality',
          stepsJson: JSON.stringify([{
            llmCalls: [],  // No LLM calls = poor quality
            action: {}
          }])
        }))
      );

      const result = await pipeline.checkTrainingReadiness();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('quality');
      expect(result.stats.dataQuality).toBeLessThan(1.0);
    });
  });

  describe('Model Versioning', () => {
    test('should start at v1.0.0 when no models exist', async () => {
      mockPrisma.trainedModel.findFirst.mockResolvedValue(null);

      const version = await (pipeline as any)['getNextModelVersion']();

      expect(version).toBe('v1.0.0');
    });

    test('should increment patch version', async () => {
      mockPrisma.trainedModel.findFirst.mockResolvedValue({
        version: 'v1.0.5'
      } as TrainedModel);

      const version = await (pipeline as any)['getNextModelVersion']();

      expect(version).toBe('v1.0.6');
    });

    test('should handle double-digit versions', async () => {
      mockPrisma.trainedModel.findFirst.mockResolvedValue({
        version: 'v2.3.99'
      } as TrainedModel);

      const version = await (pipeline as any)['getNextModelVersion']();

      expect(version).toBe('v2.3.100');
    });
  });

  describe('Trajectory ID Retrieval', () => {
    test('should retrieve trajectory IDs for training', async () => {
      const mockTrajectories: Array<Pick<Trajectory, 'trajectoryId' | 'stepsJson'>> = [
        { trajectoryId: 'traj-1', stepsJson: '[]' },
        { trajectoryId: 'traj-2', stepsJson: '[]' },
        { trajectoryId: 'traj-3', stepsJson: '[]' },
      ];

      mockPrisma.trajectory.findMany.mockResolvedValue(mockTrajectories);

      const ids = await (pipeline as any)['getTrajectoryIds'](3);

      expect(ids).toEqual(['traj-1', 'traj-2', 'traj-3']);
      expect(mockPrisma.trajectory.findMany).toHaveBeenCalled();
    });

    test('should retrieve all trajectories when no limit', async () => {
      const mockTrajectories: Array<Pick<Trajectory, 'trajectoryId' | 'stepsJson'>> = [
        { trajectoryId: 'traj-1', stepsJson: '[]' },
        { trajectoryId: 'traj-2', stepsJson: '[]' },
      ];

      mockPrisma.trajectory.findMany.mockResolvedValue(mockTrajectories);

      const ids = await (pipeline as any)['getTrajectoryIds']();

      expect(ids).toHaveLength(2);
      expect(mockPrisma.trajectory.findMany).toHaveBeenCalled();
    });
  });

  describe('Training Monitoring', () => {
    test('should return not_found for non-existent batch', async () => {
      mockPrisma.trainingBatch.findUnique.mockResolvedValue(null);

      const status = await pipeline.monitorTraining('non-existent');

      expect(status.status).toBe('not_found');
    });

    test('should return training status', async () => {
      mockPrisma.trainingBatch.findUnique.mockResolvedValue({
        batchId: 'batch-1',
        status: 'training',
        error: null
      } as TrainingBatch);

      const status = await pipeline.monitorTraining('batch-1');

      expect(status.status).toBe('training');
      expect(status.progress).toBe(0.5);
      expect(status.eta).toBeDefined();
    });

    test('should return completed status', async () => {
      mockPrisma.trainingBatch.findUnique.mockResolvedValue({
        batchId: 'batch-1',
        status: 'completed',
        error: null
      } as TrainingBatch);

      const status = await pipeline.monitorTraining('batch-1');

      expect(status.status).toBe('completed');
      expect(status.progress).toBe(1.0);
      expect(status.eta).toBeUndefined();
    });
  });

  describe('Status Reporting', () => {
    test('should return comprehensive status', async () => {
      let callCount = 0;
      mockPrisma.trajectory.count.mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? 50 : 200);
      });
      
      mockPrisma.trainingBatch.findFirst.mockResolvedValue({
        completedAt: new Date('2024-01-01T12:00:00Z')
      } as TrainingBatch);
      
      mockPrisma.trainedModel.findFirst.mockResolvedValue({
        version: 'v1.2.3'
      } as TrainedModel);
      
      mockPrisma.trainedModel.count.mockResolvedValue(5);
      mockPrisma.trainingBatch.count.mockResolvedValue(2);
      mockPrisma.user.count.mockResolvedValue(1);

      const status = await pipeline.getStatus();

      expect(status.dataCollection.last24h).toBe(50);
      expect(status.dataCollection.last7d).toBe(200);
      expect(status.dataCollection.ratePerHour).toBeCloseTo(50 / 24, 1);
      expect(status.models.latest).toBe('v1.2.3');
      expect(status.models.deployed).toBe(5);
      expect(status.models.training).toBe(2);
      expect(status.health.database).toBe(true);
    });

    test('should handle no training history', async () => {
      mockPrisma.trajectory.count.mockResolvedValue(0);
      mockPrisma.trainingBatch.findFirst.mockResolvedValue(null);
      mockPrisma.trainedModel.findFirst.mockResolvedValue(null);
      mockPrisma.trainedModel.count.mockResolvedValue(0);
      mockPrisma.trainingBatch.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(1);

      const status = await pipeline.getStatus();

      expect(status.training.lastCompleted).toBeNull();
      expect(status.models.latest).toBeNull();
      expect(status.dataCollection.last24h).toBe(0);
    });
  });

  describe('Health Checks', () => {
    test('should check database connectivity', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.trajectory.count.mockResolvedValue(10);

      await pipeline['runHealthChecks']();

      expect(mockPrisma.user.count).toHaveBeenCalled();
    });

    test('should handle database errors gracefully', async () => {
      mockPrisma.user.count.mockRejectedValue(new Error('DB Error'));

      await pipeline['runHealthChecks']();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should warn on low data collection rate', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.trajectory.count.mockResolvedValue(0);

      await pipeline['runHealthChecks']();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
