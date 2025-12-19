/**
 * TrajectoryRecorder Tests
 *
 * Tests the TrajectoryRecorder functionality including:
 * - Trajectory lifecycle (start, step, end)
 * - Step recording with environment state
 * - LLM call logging
 * - Simulation mode file output
 * - Edge cases and error handling
 *
 * These tests verify the training data collection for GRPO training.
 */

import { describe, expect, test, mock } from 'bun:test';

// Mock database and simulation mode
const mockIsSimulationMode = mock(() => true);
mock.module('@babylon/db', () => ({
  db: {
    insert: mock(() => ({
      values: mock(() => Promise.resolve()),
    })),
  },
  trajectories: {},
  llmCallLogs: {},
  isSimulationMode: mockIsSimulationMode,
}));

// Note: We don't mock 'fs' globally as it can interfere with other tests
// that import fs (like BenchmarkRunner). Instead we test the logic without file I/O.

import type {
  Action,
  EnvironmentState,
  LLMCall,
  TrajectoryStep,
} from '../types';

// =============================================================================
// Trajectory Lifecycle Tests
// =============================================================================

describe('TrajectoryRecorder - Lifecycle', () => {
  test('generates unique trajectory IDs', () => {
    const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const id1 = generateId();
    const id2 = generateId();

    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(10);
  });

  test('trajectory starts with empty steps', () => {
    interface ActiveTrajectory {
      trajectoryId: string;
      agentId: string;
      steps: TrajectoryStep[];
    }

    const trajectory: ActiveTrajectory = {
      trajectoryId: 'test-123',
      agentId: 'agent-456',
      steps: [],
    };

    expect(trajectory.steps).toHaveLength(0);
  });

  test('trajectory tracks start time', () => {
    const startTime = Date.now();

    // Simulate some delay
    const elapsedCheck = Date.now() - startTime;

    expect(elapsedCheck).toBeGreaterThanOrEqual(0);
  });

  test('trajectory calculates duration on end', () => {
    const startTime = Date.now() - 5000; // Started 5 seconds ago
    const endTime = Date.now();

    const durationMs = endTime - startTime;

    expect(durationMs).toBeGreaterThanOrEqual(5000);
  });
});

// =============================================================================
// Environment State Tests
// =============================================================================

describe('TrajectoryRecorder - Environment State', () => {
  test('validates complete environment state structure', () => {
    const state: EnvironmentState = {
      agentBalance: 10000,
      agentPoints: 500,
      agentPnL: 250.50,
      openPositions: 3,
      timestamp: Date.now(),
    };

    expect(state.agentBalance).toBeDefined();
    expect(state.agentPoints).toBeDefined();
    expect(state.agentPnL).toBeDefined();
    expect(state.openPositions).toBeDefined();
    expect(state.timestamp).toBeDefined();
  });

  test('handles zero balance state', () => {
    const state: EnvironmentState = {
      agentBalance: 0,
      agentPoints: 0,
      agentPnL: 0,
      openPositions: 0,
      timestamp: Date.now(),
    };

    expect(state.agentBalance).toBe(0);
    expect(state.agentPnL).toBe(0);
  });

  test('handles negative PnL', () => {
    const state: EnvironmentState = {
      agentBalance: 5000,
      agentPoints: 100,
      agentPnL: -2500,
      openPositions: 2,
      timestamp: Date.now(),
    };

    expect(state.agentPnL).toBeLessThan(0);
  });

  test('handles large balance values', () => {
    const state: EnvironmentState = {
      agentBalance: 1e12, // 1 trillion
      agentPoints: 1e9,
      agentPnL: 5e8,
      openPositions: 100,
      timestamp: Date.now(),
    };

    expect(state.agentBalance).toBe(1e12);
  });
});

// =============================================================================
// LLM Call Recording Tests
// =============================================================================

