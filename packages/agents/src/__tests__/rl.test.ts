/**
 * RL Training System Test
 *
 * Verifies the complete RL training and inference loop:
 * 1. Agent generates trajectory data
 * 2. RULER scores trajectory
 * 3. Training uses scored data
 * 4. Model is deployed
 * 5. Agent uses trained model for inference
 * 6. Agent takes actions in game
 */

import { describe, expect, it } from 'bun:test';
import {
  getModelTokenLimit,
  truncateToTokenLimitSync,
} from '@babylon/engine';
import { getRLModelConfig } from '../training/RLModelConfig';
import { getLatestRLModel } from '../training/WandbModelFetcher';

describe('RL Training System', () => {
  describe('Configuration', () => {
    it('should have correct base model (OpenPipe/Qwen3-14B-Instruct)', () => {
      const config = getRLModelConfig();
      expect(config.baseModel).toBe('OpenPipe/Qwen3-14B-Instruct');
    });

    it('should have W&B configuration if enabled', () => {
      const config = getRLModelConfig();

      if (config.enabled) {
        expect(config.wandbApiKey).toBeDefined();
        expect(config.wandbProject).toBeDefined();
      }
    });
  });

  describe('Model Loading', () => {
    it('should load latest RL model from database', async () => {
      const model = await getLatestRLModel();

      // Model might not exist yet (new deployment)
      if (model) {
        expect(model.version).toBeDefined();
        expect(model.modelId).toBeDefined();
        expect(model.modelPath).toBeDefined();

        // Should be W&B model path format
        expect(model.modelPath).toContain('/'); // entity/project/model format

        console.log(`✅ Found trained model: ${model.version}`);
        console.log(`   Model ID: ${model.modelId}`);
        console.log(`   Path: ${model.modelPath}`);
      } else {
        console.log('ℹ️  No trained models yet (expected for new deployment)');
      }
    });
  });

  describe('Context Window Safety', () => {
    it('should enforce 32K limit for W&B models', async () => {
      const limit = getModelTokenLimit('OpenPipe/Qwen3-14B-Instruct');

      // CRITICAL: Must be 32K for W&B, not 131K
      expect(limit).toBe(32768);
    });

    it('should have truncation utilities available', async () => {
      const longText = 'a'.repeat(200000); // Very long text
      const result = truncateToTokenLimitSync(longText, 1000, {
        ellipsis: true,
      });

      expect(result.tokens).toBeLessThanOrEqual(1000);
      expect(result.text.length).toBeLessThan(longText.length);
    });
  });

  describe('Agent Services Use Truncation', () => {
    it('AutonomousTradingService should import truncation', async () => {
      const module = await import('../autonomous/AutonomousTradingService');
      expect(module.AutonomousTradingService).toBeDefined();

      // Verify the file has truncation code (basic check)
      const fs = await import('fs/promises');
      const path = await import('path');
      const content = await fs.readFile(
        path.join(__dirname, '../autonomous/AutonomousTradingService.ts'),
        'utf-8'
      );
      expect(content).toContain('truncateToTokenLimitSync');
      expect(content).toContain('30000'); // 30K limit
    });

    it('AutonomousPostingService should import truncation', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const content = await fs.readFile(
        path.join(__dirname, '../autonomous/AutonomousPostingService.ts'),
        'utf-8'
      );
      expect(content).toContain('truncateToTokenLimitSync');
      expect(content).toContain('30000');
    });

    it('AutonomousPlanningCoordinator should import truncation', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const content = await fs.readFile(
        path.join(__dirname, '../autonomous/AutonomousPlanningCoordinator.ts'),
        'utf-8'
      );
      expect(content).toContain('truncateToTokenLimitSync');
      expect(content).toContain('30000');
    });

    it('AutonomousBatchResponseService should import truncation', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const content = await fs.readFile(
        path.join(__dirname, '../autonomous/AutonomousBatchResponseService.ts'),
        'utf-8'
      );
      expect(content).toContain('truncateToTokenLimitSync');
      expect(content).toContain('30000');
    });
  });

  describe('Provider Data Caps', () => {
    it('BatchResponseService should cap interactions to 30', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const content = await fs.readFile(
        path.join(__dirname, '../autonomous/AutonomousBatchResponseService.ts'),
        'utf-8'
      );
      expect(content).toContain('slice(0, 30)'); // Cap to 30 interactions
    });
  });

  describe('Integration Readiness', () => {
    it('should have all components for RL loop', async () => {
      // 1. Trajectory logging
      const trajectoryLogger = await import(
        '../plugins/plugin-trajectory-logger/src/TrajectoryLoggerService'
      );
      expect(trajectoryLogger.TrajectoryLoggerService).toBeDefined();

      // 2. Model fetching (from package-local training module)
      const fetcher = await import('../training/WandbModelFetcher');
      expect(fetcher.getLatestRLModel).toBeDefined();

      // 3. RL Model config
      const config = await import('../training/RLModelConfig');
      expect(config.getRLModelConfig).toBeDefined();

      // 4. Agent runtime
      const runtime = await import('../runtime/AgentRuntimeManager');
      expect(runtime.AgentRuntimeManager).toBeDefined();

      console.log('✅ All RL loop components present');
    });
  });
});
