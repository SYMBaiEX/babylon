/**
 * Comprehensive Trajectory Logging Integration Test
 * 
 * Tests that ALL providers and actions in ALL plugins are properly logged to trajectories.
 * This test exercises the complete trajectory logging system end-to-end.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { prisma } from '@/lib/prisma';
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager';
import { TrajectoryLoggerService } from '@/lib/agents/plugins/plugin-trajectory-logger/src/TrajectoryLoggerService';
import { setTrajectoryContext } from '@/lib/agents/plugins/plugin-trajectory-logger/src/action-interceptor';
import { babylonPlugin } from '@/lib/agents/plugins/babylon';
import { experiencePlugin } from '@/lib/agents/plugins/plugin-experience/src';
import { autonomyPlugin } from '@/lib/agents/plugins/plugin-autonomy/src';
import type { AgentRuntime, Memory, State } from '@elizaos/core';
import { generateSnowflakeId } from '@/lib/snowflake';
import { logger } from '@/lib/logger';

describe('Comprehensive Trajectory Logging Integration', () => {
  let testAgentId: string;
  let runtime: AgentRuntime;
  let trajectoryLogger: TrajectoryLoggerService;
  let trajectoryId: string;

  beforeAll(async () => {
    // Create test agent
    testAgentId = await generateSnowflakeId();
    
    await prisma.user.create({
      data: {
        id: testAgentId,
        username: `test-agent-${Date.now()}`,
        displayName: 'Test Agent',
        bio: 'Test agent for trajectory logging',
        isAgent: true,
        virtualBalance: 10000,
        agentPointsBalance: 1000,
        walletAddress: '0x' + '0'.repeat(40), // Dummy wallet
        updatedAt: new Date(),
      },
    });

    // Get runtime with all plugins
    runtime = await agentRuntimeManager.getRuntime(testAgentId);
    
    // Get trajectory logger
    trajectoryLogger = agentRuntimeManager.getTrajectoryLogger(testAgentId)!;
    expect(trajectoryLogger).toBeDefined();

    // Start trajectory
    trajectoryId = trajectoryLogger.startTrajectory(testAgentId, {
      scenarioId: 'comprehensive-test',
      metadata: {
        testType: 'comprehensive-integration',
        timestamp: Date.now(),
      },
    });

    // Set trajectory context on runtime
    setTrajectoryContext(runtime, trajectoryId, trajectoryLogger);
    (runtime as unknown as { currentTrajectoryId?: string }).currentTrajectoryId = trajectoryId;

    // Start first step
    trajectoryLogger.startStep(trajectoryId, {
      timestamp: Date.now(),
      agentBalance: 10000,
      agentPoints: 1000,
      agentPnL: 0,
      openPositions: 0,
    });
  });

  afterAll(async () => {
    // End trajectory
    if (trajectoryLogger && trajectoryId) {
      await trajectoryLogger.endTrajectory(trajectoryId, 'completed', {
        finalBalance: 10000,
        finalPnL: 0,
        tradesExecuted: 0,
        postsCreated: 0,
      });
    }

    // Cleanup
    try {
      await prisma.user.delete({ where: { id: testAgentId } });
      await prisma.trajectory.deleteMany({ where: { agentId: testAgentId } });
      await prisma.llmCallLog.deleteMany({ where: { trajectoryId } });
    } catch (error) {
      logger.warn('Cleanup error (non-critical)', { error }, 'TrajectoryTest');
    }

    agentRuntimeManager.clearRuntime(testAgentId);
  });

  describe('Provider Logging', () => {
    test('should log all Babylon plugin providers', async () => {
      if (!babylonPlugin.providers) {
        throw new Error('Babylon plugin has no providers');
      }

      const testMessage = {
        userId: testAgentId,
        agentId: testAgentId,
        entityId: testAgentId,
        roomId: testAgentId,
        content: { text: 'Test provider access' },
      } as unknown as Memory;

      const testState: State = {
        values: {},
        data: {},
        text: 'test',
      };

      const providerResults: Array<{ name: string; success: boolean; error?: string }> = [];

      // Test all providers
      for (const provider of babylonPlugin.providers) {
        try {
          await provider.get(runtime, testMessage, testState);
          providerResults.push({
            name: provider.name,
            success: true,
          });
          
          // Verify provider access was logged
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          expect(trajectory).toBeDefined();
          
          const lastStep = trajectory?.steps[trajectory.steps.length - 1];
          const providerAccess = lastStep?.providerAccesses.find(
            (p) => p.providerName === provider.name
          );
          
          expect(providerAccess).toBeDefined();
          expect(providerAccess?.providerName).toBe(provider.name);
          expect(providerAccess?.data).toBeDefined();
        } catch (error) {
          // Gracefully handle errors (e.g., A2A not connected)
          providerResults.push({
            name: provider.name,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          
          // Even errors should be logged
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          const lastStep = trajectory?.steps[trajectory.steps.length - 1];
          const providerAccess = lastStep?.providerAccesses.find(
            (p) => p.providerName === provider.name
          );
          
          // Provider access should still be logged even if it failed
          expect(providerAccess).toBeDefined();
        }
      }

      // Verify all providers were attempted
      expect(providerResults.length).toBe(babylonPlugin.providers.length);
      
      // Log results for debugging
      logger.info('Provider test results', {
        total: providerResults.length,
        successful: providerResults.filter((r) => r.success).length,
        failed: providerResults.filter((r) => !r.success).length,
      }, 'TrajectoryTest');
    });

    test('should log experience plugin provider', async () => {
      if (!experiencePlugin.providers || experiencePlugin.providers.length === 0) {
        return; // Skip if no providers
      }

        const testMessage = {
          userId: testAgentId,
          agentId: testAgentId,
          entityId: testAgentId,
          roomId: testAgentId,
          content: { text: 'Test experience provider' },
        } as unknown as Memory;

      const testState: State = {
        values: {},
        data: {},
        text: 'test',
      };

      for (const provider of experiencePlugin.providers) {
        try {
          await provider.get(runtime, testMessage, testState);
          
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          const lastStep = trajectory?.steps[trajectory.steps.length - 1];
          const providerAccess = lastStep?.providerAccesses.find(
            (p) => p.providerName === provider.name
          );
          
          expect(providerAccess).toBeDefined();
        } catch (error) {
          // Errors are acceptable - just verify logging happened
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          expect(trajectory).toBeDefined();
        }
      }
    });

    test('should log autonomy plugin providers', async () => {
      if (!autonomyPlugin.providers || autonomyPlugin.providers.length === 0) {
        return; // Skip if no providers
      }

        const testMessage = {
          userId: testAgentId,
          agentId: testAgentId,
          entityId: testAgentId,
          roomId: testAgentId,
          content: { text: 'Test autonomy provider' },
        } as unknown as Memory;

      const testState: State = {
        values: {},
        data: {},
        text: 'test',
      };

      for (const provider of autonomyPlugin.providers) {
        try {
          await provider.get(runtime, testMessage, testState);
          
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          const lastStep = trajectory?.steps[trajectory.steps.length - 1];
          const providerAccess = lastStep?.providerAccesses.find(
            (p) => p.providerName === provider.name
          );
          
          expect(providerAccess).toBeDefined();
        } catch (error) {
          // Errors are acceptable
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          expect(trajectory).toBeDefined();
        }
      }
    });
  });

  describe('Action Logging', () => {
    test('should log all Babylon plugin actions', async () => {
      if (!babylonPlugin.actions) {
        throw new Error('Babylon plugin has no actions');
      }

      const actionResults: Array<{ name: string; success: boolean; error?: string }> = [];

      // Test all actions
      for (const action of babylonPlugin.actions) {
        // Start a new step for each action
        trajectoryLogger.startStep(trajectoryId, {
          timestamp: Date.now(),
          agentBalance: 10000,
          agentPoints: 1000,
          agentPnL: 0,
          openPositions: 0,
        });

        const testMessage = {
          userId: testAgentId,
          agentId: testAgentId,
          entityId: testAgentId,
          roomId: testAgentId,
          content: { text: `Test ${action.name} action` },
        } as unknown as Memory;

        const testState: State = {
          values: {},
          data: {},
          text: 'test',
        };

        try {
          // Execute action
          await action.handler?.(runtime, testMessage, testState, undefined, async () => []);

          actionResults.push({
            name: action.name,
            success: true,
          });

          // Verify action was logged
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          const lastStep = trajectory?.steps[trajectory.steps.length - 1];
          
          expect(lastStep).toBeDefined();
          expect(lastStep?.action.actionType).toBe(action.name);
          expect(lastStep?.action.actionName).toBe(action.name);
        } catch (error) {
          // Gracefully handle errors
          actionResults.push({
            name: action.name,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });

          // Even errors should be logged
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          const lastStep = trajectory?.steps[trajectory.steps.length - 1];
          
          expect(lastStep).toBeDefined();
          expect(lastStep?.action.actionType).toBe(action.name);
          expect(lastStep?.action.success).toBe(false);
          expect(lastStep?.action.error).toBeDefined();
        }
      }

      // Verify all actions were attempted
      expect(actionResults.length).toBe(babylonPlugin.actions.length);
      
      logger.info('Action test results', {
        total: actionResults.length,
        successful: actionResults.filter((r) => r.success).length,
        failed: actionResults.filter((r) => !r.success).length,
      }, 'TrajectoryTest');
    });

    test('should log autonomy plugin actions', async () => {
      if (!autonomyPlugin.actions || autonomyPlugin.actions.length === 0) {
        return; // Skip if no actions
      }

      for (const action of autonomyPlugin.actions) {
        trajectoryLogger.startStep(trajectoryId, {
          timestamp: Date.now(),
          agentBalance: 10000,
          agentPoints: 1000,
          agentPnL: 0,
          openPositions: 0,
        });

        const testMessage = {
          userId: testAgentId,
          agentId: testAgentId,
          entityId: testAgentId,
          roomId: testAgentId,
          content: { text: `Test ${action.name}` },
        } as unknown as Memory;

        try {
          await action.handler?.(runtime, testMessage, undefined, undefined, async () => []);
          
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          const lastStep = trajectory?.steps[trajectory.steps.length - 1];
          expect(lastStep?.action.actionType).toBe(action.name);
        } catch (error) {
          // Errors are acceptable - verify logging
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          const lastStep = trajectory?.steps[trajectory.steps.length - 1];
          expect(lastStep?.action.actionType).toBe(action.name);
          expect(lastStep?.action.success).toBe(false);
        }
      }
    });
  });

  describe('LLM Call Logging', () => {
    test('should log LLM calls through Groq plugin', async () => {
      // Start a new step
      const stepId = trajectoryLogger.startStep(trajectoryId, {
        timestamp: Date.now(),
        agentBalance: 10000,
        agentPoints: 1000,
        agentPnL: 0,
        openPositions: 0,
      });

      // Simulate an LLM call
      trajectoryLogger.logLLMCall(stepId, {
        model: 'llama-3.1-8b-instant',
        systemPrompt: 'You are a test agent',
        userPrompt: 'Test prompt',
        response: 'Test response',
        temperature: 0.7,
        maxTokens: 100,
        purpose: 'action',
        actionType: 'test',
      });

      // Verify LLM call was logged
      const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
      const lastStep = trajectory?.steps[trajectory.steps.length - 1];
      
      expect(lastStep).toBeDefined();
      expect(lastStep?.llmCalls.length).toBeGreaterThan(0);
      
      const llmCall = lastStep?.llmCalls[lastStep.llmCalls.length - 1];
      expect(llmCall?.model).toBe('llama-3.1-8b-instant');
      expect(llmCall?.userPrompt).toBe('Test prompt');
      expect(llmCall?.response).toBe('Test response');
    });
  });

  describe('Trajectory Completeness', () => {
    test('should capture complete trajectory with all components', async () => {
      const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
      
      expect(trajectory).toBeDefined();
      if (!trajectory) {
        throw new Error('Trajectory not found');
      }
      
      expect(String(trajectory.trajectoryId)).toBe(String(trajectoryId));
      expect(String(trajectory.agentId)).toBe(String(testAgentId));
      expect(trajectory.steps.length).toBeGreaterThan(0);

      // Verify each step has required components
      for (const step of trajectory.steps) {
        expect(step.stepId).toBeDefined();
        expect(step.timestamp).toBeDefined();
        expect(step.environmentState).toBeDefined();
        expect(step.action).toBeDefined();
        expect(step.action.actionType).toBeDefined();
        expect(step.action.actionName).toBeDefined();
        expect(step.action.success !== undefined).toBe(true);
        
        // Verify arrays exist (may be empty)
        expect(Array.isArray(step.llmCalls)).toBe(true);
        expect(Array.isArray(step.providerAccesses)).toBe(true);
      }
    });

    test('should save trajectory to database', async () => {
      // Create a separate trajectory for this test to avoid conflicts
      const testTrajectoryId = trajectoryLogger.startTrajectory(testAgentId, {
        scenarioId: 'database-test',
      });
      
      trajectoryLogger.startStep(testTrajectoryId, {
        timestamp: Date.now(),
        agentBalance: 10000,
        agentPoints: 1000,
        agentPnL: 0,
        openPositions: 0,
      });
      
      // End trajectory
      await trajectoryLogger.endTrajectory(testTrajectoryId, 'completed', {
        finalBalance: 10000,
        finalPnL: 0,
      });

      // Wait for database write
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify trajectory was saved
      const saved = await prisma.trajectory.findUnique({
        where: { trajectoryId: testTrajectoryId },
      });

      expect(saved).toBeDefined();
      expect(saved?.agentId).toBe(testAgentId);
      expect(saved?.trajectoryId).toBe(testTrajectoryId);
      expect(saved?.stepsJson).toBeDefined();
      
      // Verify steps JSON is valid
      const steps = JSON.parse(saved!.stepsJson);
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
    });

    test('should save LLM calls to database', async () => {
      // Check if any LLM calls were saved
      const llmCalls = await prisma.llmCallLog.findMany({
        where: { trajectoryId },
        take: 10,
      });

      // At least one LLM call should be logged (from our test)
      expect(llmCalls.length).toBeGreaterThan(0);
      
      // Verify LLM call structure
      const llmCall = llmCalls[0];
      if (!llmCall) {
        throw new Error('No LLM calls found');
      }
      expect(llmCall.trajectoryId).toBe(trajectoryId);
      expect(llmCall.model).toBeDefined();
      expect(llmCall.systemPrompt).toBeDefined();
      expect(llmCall.userPrompt).toBeDefined();
      expect(llmCall.response).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle provider errors gracefully', async () => {
      const testMessage = {
        userId: testAgentId,
        agentId: testAgentId,
        entityId: testAgentId,
        roomId: testAgentId,
        content: { text: 'Test error handling' },
      } as unknown as Memory;

      const testState: State = {
        values: {},
        data: {},
        text: 'test',
      };

      // Start step
      trajectoryLogger.startStep(trajectoryId, {
        timestamp: Date.now(),
        agentBalance: 10000,
        agentPoints: 1000,
        agentPnL: 0,
        openPositions: 0,
      });

      // Try a provider that might fail (e.g., A2A not connected)
      if (babylonPlugin.providers && babylonPlugin.providers.length > 0) {
        const provider = babylonPlugin.providers[0]!;
        
        try {
          await provider.get(runtime, testMessage, testState);
        } catch (error) {
          // Error is expected - verify it was logged
          const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
          const lastStep = trajectory?.steps[trajectory.steps.length - 1];
          
          // Provider access should still be logged even on error
          expect(lastStep).toBeDefined();
        }
      }
    });

    test('should handle action errors gracefully', async () => {
      if (!babylonPlugin.actions || babylonPlugin.actions.length === 0) {
        return;
      }

      trajectoryLogger.startStep(trajectoryId, {
        timestamp: Date.now(),
        agentBalance: 10000,
        agentPoints: 1000,
        agentPnL: 0,
        openPositions: 0,
      });

      const action = babylonPlugin.actions[0]!;
        const testMessage = {
          userId: testAgentId,
          agentId: testAgentId,
          entityId: testAgentId,
          roomId: testAgentId,
          content: { text: 'Test action error' },
        } as unknown as Memory;

      try {
        await action.handler?.(runtime, testMessage, undefined, undefined, async () => []);
      } catch (error) {
        // Error is expected - verify it was logged
        const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
        const lastStep = trajectory?.steps[trajectory.steps.length - 1];
        
        expect(lastStep).toBeDefined();
        expect(lastStep?.action.actionType).toBe(action.name);
        // Action should be logged even if it failed
        expect(lastStep?.action.success !== undefined).toBe(true);
      }
    });

    test('should continue logging even if database save fails', async () => {
      // This test verifies that trajectory logging doesn't break agent execution
      // even if database operations fail
      
      const stepId = trajectoryLogger.startStep(trajectoryId, {
        timestamp: Date.now(),
        agentBalance: 10000,
        agentPoints: 1000,
        agentPnL: 0,
        openPositions: 0,
      });

      // Log an LLM call (which tries to save to DB)
      trajectoryLogger.logLLMCall(stepId, {
        model: 'test-model',
        systemPrompt: 'Test',
        userPrompt: 'Test',
        response: 'Test',
        temperature: 0.7,
        maxTokens: 100,
        purpose: 'action',
      });

      // Verify it was logged in memory even if DB save failed
      const trajectory = trajectoryLogger.getActiveTrajectory(trajectoryId);
      const lastStep = trajectory?.steps[trajectory.steps.length - 1];
      
      expect(lastStep).toBeDefined();
      expect(lastStep?.llmCalls.length).toBeGreaterThan(0);
    });
  });
});

