
import { mock } from 'bun:test';

// Mock LLM client for game tick tests
// This avoids hitting real APIs during tests which causes timeouts and flakes
mock.module('@/generator/llm/openai-client', () => {
  return {
    BabylonLLMClient: {
      forGameTick: () => ({
        getStats: () => ({ provider: 'mock', model: 'mock-model' }),
        generateJSON: async (prompt: string, schema: any, options: any) => {
          // Return mock responses based on schema properties
          if (schema.properties.question) {
            return {
              question: "Will testing succeed?",
              resolutionCriteria: "If tests pass"
            };
          }
          if (schema.properties.npcId) {
            // Market decision mock
            // This needs to match the expected output for MarketDecisionEngine
            return [
              {
                npcId: "test-npc",
                npcName: "Test NPC",
                reasoning: "Mock reasoning",
                action: "hold",
                confidence: 0.5
              }
            ];
          }
          if (schema.properties.title) {
            // Article mock
            return {
              title: "Mock Article",
              summary: "This is a mock article summary.",
              article: "This is a mock article body.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph."
            };
          }
          if (schema.properties.post) {
            // Post mock
            return {
              post: "This is a mock post content."
            };
          }
          return {};
        },
        complete: async () => "Mock completion response"
      }),
      forGroq: () => ({ /* same mock */ }),
      forClaude: () => ({ /* same mock */ }),
      forOpenAI: () => ({ /* same mock */ })
    }
  };
});