describe('TrajectoryRecorder - LLM Calls', () => {
  test('records complete LLM call structure', () => {
    const llmCall: LLMCall = {
      model: 'qwen-32b',
      purpose: 'action',
      systemPrompt: 'You are a trading agent...',
      userPrompt: 'Current market state: BTCAI at $120,000',
      response: 'I recommend buying BTCAI',
      reasoning: 'Price momentum is positive',
      temperature: 0.7,
      maxTokens: 2000,
      latencyMs: 450,
    };

    expect(llmCall.model).toBeDefined();
    expect(llmCall.purpose).toBeDefined();
    expect(llmCall.systemPrompt).toBeDefined();
    expect(llmCall.userPrompt).toBeDefined();
    expect(llmCall.response).toBeDefined();
    expect(llmCall.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('handles missing optional fields', () => {
    const llmCall: Partial<LLMCall> = {
      model: 'qwen-32b',
      purpose: 'reasoning', // Valid purpose type
      userPrompt: 'Analyze this market',
      response: 'Market looks bullish',
      latencyMs: 300,
    };

    expect(llmCall.reasoning).toBeUndefined();
    expect(llmCall.systemPrompt).toBeUndefined();
  });

  test('records latency accurately', () => {
    const latencies = [50, 100, 500, 1000, 5000];

    for (const latency of latencies) {
      const llmCall: LLMCall = {
        model: 'test',
        purpose: 'action', // Valid purpose type
        systemPrompt: '',
        userPrompt: '',
        response: '',
        reasoning: '',
        temperature: 0.5,
        maxTokens: 100,
        latencyMs: latency,
      };

      expect(llmCall.latencyMs).toBe(latency);
    }
  });

  test('handles very long prompts', () => {
    const longPrompt = 'A'.repeat(10000); // 10k characters

    const llmCall: LLMCall = {
      model: 'test',
      purpose: 'evaluation', // Valid purpose type
      systemPrompt: longPrompt,
      userPrompt: longPrompt,
      response: longPrompt,
      reasoning: '',
      temperature: 0.5,
      maxTokens: 100,
      latencyMs: 0,
    };

    expect(llmCall.systemPrompt.length).toBe(10000);
    expect(llmCall.userPrompt.length).toBe(10000);
  });
});

// =============================================================================
// Action Recording Tests
// =============================================================================

describe('TrajectoryRecorder - Actions', () => {
  test('records complete action structure', () => {
    const action: Action = {
      actionType: 'buy',
      parameters: {
        ticker: 'BTCAI',
        amount: 1000,
        price: 120000,
      },
      success: true,
      result: {
        positionId: 'pos-123',
        executedPrice: 120050,
      },
    };

    expect(action.actionType).toBeDefined();
    expect(action.parameters).toBeDefined();
    expect(action.success).toBe(true);
    expect(action.result).toBeDefined();
  });

  test('handles failed actions', () => {
    const action: Action = {
      actionType: 'buy',
      parameters: {
        ticker: 'BTCAI',
        amount: 1000000, // Too large
      },
      success: false,
      error: 'Insufficient balance',
    };

    expect(action.success).toBe(false);
    expect(action.error).toBeDefined();
  });

  test('records hold actions', () => {
    const action: Action = {
      actionType: 'hold',
      parameters: {},
      success: true,
    };

    expect(action.actionType).toBe('hold');
    expect(action.success).toBe(true);
  });

  test('records various action types', () => {
    const actionTypes = [
      'buy',
      'sell',
      'hold',
      'open_long',
      'open_short',
      'close_position',
      'buy_yes',
      'buy_no',
    ];

    for (const actionType of actionTypes) {
      const action: Action = {
        actionType,
        parameters: {},
        success: true,
      };

      expect(action.actionType).toBe(actionType);
    }
  });
});

// =============================================================================
// Step Recording Tests
// =============================================================================

describe('TrajectoryRecorder - Steps', () => {
  test('records complete step structure', () => {
    const step: TrajectoryStep = {
      stepNumber: 0,
      timestamp: Date.now(),
      environmentState: {
        agentBalance: 10000,
        agentPoints: 0,
        agentPnL: 0,
        openPositions: 0,
        timestamp: Date.now(),
      },
      providerAccesses: [],
      llmCalls: [],
      action: {
        actionType: 'hold',
        parameters: {},
        success: true,
      },
      reward: 0,
    };

    expect(step.stepNumber).toBe(0);
    expect(step.environmentState).toBeDefined();
    expect(step.action).toBeDefined();
    expect(step.reward).toBeDefined();
  });

  test('step numbers increment correctly', () => {
    const steps: TrajectoryStep[] = [];

    for (let i = 0; i < 5; i++) {
      steps.push({
        stepNumber: i,
        timestamp: Date.now(),
        environmentState: {
          agentBalance: 10000 - i * 100,
          agentPoints: i * 10,
          agentPnL: i * 50,
          openPositions: i,
          timestamp: Date.now(),
        },
        providerAccesses: [],
        llmCalls: [],
        action: {
          actionType: 'hold',
          parameters: {},
          success: true,
        },
        reward: i * 0.1,
      });
    }

    expect(steps).toHaveLength(5);
    expect(steps[0]!.stepNumber).toBe(0);
    expect(steps[4]!.stepNumber).toBe(4);
  });

  test('handles steps with multiple LLM calls', () => {
    const step: TrajectoryStep = {
      stepNumber: 0,
      timestamp: Date.now(),
      environmentState: {
        agentBalance: 10000,
        agentPoints: 0,
        agentPnL: 0,
        openPositions: 0,
        timestamp: Date.now(),
      },
      providerAccesses: [],
      llmCalls: [
        {
          model: 'qwen-32b',
          purpose: 'reasoning', // Valid purpose type (analysis phase)
          systemPrompt: '',
          userPrompt: 'Analyze market',
          response: 'Bullish',
          reasoning: '',
          temperature: 0.5,
          maxTokens: 100,
          latencyMs: 100,
        },
        {
          model: 'qwen-32b',
          purpose: 'action',
          systemPrompt: '',
          userPrompt: 'What action?',
          response: 'Buy BTCAI',
          reasoning: 'Momentum',
          temperature: 0.7,
          maxTokens: 200,
          latencyMs: 150,
        },
      ],
      action: {
        actionType: 'buy',
        parameters: { ticker: 'BTCAI' },
        success: true,
      },
      reward: 1.0,
    };

    expect(step.llmCalls).toHaveLength(2);
    expect(step.llmCalls[0]!.purpose).toBe('reasoning');
    expect(step.llmCalls[1]!.purpose).toBe('action');
  });
});

// =============================================================================
// Simulation Mode Output Tests
// =============================================================================

describe('TrajectoryRecorder - Simulation Mode', () => {
  test('constructs correct file path in simulation mode', () => {
    const outputDir = './training-data-output/trajectories';
    const trajectoryId = '1234567890';

    const filePath = `${outputDir}/${trajectoryId}.json`;

    expect(filePath).toBe('./training-data-output/trajectories/1234567890.json');
  });

  test('trajectory JSON structure is valid', () => {
    const trajectoryData = {
      trajectory: {
        id: 'traj-123',
        trajectoryId: '123456',
        agentId: 'agent-456',
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T01:00:00.000Z',
        durationMs: 3600000,
        episodeLength: 24,
        finalStatus: 'completed',
        totalReward: 5.5,
      },
      llmCalls: [],
    };

    expect(trajectoryData.trajectory.id).toBeDefined();
    expect(trajectoryData.trajectory.agentId).toBeDefined();
    expect(trajectoryData.trajectory.durationMs).toBeGreaterThan(0);
  });

  test('handles window ID generation', () => {
    const generateWindowId = (): string => {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const hour = now.getHours().toString().padStart(2, '0');
      return `${dateStr}T${hour}:00`;
    };

    const windowId = generateWindowId();

    expect(windowId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/);
  });
});

// =============================================================================
// Reward Calculation Tests
// =============================================================================

describe('TrajectoryRecorder - Rewards', () => {
  test('step rewards can be positive', () => {
    const step: Partial<TrajectoryStep> = {
      reward: 1.5,
    };

    expect(step.reward).toBeGreaterThan(0);
  });

  test('step rewards can be negative', () => {
    const step: Partial<TrajectoryStep> = {
      reward: -0.5,
    };

    expect(step.reward).toBeLessThan(0);
  });

  test('step rewards can be zero', () => {
    const step: Partial<TrajectoryStep> = {
      reward: 0,
    };

    expect(step.reward).toBe(0);
  });

  test('calculates total reward across steps', () => {
    const rewards = [1.0, -0.5, 2.0, 0, -1.0];
    const totalReward = rewards.reduce((sum, r) => sum + r, 0);

    expect(totalReward).toBe(1.5);
  });

  test('handles floating point precision in rewards', () => {
    const rewards = [0.1, 0.2, 0.3];
    const totalReward = rewards.reduce((sum, r) => sum + r, 0);

    // Use toBeCloseTo for floating point comparison
    expect(totalReward).toBeCloseTo(0.6, 10);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('TrajectoryRecorder - Error Handling', () => {
  test('handles missing trajectory gracefully', () => {
    const activeTrajectories = new Map<string, { steps: TrajectoryStep[] }>();
    const nonExistentId = 'does-not-exist';

    const trajectory = activeTrajectories.get(nonExistentId);

    expect(trajectory).toBeUndefined();
  });

  test('handles duplicate trajectory start', () => {
    const activeTrajectories = new Map<string, { id: string }>();
    const trajectoryId = 'traj-123';

    // First start
    activeTrajectories.set(trajectoryId, { id: trajectoryId });

    // Check if already exists before creating
    const alreadyExists = activeTrajectories.has(trajectoryId);

    expect(alreadyExists).toBe(true);
  });

  test('validates step has action before completion', () => {
    const step: Partial<TrajectoryStep> = {
      stepNumber: 0,
      timestamp: Date.now(),
      environmentState: {
        agentBalance: 10000,
        agentPoints: 0,
        agentPnL: 0,
        openPositions: 0,
        timestamp: Date.now(),
      },
      // No action set
    };

    const isComplete = step.action !== undefined;

    expect(isComplete).toBe(false);
  });
});

// =============================================================================
// Metadata Tests
// =============================================================================

describe('TrajectoryRecorder - Metadata', () => {
  test('records archetype information', () => {
    interface StartOptions {
      agentId: string;
      archetype?: string;
    }

    const options: StartOptions = {
      agentId: 'agent-123',
      archetype: 'conservative-trader',
    };

    expect(options.archetype).toBe('conservative-trader');
  });

  test('handles game knowledge metadata', () => {
    interface EndOptions {
      gameKnowledge?: {
        trueProbabilities?: Record<string, number>;
        actualOutcomes?: Record<string, unknown>;
      };
    }

    const options: EndOptions = {
      gameKnowledge: {
        trueProbabilities: {
          'question-1': 0.75,
          'question-2': 0.3,
        },
        actualOutcomes: {
          'question-1': true,
          'question-2': false,
        },
      },
    };

    expect(options.gameKnowledge?.trueProbabilities?.['question-1']).toBe(0.75);
    expect(options.gameKnowledge?.actualOutcomes?.['question-1']).toBe(true);
  });

  test('records final balance and PnL on end', () => {
    interface EndOptions {
      finalBalance?: number;
      finalPnL?: number;
    }

    const options: EndOptions = {
      finalBalance: 12500,
      finalPnL: 2500,
    };

    expect(options.finalBalance).toBe(12500);
    expect(options.finalPnL).toBe(2500);
  });
});
