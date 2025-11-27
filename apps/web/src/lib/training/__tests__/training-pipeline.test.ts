/**
 * Training Pipeline Core Tests
 * Tests the training automation pipeline functionality
 */

import { describe, expect, it } from 'bun:test';
import type { JsonValue } from '@/types/common';
import { AutomationPipeline } from '../AutomationPipeline';

// Type for system status result
interface SystemStatus {
  data?: JsonValue;
  training?: JsonValue;
}

// Type for pipeline with private getSystemStatus method exposed for testing
interface PipelineWithPrivateMethods {
  getSystemStatus: () => Promise<SystemStatus>;
}

describe('Training Automation Pipeline', () => {
  describe('Configuration', () => {
    it('should initialize with default config', () => {
      const pipeline = new AutomationPipeline();
      expect(pipeline).toBeDefined();
    });

    it('should accept custom config', () => {
      const pipeline = new AutomationPipeline({
        minTrajectoriesForTraining: 50,
        minGroupSize: 3,
        dataQualityThreshold: 0.9,
        autoTriggerTraining: false,
        trainingInterval: 12,
        baseModel: 'custom-model',
        modelNamePrefix: 'test-model',
        modelStoragePath: './test-models',
        dataStoragePath: './test-data',
      });

      expect(pipeline).toBeDefined();
    });
  });

  describe('Data Status', () => {
    it('should return data status without errors', async () => {
      const pipeline = new AutomationPipeline();

      const status = await pipeline.getStatus();
      expect(status).toBeDefined();
      expect('data' in status && status.data).toBeDefined();
    });
  });

  describe('Training Readiness', () => {
    it('should check training readiness without errors', async () => {
      const pipeline = new AutomationPipeline();

      const readiness = await pipeline.checkTrainingReadiness();
      expect(readiness).toBeDefined();
      expect(typeof readiness.ready).toBe('boolean');
      expect(typeof readiness.stats.totalTrajectories).toBe('number');
    });
  });

  describe('System Status', () => {
    it('should get system status without crashing', async () => {
      const pipeline = new AutomationPipeline();

      // Access private method for testing (type assertion needed)
      const pipelineWithPrivate = pipeline as Partial<AutomationPipeline> &
        PipelineWithPrivateMethods;
      const status = await pipelineWithPrivate.getSystemStatus();
      expect(status).toBeDefined();
      expect(status.data).toBeDefined();
      expect(status.training).toBeDefined();
    });
  });
});
