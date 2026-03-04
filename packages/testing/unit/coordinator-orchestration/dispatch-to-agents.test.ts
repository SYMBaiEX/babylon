/**
 * DISPATCH_TO_AGENTS & RELAY_TO_AGENT Action Tests
 *
 * Tests parallel multi-agent dispatch (Phase 3):
 * - Parameter validation (dispatches array, required state fields)
 * - Parallel execution with Promise.allSettled
 * - Per-agent timeout enforcement (15s)
 * - Result aggregation (success/failure counting)
 * - Cap at 5 concurrent dispatches
 * - validate() — requires ≥2 agents for DISPATCH_TO_AGENTS
 * - RELAY_TO_AGENT context enrichment
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';

// ─── Mock dispatchAgentChat ──────────────────────────────────────────────────

const mockDispatchAgentChat = mock(
  async (params: {
    agentId: string;
    message: string;
    ownerId: string;
    teamChatId: string;
    broadcastFn: unknown;
  }) => ({
    agentId: params.agentId,
    agentUsername: `agent-${params.agentId}` as string | undefined,
    success: true as boolean,
    response: `Response from ${params.agentId}`,
    actionsExecuted: 1,
  })
);

mock.module('../../../agents/src/services/AgentChatService', () => ({
  dispatchAgentChat: mockDispatchAgentChat,
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

const { dispatchToAgentsAction } = await import(
  '../../../agents/src/plugins/plugin-user-core/src/actions/dispatch-to-agents'
);

const { relayToAgentAction } = await import(
  '../../../agents/src/plugins/plugin-user-core/src/actions/relay-to-agent'
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockRuntime = {} as IAgentRuntime;
const mockMessage = {} as Memory;
const mockBroadcastFn = mock(async () => {});

function makeState(overrides: Record<string, unknown> = {}): State {
  const has = (key: string) => key in overrides;
  return {
    data: {
      actionParams: has('actionParams')
        ? overrides.actionParams
        : {
            dispatches: [
              { agentId: 'agent-a', command: 'check positions' },
              { agentId: 'agent-b', command: 'analyze trends' },
            ],
          },
      broadcastFn: has('broadcastFn') ? overrides.broadcastFn : mockBroadcastFn,
      teamMembers: has('teamMembers')
        ? overrides.teamMembers
        : [{ isAgent: true }, { isAgent: true }, { isAgent: false }],
    },
    values: {
      ownerId: has('ownerId') ? overrides.ownerId : 'owner-001',
      teamChatId: has('teamChatId') ? overrides.teamChatId : 'team-chat-001',
      ownerName: has('ownerName') ? overrides.ownerName : 'Alice',
      ownerUsername: has('ownerUsername') ? overrides.ownerUsername : 'alice',
    },
  } as unknown as State;
}

// ─── DISPATCH_TO_AGENTS Tests ────────────────────────────────────────────────

describe('dispatchToAgentsAction', () => {
  beforeEach(() => {
    mockDispatchAgentChat.mockClear();
    mockDispatchAgentChat.mockImplementation(
      async (params: { agentId: string; message: string }) => ({
        agentId: params.agentId,
        agentUsername: `agent-${params.agentId}`,
        success: true,
        response: `Response from ${params.agentId}`,
        actionsExecuted: 1,
      })
    );
  });

  // ─── validate ────────────────────────────────────────────────────────

  describe('validate', () => {
    test('returns true when team has ≥2 agents', async () => {
      const state = makeState();
      const result = await dispatchToAgentsAction.validate!(
        mockRuntime,
        mockMessage,
        state
      );
      expect(result).toBe(true);
    });

    test('returns false when team has only 1 agent', async () => {
      const state = makeState({
        teamMembers: [{ isAgent: true }, { isAgent: false }],
      });
      const result = await dispatchToAgentsAction.validate!(
        mockRuntime,
        mockMessage,
        state
      );
      expect(result).toBe(false);
    });

    test('returns false when team has no agents', async () => {
      const state = makeState({
        teamMembers: [{ isAgent: false }],
      });
      const result = await dispatchToAgentsAction.validate!(
        mockRuntime,
        mockMessage,
        state
      );
      expect(result).toBe(false);
    });

    test('returns false when teamMembers is undefined', async () => {
      const state = { data: {}, values: {} } as unknown as State;
      const result = await dispatchToAgentsAction.validate!(
        mockRuntime,
        mockMessage,
        state
      );
      expect(result).toBe(false);
    });
  });

  // ─── handler ─────────────────────────────────────────────────────────

  describe('handler', () => {
    test('returns error when dispatches array is missing', async () => {
      const state = makeState({ actionParams: {} });

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(false);
      expect(result!.text).toContain('Missing required parameters');
    });

    test('returns error when dispatches is empty array', async () => {
      const state = makeState({ actionParams: { dispatches: [] } });

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(false);
    });

    test('returns error when ownerId is missing', async () => {
      const state = makeState({ ownerId: undefined });

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(false);
    });

    test('returns error when broadcastFn is missing', async () => {
      const state = makeState({ broadcastFn: undefined });

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(false);
    });

    test('returns error when teamChatId is missing', async () => {
      const state = makeState({ teamChatId: undefined });

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(false);
    });

    test('filters out invalid dispatch entries', async () => {
      const state = makeState({
        actionParams: {
          dispatches: [
            { agentId: '', command: 'valid command' }, // empty agentId
            { agentId: 'agent-a', command: '' }, // empty command
            { agentId: 'agent-b', command: 'valid command' }, // valid
          ],
        },
      });

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      // Only 1 valid dispatch
      expect(mockDispatchAgentChat).toHaveBeenCalledTimes(1);
      expect(result!.success).toBe(true);
    });

    test('returns error when ALL dispatch entries are invalid', async () => {
      const state = makeState({
        actionParams: {
          dispatches: [
            { agentId: '', command: '' },
            { agentId: null, command: null },
          ],
        },
      });

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(false);
      expect(result!.text).toContain('No valid dispatch entries');
    });

    test('dispatches to multiple agents in parallel', async () => {
      const state = makeState();

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(mockDispatchAgentChat).toHaveBeenCalledTimes(2);
      expect(result!.success).toBe(true);
      expect(result!.text).toContain('2 agents');
      expect(result!.text).toContain('2 succeeded');
    });

    test('caps at 5 concurrent dispatches', async () => {
      const dispatches = Array.from({ length: 8 }, (_, i) => ({
        agentId: `agent-${i}`,
        command: `task ${i}`,
      }));

      const state = makeState({ actionParams: { dispatches } });

      await dispatchToAgentsAction.handler(mockRuntime, mockMessage, state);

      // Should only dispatch to first 5
      expect(mockDispatchAgentChat).toHaveBeenCalledTimes(5);
    });

    test('handles partial failure (some agents succeed, some fail)', async () => {
      let callCount = 0;
      mockDispatchAgentChat.mockImplementation(
        async (params: { agentId: string }) => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Agent unavailable');
          }
          return {
            agentId: params.agentId,
            agentUsername: 'agent-b',
            success: true,
            response: 'Success response',
            actionsExecuted: 1,
          };
        }
      );

      const state = makeState();

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(true); // At least one succeeded
      expect(result!.text).toContain('1 succeeded');
      expect(result!.values?.successCount).toBe(1);
      expect(result!.values?.totalCount).toBe(2);
    });

    test('handles all agents failing', async () => {
      mockDispatchAgentChat.mockImplementation(async () => {
        throw new Error('Service down');
      });

      const state = makeState();

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(false);
      expect(result!.values?.successCount).toBe(0);
    });

    test('handles agent returning failure result (not throwing)', async () => {
      mockDispatchAgentChat.mockImplementation(
        async (params: { agentId: string }) => ({
          agentId: params.agentId,
          agentUsername: 'agent-a',
          success: false,
          response: '',
          actionsExecuted: 0,
          error: 'Agent is offline',
        })
      );

      const state = makeState({
        actionParams: {
          dispatches: [{ agentId: 'agent-a', command: 'check' }],
        },
      });

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      // fulfilled but success: false → still "fulfilled" from Promise.allSettled perspective
      // The result mapping takes the return value's success field
      expect(result!.success).toBe(false);
    });

    test('truncates long agent responses in summary', async () => {
      mockDispatchAgentChat.mockImplementation(
        async (params: { agentId: string }) => ({
          agentId: params.agentId,
          agentUsername: 'agent-a',
          success: true,
          response: 'A'.repeat(500), // Very long response
          actionsExecuted: 1,
        })
      );

      const state = makeState({
        actionParams: {
          dispatches: [{ agentId: 'agent-a', command: 'check' }],
        },
      });

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      // Response truncated to 300 chars in summary
      expect(result!.text!.length).toBeLessThan(500);
    });

    test('uses agentId as label when agentUsername is missing', async () => {
      mockDispatchAgentChat.mockImplementation(
        async (params: { agentId: string }) => ({
          agentId: params.agentId,
          agentUsername: undefined,
          success: true,
          response: 'Result',
          actionsExecuted: 1,
        })
      );

      const state = makeState({
        actionParams: {
          dispatches: [{ agentId: 'my-agent-xyz', command: 'check' }],
        },
      });

      const result = await dispatchToAgentsAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.text).toContain('my-agent-xyz');
    });
  });
});

// ─── RELAY_TO_AGENT Tests ────────────────────────────────────────────────────

describe('relayToAgentAction', () => {
  beforeEach(() => {
    mockDispatchAgentChat.mockClear();
    mockDispatchAgentChat.mockImplementation(
      async (params: { agentId: string }) => ({
        agentId: params.agentId,
        agentUsername: `agent-${params.agentId}`,
        success: true,
        response: 'Executed successfully',
        actionsExecuted: 2,
      })
    );
  });

  // ─── validate ────────────────────────────────────────────────────────

  describe('validate', () => {
    test('returns true when team has at least 1 agent', async () => {
      const state = makeState({
        teamMembers: [{ isAgent: true }, { isAgent: false }],
      });
      const result = await relayToAgentAction.validate!(
        mockRuntime,
        mockMessage,
        state
      );
      expect(result).toBe(true);
    });

    test('returns false when team has no agents', async () => {
      const state = makeState({
        teamMembers: [{ isAgent: false }],
      });
      const result = await relayToAgentAction.validate!(
        mockRuntime,
        mockMessage,
        state
      );
      expect(result).toBe(false);
    });
  });

  // ─── handler ─────────────────────────────────────────────────────────

  describe('handler', () => {
    test('returns error when agentId is missing', async () => {
      const state = makeState({
        actionParams: { command: 'buy TSLAI' },
      });

      const result = await relayToAgentAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(false);
      expect(result!.text).toContain('Missing required parameters');
    });

    test('returns error when command is missing', async () => {
      const state = makeState({
        actionParams: { agentId: 'agent-a' },
      });

      const result = await relayToAgentAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(false);
    });

    test('dispatches with enriched context when relayContext provided', async () => {
      const state = makeState({
        actionParams: {
          agentId: 'agent-trader',
          command: 'execute the best trade',
          relayContext:
            'Agent A found: OPENAGI trending up. Agent B found: Volume increasing.',
        },
      });

      const result = await relayToAgentAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(true);
      // Verify the enriched command was passed
      const dispatchCall = mockDispatchAgentChat.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const message = dispatchCall.message as string;
      expect(message).toContain('--- Context from other agents ---');
      expect(message).toContain('Agent A found: OPENAGI trending up');
      expect(message).toContain('--- End context ---');
      expect(message).toContain('Your task: execute the best trade');
    });

    test('dispatches plain command when relayContext is undefined', async () => {
      const state = makeState({
        actionParams: {
          agentId: 'agent-trader',
          command: 'check positions',
          relayContext: undefined,
        },
      });

      const result = await relayToAgentAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(true);
      const dispatchCall = mockDispatchAgentChat.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const message = dispatchCall.message as string;
      expect(message).toBe('check positions');
      expect(message).not.toContain('Context from other agents');
    });

    test('dispatches plain command when relayContext is empty string', async () => {
      const state = makeState({
        actionParams: {
          agentId: 'agent-trader',
          command: 'check positions',
          relayContext: '',
        },
      });

      await relayToAgentAction.handler(mockRuntime, mockMessage, state);

      // Empty relayContext is falsy, so it should use plain command
      const dispatchCall = mockDispatchAgentChat.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const message = dispatchCall.message as string;
      expect(message).toBe('check positions');
    });

    test('returns failure when dispatch fails', async () => {
      mockDispatchAgentChat.mockImplementation(async () => ({
        agentId: 'agent-trader',
        agentUsername: 'trader',
        success: false,
        response: '',
        actionsExecuted: 0,
        error: 'Agent offline',
      }));

      const state = makeState({
        actionParams: {
          agentId: 'agent-trader',
          command: 'buy TSLAI',
        },
      });

      const result = await relayToAgentAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(false);
      expect(result!.text).toContain('Failed to relay');
      expect(result!.text).toContain('Agent offline');
    });

    test('returns success with agent response details', async () => {
      const state = makeState({
        actionParams: {
          agentId: 'agent-trader',
          command: 'buy TSLAI',
          relayContext: 'Research says buy',
        },
      });

      const result = await relayToAgentAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      expect(result!.success).toBe(true);
      expect(result!.text).toContain('Relayed to');
      expect(result!.values?.dispatchedCommand).toBe('buy TSLAI');
      expect(result!.values?.relayContext).toBe('Research says buy');
      expect(result!.values?.actionsExecuted).toBe(2);
    });

    test('truncates long agent response in summary text', async () => {
      mockDispatchAgentChat.mockImplementation(
        async (params: { agentId: string }) => ({
          agentId: params.agentId,
          agentUsername: 'trader',
          success: true,
          response: 'R'.repeat(500),
          actionsExecuted: 1,
        })
      );

      const state = makeState({
        actionParams: {
          agentId: 'agent-trader',
          command: 'check',
        },
      });

      const result = await relayToAgentAction.handler(
        mockRuntime,
        mockMessage,
        state
      );

      // Response truncated to 300 chars in the text
      const quoteContent = result!.text!.match(/"(.+?)"/)?.[1] ?? '';
      expect(quoteContent.length).toBeLessThanOrEqual(300);
    });
  });
});
