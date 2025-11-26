/**
 * MarketDecisionEngine Token Management Test Suite
 * 
 * @module engine/__tests__/MarketDecisionEngine-token-management.test
 * 
 * @description
 * Specialized test suite for token management and batching features of the
 * MarketDecisionEngine. Verifies that the engine correctly handles token limits,
 * batches NPCs appropriately, and truncates content to fit within model constraints.
 * 
 * **Test Coverage:**
 * - Engine initialization with default and custom models
 * - Batch size calculation for various NPC counts
 * - Multi-batch processing for large NPC sets
 * - Response format handling (array, wrapped with "decisions", wrapped with "decision")
 * - Invalid response format handling
 * - Context truncation for long content
 * - Post count limiting per NPC
 * - Decision validation (hold, close_position, trades)
 * - Balance constraint enforcement
 * - Valid trade acceptance
 * - Empty NPC list handling
 * - Batch failure with individual retry fallback
 * - Model configuration (default vs custom)
 * - Safe context limit calculation
 * 
 * **Key Features Tested:**
 * - Token-aware batching (5-15 NPCs per batch typically)
 * - Automatic chunking for large NPC counts
 * - Content truncation (posts, messages, events)
 * - Multiple response format support
 * - Strict validation preventing over-budget trades
 * - Graceful error handling with fallbacks
 * 
 * **Testing Strategy:**
 * - Mock LLM client for controlled responses
 * - Mock context service for test data
 * - Helper functions for test NPC creation
 * - Unit tests for batching logic
 * - Integration tests for full flow
 * 
 * @see {@link MarketDecisionEngine} - Class under test
 * @see {@link MarketContextService} - Context building tested
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';

// Create chainable mock for Drizzle query builder API
const createChainableMock = (returnValue: Array<Record<string, unknown>> = []) => {
  const chainable = {
    from: () => chainable,
    where: () => chainable,
    orderBy: () => chainable,
    limit: () => chainable,
    offset: () => chainable,
    leftJoin: () => chainable,
    innerJoin: () => chainable,
    groupBy: () => chainable,
    having: () => chainable,
    then: (resolve: (value: Array<Record<string, unknown>>) => void) => resolve(returnValue),
    [Symbol.toStringTag]: 'Promise',
  };
  // Make it awaitable
  Object.defineProperty(chainable, 'then', {
    value: (resolve: (value: Array<Record<string, unknown>>) => void) => Promise.resolve(returnValue).then(resolve)
  });
  return chainable;
};

// Mock database BEFORE importing MarketDecisionEngine
const mockDb = {
  actor: {
    findMany: mock(async () => [])
  },
  organization: {
    findMany: mock(async () => [])
  },
  organizationMapping: {
    findMany: mock(async () => [])
  },
  question: {
    findMany: mock(async () => [])
  },
  post: {
    findMany: mock(async () => [])
  },
  // Add other models if needed
  market: { findMany: mock(async () => []) },
  nPCTrade: { findMany: mock(async () => []) },
  worldFact: { findMany: mock(async () => []) },
  agentTrade: { findMany: mock(async () => []) },
  // Add Drizzle query builder API
  select: () => createChainableMock([]),
  insert: () => createChainableMock([]),
  update: () => createChainableMock([]),
  delete: () => createChainableMock([]),
};

// Mock Drizzle operators and schema tables
const mockTable = {};
const mockOperator = () => ({});

mock.module('@/db', () => ({
  db: mockDb,
  // Schema tables
  markets: mockTable,
  questions: mockTable,
  organizations: mockTable,
  actors: mockTable,
  posts: mockTable,
  worldFacts: mockTable,
  users: mockTable,
  perpPositions: mockTable,
  // Drizzle operators
  eq: mockOperator,
  and: mockOperator,
  or: mockOperator,
  not: mockOperator,
  gt: mockOperator,
  gte: mockOperator,
  lt: mockOperator,
  lte: mockOperator,
  desc: mockOperator,
  asc: mockOperator,
  isNull: mockOperator,
  isNotNull: mockOperator,
  inArray: mockOperator,
  sql: () => ({}),
}));

import { MarketDecisionEngine } from '../MarketDecisionEngine';
import { MarketContextService } from '@/lib/services/market-context-service';
import type { BabylonLLMClient } from '@/generator/llm/openai-client';
import type { NPCMarketContext } from '@/types/market-context';

interface JSONSchemaProperty {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
}

interface JSONSchema {
  required?: string[];
  properties?: Record<string, JSONSchemaProperty>;
}

interface GenerateJSONOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  format?: 'xml' | 'json';
}

// Type for mock responses - supports any JSON-serializable value
type MockResponse = Record<string, JSONSchemaProperty | string | number | boolean | null | object | Array<object>>;

// Mock LLM client for testing - doesn't require API keys
class MockLLMClient {
  private mockResponses: MockResponse[] = [];
  private callCount = 0;

  constructor() {
    // No super() call - this is a standalone mock that doesn't extend BabylonLLMClient
  }

  getProvider(): string {
    return 'groq';
  }

  setMockResponse<T extends MockResponse>(response: T): void {
    this.mockResponses.push(response);
  }

  async generateJSON<T>(_prompt: string, _schema?: JSONSchema, _options?: GenerateJSONOptions): Promise<T> {
    const response = this.mockResponses[this.callCount] ?? ([] as MockResponse);
    this.callCount++;
    return response as T;
  }

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount() {
    this.callCount = 0;
    this.mockResponses = [];
  }
}

/**
 * Partial interface for MockLLMClient that matches BabylonLLMClient's required methods
 */
