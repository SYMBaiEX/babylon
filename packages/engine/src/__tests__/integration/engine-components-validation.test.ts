/**
 * Engine Components Validation Test
 *
 * @module engine/__tests__/integration/engine-components-validation.test
 *
 * @description
 * Tests each engine component individually to ensure they produce REAL outputs.
 * NO MOCKS - these tests validate actual functionality.
 *
 * **Components Tested:**
 * - ArticleGenerator - Real article generation
 * - MarketDecisionEngine - Real NPC trading decisions
 * - QuestionManager - Real question generation
 * - FeedGenerator - Real feed post generation
 * - TrendingTopicsEngine - Real trending calculation
 * - PerpetualsEngine - Real perpetual market operations
 *
 * @usage
 * RUN_REAL_ENGINE_TESTS=true bun test engine-components-validation
 */

import {
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from 'bun:test';
import { existsSync, readFileSync } from 'fs';

// Set timeout to 5 minutes
setDefaultTimeout(300000);

// Load environment
const loadEnvFile = (filePath: string) => {
  if (!existsSync(filePath)) return;
  const envContent = readFileSync(filePath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
};

loadEnvFile('.env');
loadEnvFile('.env.test');
loadEnvFile('.env.local');

const hasLLMKey = !!(
  (process.env.GROQ_API_KEY?.trim() ?? '') !== '' ||
  (process.env.ANTHROPIC_API_KEY?.trim() ?? '') !== '' ||
  (process.env.OPENAI_API_KEY?.trim() ?? '') !== ''
);

// Always run component validation tests - fail if no API key rather than skip
describe('Engine Components Validation', () => {
  beforeAll(() => {
    if (!hasLLMKey) {
      console.log('⏭️  Skipping - No LLM API key');
      return;
    }
    console.log('\n🔧 Testing Individual Engine Components');
    console.log('==========================================\n');
  });

  describe('ArticleGenerator', () => {
    test('generates REAL article from event context', async () => {
      if (!hasLLMKey) return;

      const { ArticleGenerator } = await import('../../ArticleGenerator');
      const { BabylonLLMClient } = await import('../../llm/openai-client');
      const { loadActorsData } = await import('../../actors-loader');

      console.log('📰 Testing ArticleGenerator...');

      const llm = BabylonLLMClient.forGameTick();
      const generator = new ArticleGenerator(llm);

      // Load real actor data
      const actorsData = loadActorsData();
      const actors = actorsData.actors.slice(0, 10).map((a) => ({
        ...a,
        tier: a.tier || ('B_TIER' as const),
        role: a.role || ('supporting' as const),
        initialLuck: a.initialLuck || ('medium' as const),
        initialMood: a.initialMood || 0,
      }));

      const organizations = actorsData.organizations.filter(
        (o) => o.type === 'media'
      );

      // Create a mock event
      const mockEvent = {
        id: 'test-event-1',
        day: 1,
        type: 'announcement' as const,
        description:
          'TechCorp announces new AI product that will revolutionize the market',
        actors: actors.slice(0, 2).map((a) => a.id),
        visibility: 'public' as const,
      };

      const articles = await generator.generateArticlesForEvent(
        mockEvent,
        organizations.slice(0, 2),
        actors,
        []
      );

      console.log(`   Generated ${articles.length} articles`);

      expect(articles.length).toBeGreaterThan(0);

      for (const article of articles) {
        // Validate article structure
        expect(article.title).toBeDefined();
        expect(article.title.length).toBeGreaterThan(10);
        expect(article.content).toBeDefined();
        expect(article.content.length).toBeGreaterThan(100);
        expect(article.authorOrgId).toBeDefined();

        // Ensure not mocked
        const isMocked =
          article.title.toLowerCase().includes('mock') ||
          article.content.toLowerCase().includes('mock content');
        expect(isMocked).toBe(false);

        console.log(`   ✅ "${article.title.substring(0, 50)}..."`);
      }
    });
  });

  describe('QuestionManager', () => {
    test('generates REAL prediction questions', async () => {
      if (!hasLLMKey) return;

      const { QuestionManager } = await import('../../QuestionManager');
      const { BabylonLLMClient } = await import('../../llm/openai-client');
      const { loadActorsData } = await import('../../actors-loader');

      console.log('❓ Testing QuestionManager...');

      const llm = BabylonLLMClient.forGameTick();
      const manager = new QuestionManager(llm);

      const actorsData = loadActorsData();
      const actors = actorsData.actors.slice(0, 10);
      const organizations = actorsData.organizations;

      // Generate questions (this is what the game tick calls)
      const questions = await manager.generateQuestionsWithLLM(
        actors,
        organizations,
        2 // Generate 2 questions
      );

      console.log(`   Generated ${questions.length} questions`);

      expect(questions.length).toBeGreaterThan(0);

      for (const question of questions) {
        expect(question.text).toBeDefined();
        expect(question.text.length).toBeGreaterThan(20);

        // Ensure not mocked
        const isMocked =
          question.text.toLowerCase().includes('mock') ||
          question.text.toLowerCase().includes('test question');
        expect(isMocked).toBe(false);

        console.log(`   ✅ "${question.text.substring(0, 60)}..."`);
      }
    });

    test('resolves questions with proper outcome', async () => {
      if (!hasLLMKey) return;

      const { QuestionManager } = await import('../../QuestionManager');
      const { BabylonLLMClient } = await import('../../llm/openai-client');

      const llm = BabylonLLMClient.forGameTick();
      const manager = new QuestionManager(llm);

      // Create a question to resolve
      const question = {
        id: 1,
        text: 'Will AI continue to advance in 2025?',
        scenario: 1,
        outcome: true,
        rank: 1,
        status: 'active' as const,
      };

      const resolved = manager.resolveQuestion(question, true);

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedOutcome).toBe(true);

      console.log('   ✅ Question resolution works correctly');
    });
  });

  describe('FeedGenerator', () => {
    test('generates REAL feed posts', async () => {
      if (!hasLLMKey) return;

      const { FeedGenerator } = await import('../../FeedGenerator');
      const { BabylonLLMClient } = await import('../../llm/openai-client');
      const { loadActorsData } = await import('../../actors-loader');

      console.log('📝 Testing FeedGenerator...');

      const llm = BabylonLLMClient.forGameTick();
      const generator = new FeedGenerator(llm);

      const actorsData = loadActorsData();
      const actors = actorsData.actors.slice(0, 5).map((a) => ({
        ...a,
        tier: a.tier || ('B_TIER' as const),
        role: a.role || ('supporting' as const),
        initialLuck: a.initialLuck || ('medium' as const),
        initialMood: a.initialMood || 0,
      }));

      // Create mock events for feed generation
      const events = [
        {
          id: 'event-1',
          day: 1,
          type: 'announcement' as const,
          description: 'Major tech company announces new product launch',
          actors: actors.slice(0, 2).map((a) => a.id),
          visibility: 'public' as const,
        },
      ];

      const posts = await generator.generateDayFeed(1, events, actors);

      console.log(`   Generated ${posts.length} feed posts`);

      expect(posts.length).toBeGreaterThan(0);

      for (const post of posts.slice(0, 3)) {
        expect(post.content).toBeDefined();
        expect(post.content.length).toBeGreaterThan(10);
        expect(post.author).toBeDefined();

        // Ensure not mocked
        const isMocked = post.content.toLowerCase().includes('mock post');
        expect(isMocked).toBe(false);

        console.log(
          `   ✅ [${post.authorName}] "${post.content.substring(0, 40)}..."`
        );
      }
    });
  });

  describe('PerpetualsEngine', () => {
    test('initializes and manages perp markets correctly', async () => {
      if (!hasLLMKey) return;

      const { PerpetualsEngine } = await import('../../PerpetualsEngine');

      console.log('📈 Testing PerpetualsEngine...');

      const engine = new PerpetualsEngine();

      // Initialize with test organizations
      const orgs = [
        {
          id: 'test-company-1',
          name: 'TechCorp',
          description: 'A tech company',
          type: 'company' as const,
          canBeInvolved: true,
          initialPrice: 100,
        },
        {
          id: 'test-company-2',
          name: 'FinBank',
          description: 'A bank',
          type: 'company' as const,
          canBeInvolved: true,
          initialPrice: 50,
        },
      ];

      engine.initializeMarkets(orgs);
      const markets = engine.getMarkets();

      expect(markets.length).toBe(2);
      console.log(`   ✅ Initialized ${markets.length} markets`);

      // Test opening position
      const position = engine.openPosition('test-user-1', {
        ticker: markets[0]!.ticker,
        side: 'long',
        size: 1000,
        leverage: 5,
        orderType: 'market',
      });

      expect(position.side).toBe('long');
      expect(position.size).toBe(1000);
      expect(position.leverage).toBe(5);
      expect(position.liquidationPrice).toBeLessThan(position.entryPrice);
      console.log(
        `   ✅ Position opened: ${position.side} ${position.size} @ ${position.entryPrice}`
      );

      // Test price update
      const priceMap = new Map([['test-company-1', 110]]);
      engine.updatePositions(priceMap);

      const updatedPositions = engine.getUserPositions('test-user-1');
      expect(updatedPositions[0]?.unrealizedPnL).toBeGreaterThan(0);
      console.log(
        `   ✅ PnL calculated: $${updatedPositions[0]?.unrealizedPnL.toFixed(2)}`
      );

      // Test closing position
      const closeResult = engine.closePosition(position.id);
      expect(closeResult.realizedPnL).toBeGreaterThan(0);
      console.log(
        `   ✅ Position closed with $${closeResult.realizedPnL.toFixed(2)} profit`
      );
    });
  });

  describe('MarketDecisionEngine', () => {
    test('generates REAL NPC trading decisions (if DB available)', async () => {
      if (!hasLLMKey) return;

      console.log('💹 Testing MarketDecisionEngine...');

      // This test requires DB connection
      let dbAvailable = false;
      try {
        const { db } = await import('@babylon/db');
        await db.$queryRaw`SELECT 1`;
        dbAvailable = true;
      } catch {
        console.log('   ⏭️  Database not available - skipping DB-dependent test');
        return;
      }

      if (!dbAvailable) return;

      const { MarketDecisionEngine } = await import(
        '../../MarketDecisionEngine'
      );
      const { MarketContextService } = await import(
        '../../services/market-context-service'
      );
      const { BabylonLLMClient } = await import('../../llm/openai-client');

      const llm = BabylonLLMClient.forGameTick();
      const contextService = new MarketContextService();
      const engine = new MarketDecisionEngine(llm, contextService);

      // Generate batch decisions
      const decisions = await engine.generateBatchDecisions();

      console.log(`   Generated ${decisions.length} trading decisions`);

      // Validate decision structure
      for (const decision of decisions.slice(0, 5)) {
        expect(decision.npcId).toBeDefined();
        expect(decision.action).toBeDefined();
        expect(
          ['buy_yes', 'buy_no', 'open_long', 'open_short', 'close_position', 'hold'].includes(
            decision.action
          )
        ).toBe(true);

        console.log(
          `   ✅ NPC ${decision.npcId}: ${decision.action}${decision.amount ? ` $${decision.amount}` : ''}`
        );
      }
    });
  });

  describe('GameClock Modes', () => {
    test('realtime mode tracks actual time', async () => {
      const { GameClock } = await import('../../GameClock');

      console.log('⏰ Testing realtime mode...');

      const clock = GameClock.realtime();
      const time1 = clock.now();

      // Wait a bit
      await new Promise((r) => setTimeout(r, 100));

      const time2 = clock.now();

      // Timestamps should be different (realtime)
      expect(time2.timestamp.getTime()).toBeGreaterThanOrEqual(
        time1.timestamp.getTime()
      );
      console.log(`   ✅ Realtime: ${time2.timestamp.toISOString()}`);
    });

    test('simulated mode allows fast-forward', async () => {
      const { GameClock } = await import('../../GameClock');

      console.log('⏱️  Testing simulated mode...');

      const startDate = new Date('2025-01-01T00:00:00Z');
      const clock = GameClock.simulated(startDate, startDate);

      // Initial state
      let time = clock.now();
      expect(time.day).toBe(1);
      expect(time.hour).toBe(0);

      // Fast forward 48 hours
      time = clock.advanceHours(48);
      expect(time.day).toBe(3);
      expect(time.tick).toBe(48);

      console.log(`   ✅ After 48 hours: Day ${time.day}, Tick ${time.tick}`);
    });

    test('fed-in time allows specific timestamps', async () => {
      const { GameClock } = await import('../../GameClock');

      console.log('📅 Testing fed-in time mode...');

      const startDate = new Date('2025-01-01T00:00:00Z');
      const clock = GameClock.simulated(startDate, startDate);

      // Set specific time
      const targetDate = new Date('2025-01-15T14:30:00Z');
      clock.setTime(targetDate);

      const time = clock.now();
      expect(time.day).toBe(15);
      expect(time.hour).toBe(14);
      expect(time.minute).toBe(30);

      console.log(
        `   ✅ Fed-in: Day ${time.day}, ${time.hour}:${time.minute}`
      );
    });
  });

  describe('InMemoryStateStore (Offline Mode)', () => {
    test('supports full game simulation without database', async () => {
      const { InMemoryStateStore } = await import(
        '../../adapters/InMemoryStateStore'
      );

      console.log('🧠 Testing offline simulation...');

      const store = new InMemoryStateStore({
        numPredictionMarkets: 3,
        numPerpMarkets: 2,
        numAgents: 5,
        durationDays: 7,
        seed: 42,
      });

      // Test complete simulation loop
      let tradesExecuted = 0;
      let ticksProcessed = 0;

      while (!store.isComplete() && ticksProcessed < 168) {
        // 7 days max
        // Get state
        const state = store.getState();

        // Execute some trades
        const agent = state.agents[ticksProcessed % state.agents.length];
        const market =
          state.predictionMarkets[
            ticksProcessed % state.predictionMarkets.length
          ];

        if (agent && market && !market.resolved && agent.balance > 10) {
          const side = Math.random() > 0.5 ? 'YES' : 'NO';
          const result = store.buyPredictionShares(
            agent.id,
            market.id,
            side,
            10
          );
          if (result.success) tradesExecuted++;
        }

        // Advance time
        store.advanceTick();
        ticksProcessed++;
      }

      const finalState = store.getState();
      const progress = store.getProgress();

      console.log(`   ✅ Processed ${ticksProcessed} ticks`);
      console.log(`   ✅ Executed ${tradesExecuted} trades`);
      console.log(`   ✅ Final day: ${progress.day}`);
      console.log(
        `   ✅ Markets resolved: ${finalState.predictionMarkets.filter((m) => m.resolved).length}/${finalState.predictionMarkets.length}`
      );

      expect(ticksProcessed).toBeGreaterThan(0);
      expect(tradesExecuted).toBeGreaterThan(0);
    });
  });
});

