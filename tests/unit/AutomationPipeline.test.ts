/**
 * Unit Tests for AutomationPipeline
 * 
 * Tests core functionality without external dependencies
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { AutomationPipeline, type AutomationConfig } from '@/lib/training/AutomationPipeline';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    trajectory: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    trainingBatch: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    trainedModel: {
      findFirst: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock export function
vi.mock('../agents/plugins/plugin-trajectory-logger/src/export', () => ({
  exportGroupedForGRPO: vi.fn(),
}));

describe('AutomationPipeline - Unit Tests', () => {
  let pipeline: AutomationPipeline;
  let mockConfig: Partial<AutomationConfig>;

  beforeEach(() => {
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
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    test('should use default configuration when not provided', () => {
      const defaultPipeline = new AutomationPipeline();
      const status = defaultPipeline['config'];
      
      expect(status.minTrajectoriesForTraining).toBe(100);
      expect(status.minGroupSize).toBe(4);
      expect(status.dataQualityThreshold).toBe(0.95);
      expect(status.baseModel).toBe('OpenPipe/Qwen3-14B-Instruct');
    });

    test('should merge custom config with defaults', () => {
      const config = pipeline['config'];
      
      expect(config.minTrajectoriesForTraining).toBe(50);
      expect(config.minGroupSize).toBe(3);
      expect(config.dataQualityThreshold).toBe(0.9);
      expect(config.baseModel).toBe('OpenPipe/Qwen3-14B-Instruct');
    });

    test('should use OpenPipe model by default', () => {
      const defaultPipeline = new AutomationPipeline();
      expect(defaultPipeline['config'].baseModel).toBe('OpenPipe/Qwen3-14B-Instruct');
    });

    test('should allow custom model override', () => {
      const customPipeline = new AutomationPipeline({
        baseModel: 'custom-model'
      });
      expect(customPipeline['config'].baseModel).toBe('custom-model');
    });
  });

  describe('Training Readiness Check', () => {
    test('should be not ready when insufficient trajectories', async () => {
      const { prisma } = await import('@/lib/prisma');
      
      (prisma.trajectory.count as any).mockResolvedValue(30);
      (prisma.trajectory.groupBy as any).mockResolvedValue([]);
      (prisma.trajectory.findMany as any).mockResolvedValue([]); // Mock for data quality

      const result = await pipeline.checkTrainingReadiness();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('more trajectories');
      expect(result.stats.totalTrajectories).toBe(30);
    });

    test('should be not ready when insufficient scenario groups', async () => {
      const { prisma } = await import('@/lib/prisma');
      
      (prisma.trajectory.count as any).mockResolvedValue(100);
      (prisma.trajectory.groupBy as any).mockResolvedValue([
        { scenarioId: 'scenario-1', _count: 5 },
        { scenarioId: 'scenario-2', _count: 4 },
      ]);
      (prisma.trajectory.findMany as any).mockResolvedValue([]); // Mock for data quality

      const result = await pipeline.checkTrainingReadiness();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('scenario groups');
      expect(result.stats.scenarioGroups).toBe(2);
    });

    test('should be ready when all conditions met', async () => {
      const { prisma } = await import('@/lib/prisma');
      
      (prisma.trajectory.count as any).mockResolvedValue(100);
      (prisma.trajectory.groupBy as any).mockResolvedValue(
        Array.from({ length: 15 }, (_, i) => ({
          scenarioId: `scenario-${i}`,
          _count: 5
        }))
      );
      (prisma.trajectory.findMany as any).mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({
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
      const { prisma } = await import('@/lib/prisma');
      
      (prisma.trajectory.count as any).mockResolvedValue(100);
      (prisma.trajectory.groupBy as any).mockResolvedValue(
        Array.from({ length: 15 }, (_, i) => ({
          scenarioId: `scenario-${i}`,
          _count: 5
        }))
      );
      
      // Mock poor quality data
      (prisma.trajectory.findMany as any).mockResolvedValue(
        Array.from({ length: 50 }, () => ({
          stepsJson: JSON.stringify([{
            llmCalls: [],  // No LLM calls = poor quality
            action: {}
          }])
        }))
      );

      const result = await pipeline.checkTrainingReadiness();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('quality');
    });
  });

  describe('Model Versioning', () => {
    test('should start at v1.0.0 when no models exist', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma.trainedModel.findFirst as any).mockResolvedValue(null);

      const version = await pipeline['getNextModelVersion']();

      expect(version).toBe('v1.0.0');
    });

    test('should increment patch version', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma.trainedModel.findFirst as any).mockResolvedValue({
        version: 'v1.0.5'
      });

      const version = await pipeline['getNextModelVersion']();

      expect(version).toBe('v1.0.6');
    });

    test('should handle double-digit versions', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma.trainedModel.findFirst as any).mockResolvedValue({
        version: 'v2.3.99'
      });

      const version = await pipeline['getNextModelVersion']();

      expect(version).toBe('v2.3.100');
    });
  });

  describe('Trajectory ID Retrieval', () => {
    test('should retrieve trajectory IDs for training', async () => {
      const { prisma } = await import('@/lib/prisma');
      
      const mockTrajectories = [
        { trajectoryId: 'traj-1' },
        { trajectoryId: 'traj-2' },
        { trajectoryId: 'traj-3' },
      ];

      (prisma.trajectory.findMany as any).mockResolvedValue(mockTrajectories);

      const ids = await pipeline['getTrajectoryIds'](3);

      expect(ids).toEqual(['traj-1', 'traj-2', 'traj-3']);
      expect(prisma.trajectory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 3,
          select: { trajectoryId: true }
        })
      );
    });

    test('should retrieve all trajectories when no limit', async () => {
      const { prisma } = await import('@/lib/prisma');
      
      (prisma.trajectory.findMany as any).mockResolvedValue([
        { trajectoryId: 'traj-1' },
        { trajectoryId: 'traj-2' },
      ]);

      const ids = await pipeline['getTrajectoryIds']();

      expect(ids).toHaveLength(2);
      expect(prisma.trajectory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: undefined
        })
      );
    });
  });

  describe('Training Monitoring', () => {
    test('should return not_found for non-existent batch', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma.trainingBatch.findUnique as any).mockResolvedValue(null);

      const status = await pipeline.monitorTraining('non-existent');

      expect(status.status).toBe('not_found');
    });

    test('should return training status', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma.trainingBatch.findUnique as any).mockResolvedValue({
        batchId: 'batch-1',
        status: 'training',
        error: null
      });

      const status = await pipeline.monitorTraining('batch-1');

      expect(status.status).toBe('training');
      expect(status.progress).toBe(0.5);
      expect(status.eta).toBeDefined();
    });

    test('should return completed status', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma.trainingBatch.findUnique as any).mockResolvedValue({
        batchId: 'batch-1',
        status: 'completed',
        error: null
      });

      const status = await pipeline.monitorTraining('batch-1');

      expect(status.status).toBe('completed');
      expect(status.progress).toBe(1.0);
      expect(status.eta).toBeUndefined();
    });
  });

  describe('Status Reporting', () => {
    test('should return comprehensive status', async () => {
      const { prisma } = await import('@/lib/prisma');
      
      (prisma.trajectory.count as any)
        .mockResolvedValueOnce(50)  // last24h
        .mockResolvedValueOnce(200); // last7d
      
      (prisma.trainingBatch.findFirst as any).mockResolvedValue({
        completedAt: new Date('2024-01-01T12:00:00Z')
      });
      
      (prisma.trainedModel.findFirst as any).mockResolvedValue({
        version: 'v1.2.3'
      });
      
      (prisma.trainedModel.count as any).mockResolvedValue(5);
      (prisma.trainingBatch.count as any).mockResolvedValue(2);
      (prisma.$queryRaw as any).mockResolvedValue([{ result: 1 }]);

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
      const { prisma } = await import('@/lib/prisma');
      
      (prisma.trajectory.count as any).mockResolvedValue(0);
      (prisma.trainingBatch.findFirst as any).mockResolvedValue(null);
      (prisma.trainedModel.findFirst as any).mockResolvedValue(null);
      (prisma.trainedModel.count as any).mockResolvedValue(0);
      (prisma.trainingBatch.count as any).mockResolvedValue(0);
      (prisma.$queryRaw as any).mockResolvedValue([{ result: 1 }]);

      const status = await pipeline.getStatus();

      expect(status.training.lastCompleted).toBeNull();
      expect(status.models.latest).toBeNull();
      expect(status.dataCollection.last24h).toBe(0);
    });
  });

  describe('Health Checks', () => {
    test('should check database connectivity', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma.$queryRaw as any).mockResolvedValue([{ result: 1 }]);
      (prisma.trajectory.count as any).mockResolvedValue(10);

      await pipeline['runHealthChecks']();

      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('SELECT')])
      );
    });

    test('should handle database errors gracefully', async () => {
      const { prisma } = await import('@/lib/prisma');
      const { logger } = await import('@/lib/logger');
      
      (prisma.$queryRaw as any).mockRejectedValue(new Error('DB Error'));

      await pipeline['runHealthChecks']();

      expect(logger.error).toHaveBeenCalledWith(
        'Database health check failed',
        expect.any(Error)
      );
    });

    test('should warn on low data collection rate', async () => {
      const { prisma } = await import('@/lib/prisma');
      const { logger } = await import('@/lib/logger');
      
      (prisma.$queryRaw as any).mockResolvedValue([{ result: 1 }]);
      (prisma.trajectory.count as any).mockResolvedValue(0);

      await pipeline['runHealthChecks']();

      expect(logger.warn).toHaveBeenCalledWith(
        'Low data collection rate',
        expect.objectContaining({ trajectoriesLastHour: 0 })
      );
    });
  });
});