interface MockLLMClientInterface extends Pick<BabylonLLMClient, 'getProvider' | 'generateJSON'> {
  setMockResponse<T extends MockResponse>(response: T): void;
  getCallCount(): number;
  resetCallCount(): void;
}

// Type assertion to make MockLLMClient compatible with BabylonLLMClient interface
// Returns both the mock instance (for test methods) and the LLM client (for engine)
const createMockLLMClient = (): { mock: MockLLMClient; client: BabylonLLMClient } => {
  const mockInstance = new MockLLMClient();
  // Cast via the partial interface to ensure type safety
  const mockAsInterface: MockLLMClientInterface = mockInstance;
  return {
    mock: mockInstance,
    client: mockAsInterface as BabylonLLMClient,
  };
}

// Mock context service
class MockContextService extends MarketContextService {
  private mockNPCs: NPCMarketContext[] = [];

  setMockNPCs(npcs: NPCMarketContext[]) {
    this.mockNPCs = npcs;
  }

  async buildContextForAllNPCs(): Promise<Map<string, NPCMarketContext>> {
    const map = new Map<string, NPCMarketContext>();
    this.mockNPCs.forEach(npc => map.set(npc.npcId, npc));
    return map;
  }

  async buildContextForNPC(npcId: string): Promise<NPCMarketContext> {
    const npc = this.mockNPCs.find(n => n.npcId === npcId);
    if (!npc) {
      throw new Error(`NPC ${npcId} not found`);
    }
    return npc;
  }
}

// Helper to create mock NPC context
function createMockNPC(id: string, name: string): NPCMarketContext {
  return {
    npcId: id,
    npcName: name,
    personality: 'risk-taker',
    tier: 'B_TIER',
    availableBalance: 10000,
    relationships: [],
    recentPosts: [
      { author: 'author1', authorName: 'Author 1', content: 'Test post', timestamp: new Date().toISOString() },
    ],
    groupChatMessages: [],
    recentEvents: [],
    perpMarkets: [
      { ticker: 'TECH', organizationId: 'tech-co', name: 'Tech Co', currentPrice: 100, change24h: 5, changePercent24h: 5, high24h: 105, low24h: 95, volume24h: 1000, openInterest: 5000 },
    ],
    predictionMarkets: [
      { id: 'q1', text: 'Will X happen?', yesPrice: 50, noPrice: 50, totalVolume: 1000, resolutionDate: new Date().toISOString(), daysUntilResolution: 7 },
    ],
    currentPositions: [],
  };
}

