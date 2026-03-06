// @ts-nocheck — Test file uses heavily mocked dependencies with loose typing
/**
 * Integration Tests for Coordinator Route
 *
 * Tests the POST handler end-to-end with mocked dependencies.
 * Exercises: greeting fast-path, action fast-path, full LLM decision loop,
 * and error cases.
 *
 * Coverage:
 * - Greeting fast-path: 0 LLM calls, canned response, correct DB write
 * - Action fast-path: 1 LLM call (summary only), skips decision loop
 * - Full decision loop: LLM decides action, executes, then summarizes
 * - LLM parse failure: returns fallback response with isLLMFailure=true
 * - Input validation: blocks unsafe content
 * - Rate limiting: returns 429
 * - Auth failure: returns error
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// ─── Mocks — set up before dynamic import ──────────────────────────────────

const mockAuthenticateUser = mock(async () => ({ id: 'user-001' }));
const mockBroadcastChatMessage = mock(async () => undefined);
const mockCheckRateLimitAsync = mock(async () => ({
  allowed: true,
  retryAfter: null,
}));
const mockWithErrorHandling = mock((handler: Function) => handler);

mock.module('@babylon/api', () => ({
  authenticateUser: mockAuthenticateUser,
  broadcastChatMessage: mockBroadcastChatMessage,
  checkRateLimitAsync: mockCheckRateLimitAsync,
  RATE_LIMIT_CONFIGS: { SEND_MESSAGE: 'send_message' },
  withErrorHandling: mockWithErrorHandling,
}));

const mockCheckUserInput = mock(() => ({ safe: true }));
const mockGenerateSnowflakeId = mock(async () => 'snowflake-001');
const mockLogger = {
  info: mock(),
  warn: mock(),
  error: mock(),
  debug: mock(),
};

// Mock Logger class — needed by transitive imports when running with other test files
class MockLoggerClass {
  level = 'info';
  info = mock();
  warn = mock();
  error = mock();
  debug = mock();
  setLevel() {}
}

mock.module('@babylon/shared', () => ({
  checkUserInput: mockCheckUserInput,
  generateSnowflakeId: mockGenerateSnowflakeId,
  logger: mockLogger,
  Logger: MockLoggerClass,
  COORDINATOR_SENDER_ID: 'coordinator-id',
  GROQ_MODELS: { FREE: { displayName: 'llama-3.3-70b' } },
  MessageTypeEnum: { COORDINATOR: 'coordinator' },
}));

// DB mock: select().from().where().limit() chain for user profile
// and insert().values() for saving messages
const mockLimit = mock(async () => [
  { displayName: 'Alice', username: 'alice' },
]);
const mockWhere = mock(() => ({ limit: mockLimit }));
const mockFrom = mock(() => ({ where: mockWhere }));
const mockSelect = mock(() => ({ from: mockFrom }));
const mockInsertValues = mock(async () => []);
const mockInsert = mock(() => ({ values: mockInsertValues }));

mock.module('@babylon/db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mock(() => ({
      set: mock(() => ({ where: mock(async () => []) })),
    })),
  },
  eq: () => 'eq-condition',
  and: (...args: unknown[]) => args,
  messages: { id: 'messages' },
  users: {
    id: 'users.id',
    displayName: 'users.displayName',
    username: 'users.username',
  },
  userAgentConfigs: { userId: 'userAgentConfigs.userId' },
  chatParticipants: {
    chatId: 'chatParticipants.chatId',
    userId: 'chatParticipants.userId',
    isActive: 'chatParticipants.isActive',
  },
}));

const mockValidateTeamChatOwnership = mock(async () => true);
const mockTeamChatService = {
  validateTeamChatOwnership: mockValidateTeamChatOwnership,
};

// Runtime mock
const mockComposeState = mock(async () => ({
  values: { agentCount: 1, teamMembers: '' },
  data: {},
}));
const mockUseModel = mock(async () => '');
const mockProcessActions = mock(async () => undefined);
const mockProviders = [
  { name: 'DISPATCH_HISTORY', get: mock(async () => ({ values: {} })) },
];
const mockRuntime = {
  agentId: 'coordinator-runtime-id',
  composeState: mockComposeState,
  useModel: mockUseModel,
  processActions: mockProcessActions,
  providers: mockProviders,
  stateCache: new Map(),
};
const mockGetCoordinatorRuntime = mock(async () => mockRuntime);

mock.module('@babylon/agents', () => ({
  agentRuntimeManager: { getCoordinatorRuntime: mockGetCoordinatorRuntime },
  teamChatService: mockTeamChatService,
}));

const mockComposePromptFromState = mock(() => 'COMPOSED_PROMPT');
const mockParseKeyValueXml =
  mock<(text: string) => Record<string, unknown> | null>();

mock.module('@elizaos/core', () => ({
  composePromptFromState: mockComposePromptFromState,
  parseKeyValueXml: mockParseKeyValueXml,
  ModelType: { TEXT_SMALL: 'text_small' },
}));

mock.module('uuid', () => ({
  v4: () => '00000000-0000-0000-0000-000000000001',
}));

// NextResponse mock — bun can't import next/server in test, so we mock it
class MockNextResponse {
  static json(
    body: unknown,
    init?: { status?: number; headers?: Record<string, string> }
  ) {
    return { body, status: init?.status ?? 200, headers: init?.headers ?? {} };
  }
}
mock.module('next/server', () => ({
  NextResponse: MockNextResponse,
}));

// ─── Import after all mocks ────────────────────────────────────────────────

const { POST } = await import('./route');

// ─── Types for mock response ────────────────────────────────────────────────

interface MockResponse {
  body: Record<string, unknown>;
  status: number;
  headers: Record<string, string>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(content: string, teamChatId = 'chat-001') {
  return {
    json: async () => ({ content, teamChatId }),
    headers: new Headers(),
  } as unknown;
}

// ─── Reset ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockAuthenticateUser.mockClear();
  mockAuthenticateUser.mockResolvedValue({ id: 'user-001' });
  mockBroadcastChatMessage.mockClear();
  mockBroadcastChatMessage.mockResolvedValue(undefined);
  mockCheckRateLimitAsync.mockClear();
  mockCheckRateLimitAsync.mockResolvedValue({
    allowed: true,
    retryAfter: null,
  });
  mockCheckUserInput.mockClear();
  mockCheckUserInput.mockReturnValue({ safe: true });
  mockValidateTeamChatOwnership.mockClear();
  mockValidateTeamChatOwnership.mockResolvedValue(true);
  mockGenerateSnowflakeId.mockClear();
  mockGenerateSnowflakeId.mockResolvedValue('snowflake-001');
  mockLimit.mockClear();
  mockLimit.mockResolvedValue([{ displayName: 'Alice', username: 'alice' }]);
  mockInsertValues.mockClear();
  mockInsertValues.mockResolvedValue([]);
  mockComposeState.mockClear();
  mockComposeState.mockResolvedValue({
    values: { agentCount: 1, teamMembers: '' },
    data: {},
  });
  mockUseModel.mockClear();
  mockParseKeyValueXml.mockClear();
  mockProcessActions.mockClear();
  mockProcessActions.mockResolvedValue(undefined);
  mockGetCoordinatorRuntime.mockClear();
  mockGetCoordinatorRuntime.mockResolvedValue(mockRuntime);
  mockRuntime.stateCache = new Map();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
});

afterEach(() => {
  mockUseModel.mockReset();
  mockParseKeyValueXml.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Coordinator POST', () => {
  // ── Greeting fast-path ──────────────────────────────────────────────────

  describe('greeting fast-path', () => {
    it('returns canned response with 0 LLM calls', async () => {
      const response = await POST(makeRequest('hello'));
      const body = (response as MockResponse).body;

      expect(body.success).toBe(true);
      expect(body.response).toContain('Hey Alice');
      expect(body.fastPath).toBe('greeting');
      expect(body.isLLMFailure).toBe(false);
      expect(body.pointsCost).toBe(0);
      // 0 LLM calls
      expect(mockUseModel).not.toHaveBeenCalled();
      expect(mockComposeState).not.toHaveBeenCalled();
    });

    it('saves greeting response to DB', async () => {
      await POST(makeRequest('hi'));

      expect(mockInsertValues).toHaveBeenCalledTimes(1);
      const insertCall = mockInsertValues.mock
        .calls[0]![0] as unknown as Record<string, unknown>;
      expect(insertCall.senderId).toBe('coordinator-id');
      expect(insertCall.type).toBe('coordinator');
      expect(insertCall.content as string).toContain('Hey Alice');
    });

    it('broadcasts greeting via broadcastChatMessage', async () => {
      await POST(makeRequest('gm'));

      expect(mockBroadcastChatMessage).toHaveBeenCalledTimes(1);
      const [chatId, msg] = mockBroadcastChatMessage.mock.calls[0]!;
      expect(chatId).toBe('chat-001');
      expect((msg as Record<string, unknown>).content).toContain('Hey Alice');
    });
  });

  // ── Action fast-path ────────────────────────────────────────────────────

  describe('action fast-path', () => {
    it('skips decision loop and executes action directly for price query', async () => {
      // processActions succeeds
      mockProcessActions.mockImplementation(
        async (_m: unknown, _a: unknown, _s: unknown, cb: Function) => {
          await cb([
            { content: { success: true, text: 'TSLAI: $150.23 (+3.2%)' } },
          ]);
        }
      );

      // Summary LLM call
      mockUseModel.mockResolvedValueOnce('SUMMARY_RESP');
      mockParseKeyValueXml.mockReturnValueOnce({
        thought: 'summarizing',
        text: 'TSLAI is currently at $150.23, up 3.2% today.',
      });

      const response = await POST(makeRequest('TSLAI price'));
      const body = (response as MockResponse).body;

      expect(body.success).toBe(true);
      expect(body.fastPath).toBe('CHECK_PERPS');
      expect(body.response).toBe(
        'TSLAI is currently at $150.23, up 3.2% today.'
      );
      // Only 1 LLM call (summary), not 2+ (decision + summary)
      expect(mockUseModel).toHaveBeenCalledTimes(1);
      // processActions was called (action executed)
      expect(mockProcessActions).toHaveBeenCalledTimes(1);
    });

    it('passes correct action name to processActions for portfolio query', async () => {
      mockProcessActions.mockImplementation(
        async (_m: unknown, acts: unknown, _s: unknown, cb: Function) => {
          await cb([{ content: { success: true, text: 'PnL: +$500' } }]);
        }
      );
      mockUseModel.mockResolvedValueOnce('SUM');
      mockParseKeyValueXml.mockReturnValueOnce({
        thought: 'done',
        text: 'Your portfolio is up $500.',
      });

      await POST(makeRequest('show my portfolio'));

      // Verify the action message passed to processActions
      const actionMessages = mockProcessActions.mock.calls[0]![1] as Array<{
        content: { actions: string[] };
      }>;
      expect(actionMessages[0].content.actions).toEqual(['CHECK_USER_PNL']);
    });

    it('handles action execution failure gracefully', async () => {
      mockProcessActions.mockImplementation(
        async (_m: unknown, _acts: unknown, _s: unknown, cb: Function) => {
          await cb([
            { content: { success: false, text: 'Market data unavailable' } },
          ]);
        }
      );
      mockUseModel.mockResolvedValueOnce('SUM');
      mockParseKeyValueXml.mockReturnValueOnce({
        thought: 'action failed',
        text: 'Sorry, market data is temporarily unavailable.',
      });

      const res = await POST(makeRequest('TSLAI price'));
      const body = (res as MockResponse).body;
      expect(body.success).toBe(true);
      expect(body.response).toBe(
        'Sorry, market data is temporarily unavailable.'
      );
    });
  });

  // ── Full LLM decision loop ──────────────────────────────────────────────

  describe('full LLM decision loop', () => {
    it('uses LLM to decide action when no fast-path matches', async () => {
      // Decision: no action, finish immediately
      mockUseModel
        .mockResolvedValueOnce('DECISION_RESP')
        .mockResolvedValueOnce('SUMMARY_RESP');
      mockParseKeyValueXml
        .mockReturnValueOnce({
          thought: 'user wants help',
          action: '',
          parameters: {},
          isFinish: 'true',
        })
        .mockReturnValueOnce({
          thought: 'answering',
          text: 'Babylon is a social prediction market platform.',
        });

      const response = await POST(makeRequest('what is Babylon?'));
      const body = (response as MockResponse).body;

      expect(body.success).toBe(true);
      expect(body.response).toBe(
        'Babylon is a social prediction market platform.'
      );
      // No fast-path
      expect(body.fastPath).toBeUndefined();
      // 2 LLM calls: decision + summary
      expect(mockUseModel).toHaveBeenCalledTimes(2);
    });

    it('executes action chosen by LLM in decision loop', async () => {
      // Decision: execute CHECK_PERPS, then finish
      mockUseModel
        .mockResolvedValueOnce('DEC_ACTION')
        .mockResolvedValueOnce('DEC_FINISH')
        .mockResolvedValueOnce('SUMMARY');
      mockParseKeyValueXml
        .mockReturnValueOnce({
          thought: 'check market',
          action: 'CHECK_PERPS',
          parameters: { ticker: 'NVDAI' },
          isFinish: 'false',
        })
        .mockReturnValueOnce({
          thought: 'done',
          action: '',
          parameters: {},
          isFinish: 'true',
        })
        .mockReturnValueOnce({
          thought: 'summarize',
          text: 'NVDAI is at $200.',
        });

      mockProcessActions.mockImplementation(
        async (_m: unknown, _a: unknown, _s: unknown, cb: Function) => {
          await cb([{ content: { success: true, text: 'NVDAI: $200' } }]);
        }
      );

      const response = await POST(
        makeRequest('how is the NVDAI doing overall')
      );
      const body = (response as MockResponse).body;

      expect(body.success).toBe(true);
      expect(body.response).toBe('NVDAI is at $200.');
      expect(mockProcessActions).toHaveBeenCalledTimes(1);
    });
  });

  // ── LLM failure ─────────────────────────────────────────────────────────

  describe('LLM parse failure', () => {
    it('returns fallback response when all parse attempts fail', async () => {
      // All LLM responses unparseable
      mockUseModel.mockResolvedValue('UNPARSEABLE');
      mockParseKeyValueXml.mockReturnValue(null);

      const response = await POST(makeRequest('what is Babylon?'));
      const body = (response as MockResponse).body;

      expect(body.success).toBe(true);
      expect(body.isLLMFailure).toBe(true);
      expect(body.response).toBeDefined();
      expect(body.response.length).toBeGreaterThan(0);
    });
  });

  // ── Input validation ────────────────────────────────────────────────────

  describe('input validation', () => {
    it('blocks unsafe content with 400', async () => {
      mockCheckUserInput.mockReturnValue({
        safe: false,
        reason: 'Injection detected',
        category: 'injection',
      });

      const response = await POST(makeRequest('malicious input'));
      const body = (response as MockResponse).body;
      const status = (response as MockResponse).status;

      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Injection detected');
      // No runtime calls
      expect(mockGetCoordinatorRuntime).not.toHaveBeenCalled();
    });
  });

  // ── Rate limiting ───────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('returns 429 when rate limited', async () => {
      mockCheckRateLimitAsync.mockResolvedValue({
        allowed: false,
        retryAfter: 30,
      });

      const response = await POST(makeRequest('hello'));
      const body = (response as MockResponse).body;
      const status = (response as MockResponse).status;

      expect(status).toBe(429);
      expect(body.success).toBe(false);
      // No runtime calls
      expect(mockGetCoordinatorRuntime).not.toHaveBeenCalled();
    });
  });

  // ── Team chat ownership ─────────────────────────────────────────────────

  describe('team chat validation', () => {
    it('returns 403 when user does not own team chat', async () => {
      mockValidateTeamChatOwnership.mockResolvedValue(false);

      const response = await POST(makeRequest('hello'));
      const body = (response as MockResponse).body;
      const status = (response as MockResponse).status;

      expect(status).toBe(403);
      expect(body.success).toBe(false);
      expect(mockGetCoordinatorRuntime).not.toHaveBeenCalled();
    });
  });

  // ── Summary fallback ───────────────────────────────────────────────────

  describe('summary fallback', () => {
    it('falls back to regex extraction when parseKeyValueXml fails for summary', async () => {
      // Decision: no action, finish
      mockUseModel
        .mockResolvedValueOnce('DEC')
        .mockResolvedValueOnce(
          '<response><thought>ok</thought><text>Here is your data.</text></response>'
        );
      mockParseKeyValueXml
        .mockReturnValueOnce({
          thought: 'done',
          action: '',
          parameters: {},
          isFinish: 'true',
        })
        .mockReturnValue(null); // summary XML parse fails

      const response = await POST(makeRequest('what is Babylon?'));
      const body = (response as MockResponse).body;

      // Regex fallback extracts text from <text>...</text>
      expect(body.success).toBe(true);
      expect(body.response).toBe('Here is your data.');
    });
  });
});