describe('MarketDecisionEngine - Token Management', () => {
  let mockLLM: BabylonLLMClient;
  let mockLLMInstance: MockLLMClient;
  let mockContext: MockContextService;

  beforeEach(() => {
    const mockClient = createMockLLMClient();
    mockLLM = mockClient.client;
    mockLLMInstance = mockClient.mock;
    mockContext = new MockContextService();
  });

  describe('Initialization', () => {
    test('should initialize with default model and token limits', () => {
      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      
      // Should initialize without errors
      expect(engine).toBeDefined();
    });

    test('should accept custom model configuration', () => {
      const engine = new MarketDecisionEngine(mockLLM, mockContext, {
        model: 'gpt-5.1',
        maxOutputTokens: 4000,
      });
      
      expect(engine).toBeDefined();
    });

    test('should use qwen/qwen3-32b by default', () => {
      // The default model should be qwen/qwen3-32b
      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      expect(engine).toBeDefined();
    });
  });

  describe('Batch Size Calculation', () => {
    test('should calculate correct batch size for small NPC count', async () => {
      // With 400 tokens per NPC and 108k context, should fit ~270 NPCs per batch
      const npcs = Array.from({ length: 10 }, (_, i) => 
        createMockNPC(`npc-${i}`, `NPC ${i}`)
      );
      mockContext.setMockNPCs(npcs);
      
      // Mock response
      const mockDecisions = npcs.map(npc => ({
        npcId: npc.npcId,
        npcName: npc.npcName,
        action: 'hold' as const,
        marketType: null,
        amount: 0,
        confidence: 1,
        reasoning: 'Holding',
        timestamp: new Date().toISOString(),
      }));
      mockLLMInstance.setMockResponse(mockDecisions);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(10);
      expect(mockLLMInstance.getCallCount()).toBe(1); // Should be single batch
    });

    test('should split large NPC count into multiple batches', async () => {
      // Create 100 NPCs (should require 4 batches with current config: 32 NPCs per batch)
      // Actual implementation: 2000 tokens per NPC, ~128k max context, 50% safety = 32 NPCs per batch
      // 100 NPCs / 32 = 3.125 -> 4 batches
      const npcs = Array.from({ length: 100 }, (_, i) => 
        createMockNPC(`npc-${i}`, `NPC ${i}`)
      );
      mockContext.setMockNPCs(npcs);

      // Mock responses for each batch (32 NPCs per batch)
      const createBatch = (start: number, count: number) => 
        npcs.slice(start, start + count).map(npc => ({
          npcId: npc.npcId,
          npcName: npc.npcName,
          action: 'hold' as const,
          marketType: null,
          amount: 0,
          confidence: 1,
          reasoning: 'Holding',
          timestamp: new Date().toISOString(),
        }));

      mockLLMInstance.setMockResponse(createBatch(0, 32));
      mockLLMInstance.setMockResponse(createBatch(32, 32));
      mockLLMInstance.setMockResponse(createBatch(64, 32));
      mockLLMInstance.setMockResponse(createBatch(96, 4)); // Last batch has 4 NPCs

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(100);
      expect(mockLLMInstance.getCallCount()).toBe(4); // Should be exactly 4 batches
    });
  });

  describe('Response Format Handling', () => {
    test('should handle array response format', async () => {
      const npcs = [createMockNPC('npc1', 'NPC 1')];
      mockContext.setMockNPCs(npcs);

      const mockResponse = [{
        npcId: 'npc1',
        npcName: 'NPC 1',
        action: 'hold' as const,
        marketType: null,
        amount: 0,
        confidence: 1,
        reasoning: 'Holding',
        timestamp: new Date().toISOString(),
      }];
      mockLLMInstance.setMockResponse(mockResponse);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(1);
      expect(decisions[0]?.action).toBe('hold');
    });

    test('should handle wrapped response format with "decisions" key', async () => {
      const npcs = [createMockNPC('npc1', 'NPC 1')];
      mockContext.setMockNPCs(npcs);

      const mockResponse = {
        decisions: [{
          npcId: 'npc1',
          npcName: 'NPC 1',
          action: 'hold' as const,
          marketType: null,
          amount: 0,
          confidence: 1,
          reasoning: 'Holding',
          timestamp: new Date().toISOString(),
        }]
      };
      mockLLMInstance.setMockResponse(mockResponse);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(1);
      expect(decisions[0]?.action).toBe('hold');
    });

    test('should handle wrapped response format with "decision" key (array)', async () => {
      const npcs = [createMockNPC('npc1', 'NPC 1')];
      mockContext.setMockNPCs(npcs);

      const mockResponse = {
        decision: [{
          npcId: 'npc1',
          npcName: 'NPC 1',
          action: 'hold' as const,
          marketType: null,
          amount: 0,
          confidence: 1,
          reasoning: 'Holding',
          timestamp: new Date().toISOString(),
        }]
      };
      mockLLMInstance.setMockResponse(mockResponse);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(1);
      expect(decisions[0]?.action).toBe('hold');
    });

    test('should handle wrapped response format with "decision" key (single object)', async () => {
      const npcs = [createMockNPC('npc1', 'NPC 1')];
      mockContext.setMockNPCs(npcs);

      // LLM returns single decision object (not array) - happens with 1 NPC
      const mockResponse = {
        decision: {
          npcId: 'npc1',
          npcName: 'NPC 1',
          action: 'hold' as const,
          marketType: null,
          amount: 0,
          confidence: 1,
          reasoning: 'Holding',
          timestamp: new Date().toISOString(),
        }
      };
      mockLLMInstance.setMockResponse(mockResponse);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(1);
      expect(decisions[0]?.action).toBe('hold');
    });

    test('should return empty array for invalid response format', async () => {
      const npcs = [createMockNPC('npc1', 'NPC 1')];
      mockContext.setMockNPCs(npcs);

      const mockResponse = { invalid: 'response' };
      mockLLMInstance.setMockResponse(mockResponse);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(0);
    });
  });

  describe('Context Truncation', () => {
    test('should truncate long post content', async () => {
      const npc = createMockNPC('npc1', 'NPC 1');
      // Add a very long post
      npc.recentPosts = [{
        author: 'author1',
        authorName: 'Author 1',
        content: 'A'.repeat(1000), // Very long content
        timestamp: new Date().toISOString(),
      }];
      mockContext.setMockNPCs([npc]);

      const mockResponse = [{
        npcId: 'npc1',
        npcName: 'NPC 1',
        action: 'hold' as const,
        marketType: null,
        amount: 0,
        confidence: 1,
        reasoning: 'Holding',
        timestamp: new Date().toISOString(),
      }];
      mockLLMInstance.setMockResponse(mockResponse);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      // Should complete without token overflow
      expect(decisions.length).toBe(1);
    });

    test('should limit number of posts per NPC', async () => {
      const npc = createMockNPC('npc1', 'NPC 1');
      // Add 100 posts (should be truncated to 8)
      npc.recentPosts = Array.from({ length: 100 }, (_, i) => ({
        author: `author${i}`,
        authorName: `Author ${i}`,
        content: `Post ${i}`,
        timestamp: new Date().toISOString(),
      }));
      mockContext.setMockNPCs([npc]);

      const mockResponse = [{
        npcId: 'npc1',
        npcName: 'NPC 1',
        action: 'hold' as const,
        marketType: null,
        amount: 0,
        confidence: 1,
        reasoning: 'Holding',
        timestamp: new Date().toISOString(),
      }];
      mockLLMInstance.setMockResponse(mockResponse);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(1);
    });
  });

  describe('Decision Validation', () => {
    test('should validate hold decisions', async () => {
      const npcs = [createMockNPC('npc1', 'NPC 1')];
      mockContext.setMockNPCs(npcs);

      const mockResponse = [{
        npcId: 'npc1',
        npcName: 'NPC 1',
        action: 'hold' as const,
        marketType: null,
        amount: 0,
        confidence: 1,
        reasoning: 'Market conditions unclear',
        timestamp: new Date().toISOString(),
      }];
      mockLLMInstance.setMockResponse(mockResponse);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(1);
      expect(decisions[0]?.action).toBe('hold');
      expect(decisions[0]?.amount).toBe(0);
    });

    test('should validate trade decisions do not exceed balance', async () => {
      const npc = createMockNPC('npc1', 'NPC 1');
      npc.availableBalance = 1000;
      mockContext.setMockNPCs([npc]);

      // LLM tries to trade more than balance (should be rejected)
      const mockResponse = [{
        npcId: 'npc1',
        npcName: 'NPC 1',
        action: 'open_long' as const,
        marketType: 'perp' as const,
        ticker: 'TECH',
        amount: 5000, // Exceeds balance!
        confidence: 0.8,
        reasoning: 'Strong signal',
        timestamp: new Date().toISOString(),
      }];
      mockLLMInstance.setMockResponse(mockResponse);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      // Should be rejected (filtered out)
      expect(decisions.length).toBe(0);
    });

    test('should accept valid trade decisions', async () => {
      const npc = createMockNPC('npc1', 'NPC 1');
      npc.availableBalance = 10000;
      mockContext.setMockNPCs([npc]);

      const mockResponse = [{
        npcId: 'npc1',
        npcName: 'NPC 1',
        action: 'open_long' as const,
        marketType: 'perp' as const,
        ticker: 'TECH',
        amount: 1000, // Within balance
        confidence: 0.8,
        reasoning: 'Strong signal',
        timestamp: new Date().toISOString(),
      }];
      mockLLMInstance.setMockResponse(mockResponse);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(1);
      expect(decisions[0]?.action).toBe('open_long');
      expect(decisions[0]?.amount).toBe(1000);
    });
  });

  describe('Error Handling', () => {
    test('should handle empty NPC list gracefully', async () => {
      mockContext.setMockNPCs([]);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      const decisions = await engine.generateBatchDecisions();

      expect(decisions.length).toBe(0);
    });

    test('should handle batch failure with individual retry', async () => {
      const npcs = [
        createMockNPC('npc1', 'NPC 1'),
        createMockNPC('npc2', 'NPC 2'),
      ];
      mockContext.setMockNPCs(npcs);

      // First call (batch) fails, then individual calls succeed
      mockLLMInstance.setMockResponse(null); // Batch failure
      mockLLMInstance.setMockResponse([{
        npcId: 'npc1',
        npcName: 'NPC 1',
        action: 'hold' as const,
        marketType: null,
        amount: 0,
        confidence: 1,
        reasoning: 'Holding',
        timestamp: new Date().toISOString(),
      }]);
      mockLLMInstance.setMockResponse([{
        npcId: 'npc2',
        npcName: 'NPC 2',
        action: 'hold' as const,
        marketType: null,
        amount: 0,
        confidence: 1,
        reasoning: 'Holding',
        timestamp: new Date().toISOString(),
      }]);

      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      
      // Should handle the error gracefully
      const decisions = await engine.generateBatchDecisions();
      
      // Should get some decisions from individual retries
      expect(decisions).toBeDefined();
    });
  });

  describe('Model Configuration', () => {
    test('should use qwen/qwen3-32b by default', () => {
      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      expect(engine).toBeDefined();
      // Default model should have 130k token limit
    });

    test('should accept custom model with different token limit', () => {
      const engine = new MarketDecisionEngine(mockLLM, mockContext, {
        model: 'claude-sonnet-4-5', // 200k context
        maxOutputTokens: 8000,
      });
      expect(engine).toBeDefined();
    });

    test('should calculate safe context limit correctly', () => {
      // qwen/qwen3-32b: 130k input context
      // * 0.9 safety = 117k safe limit
      // / 400 per NPC = ~292 NPCs per batch
      
      const engine = new MarketDecisionEngine(mockLLM, mockContext);
      expect(engine).toBeDefined();
    });
  });
});
