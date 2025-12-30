/**
 * Simulation Bridge Server
 *
 * HTTP server that Python training code can call for online training.
 * Provides endpoints for:
 * - Getting scenarios for agents
 * - Executing agent actions
 * - Advancing simulation time
 *
 * This enables true on-policy training where the model generates actions
 * and TypeScript simulates outcomes in real-time.
 *
 * Usage:
 *   bun run src/services/simulation-bridge-server.ts
 *   # Server starts on http://localhost:3001
 *
 * Python client:
 *   await client.get_scenario(npc_id)
 *   await client.execute_action(npc_id, action)
 */

import { logger } from '@babylon/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { GameWorld, type WorldConfig } from '../GameWorld';
import type { NPCMarketContext } from '../types/market-context';
import type { MarketAction, TradingDecision } from '../types/market-decisions';
import { MarketContextService } from './market-context-service';
import { TradeExecutionService } from './trade-execution-service';

// =============================================================================
// Types
// =============================================================================

interface InitRequest {
  numNPCs?: number;
  seed?: number;
  archetypes?: string[];
  outcome?: boolean;
}

interface InitResponse {
  status: 'initialized' | 'error';
  npcIds: string[];
  archetypes: Record<string, string>;
  message?: string;
}

interface ScenarioResponse {
  npcId: string;
  archetype: string;
  marketState: {
    perpMarkets: Array<{
      ticker: string;
      currentPrice: number;
      changePercent24h: number;
      volume24h: number;
    }>;
    predictionMarkets: Array<{
      id: string;
      title: string;
      yesPrice: number;
      noPrice: number;
    }>;
  };
  positions: Array<{
    id: string;
    marketType: string;
    ticker?: string;
    marketId?: string;
    side: string;
    size: number;
    unrealizedPnL: number;
  }>;
  balance: number;
  recentNews: Array<{
    content: string;
    source: string;
    timestamp: string;
  }>;
  socialContext: {
    relationships: Array<{
      actorId: string;
      actorName: string;
      sentiment: number;
    }>;
    groupChats: string[];
    recentMessages: Array<{
      from: string;
      content: string;
    }>;
  };
}

interface ExecuteRequest {
  npcId: string;
  action: {
    type: MarketAction;
    ticker?: string;
    marketId?: string;
    amount?: number;
    side?: 'long' | 'short' | 'yes' | 'no';
    positionId?: string;
  };
  reasoning?: string;
}

interface ExecuteResponse {
  success: boolean;
  pnl: number;
  newBalance: number;
  newPositions: Array<{
    id: string;
    marketType: string;
    ticker?: string;
    marketId?: string;
    side: string;
    size: number;
  }>;
  socialImpact: {
    reputationDelta: number;
    followersGained: number;
  };
  events: Array<{
    type: string;
    description: string;
  }>;
  error?: string;
}

interface TickResponse {
  tickNumber: number;
  events: Array<{
    type: string;
    description: string;
    affectedMarkets?: string[];
  }>;
  marketChanges: Array<{
    ticker: string;
    priceChange: number;
    volume: number;
  }>;
}

// =============================================================================
// State Management
// =============================================================================

// NPC type from GameWorld.getNPCs()
type NPC = ReturnType<GameWorld['getNPCs']>[number];

class SimulationState {
  gameWorld: GameWorld | null = null;
  contextService: MarketContextService | null = null;
  tradeService: TradeExecutionService | null = null;
  npcArchetypes: Map<string, string> = new Map();
  npcs: NPC[] = [];
  tickCount: number = 0;
  isInitialized: boolean = false;

  async initialize(config: InitRequest): Promise<InitResponse> {
    const numNPCs = config.numNPCs ?? 20;

    logger.info(
      'Initializing simulation bridge',
      { numNPCs },
      'SimulationBridge'
    );

    // Create game world with proper WorldConfig
    const worldConfig: WorldConfig = {
      outcome: config.outcome ?? true,
      numNPCs,
    };

    // GameWorld constructor takes (config, llmClient?)
    // For simulation bridge, we don't need LLM - just game state
    this.gameWorld = new GameWorld(worldConfig);
    await this.gameWorld.generate();

    // Get NPCs and extract IDs
    this.npcs = this.gameWorld.getNPCs();
    const npcIds = this.npcs.map((npc) => npc.id);

    // Assign archetypes based on NPC characteristics or provided list
    const archetypes = config.archetypes ?? [
      'trader',
      'degen',
      'researcher',
      'information-trader',
    ];

    const archetypeMap: Record<string, string> = {};
    for (let i = 0; i < npcIds.length; i++) {
      const npcId = npcIds[i]!;
      const archetype = archetypes[i % archetypes.length]!;
      this.npcArchetypes.set(npcId, archetype);
      archetypeMap[npcId] = archetype;
    }

    // Initialize services - they use global state in simulation mode
    this.contextService = new MarketContextService();
    this.tradeService = new TradeExecutionService();

    this.isInitialized = true;
    this.tickCount = 0;

    logger.info(
      'Simulation bridge initialized',
      { npcCount: npcIds.length },
      'SimulationBridge'
    );

    return {
      status: 'initialized',
      npcIds,
      archetypes: archetypeMap,
    };
  }

  async getScenario(npcId: string): Promise<ScenarioResponse> {
    if (!this.isInitialized || !this.contextService) {
      throw new Error('Simulation not initialized');
    }

    const context = await this.contextService.buildContextForNPC(npcId);
    const archetype = this.npcArchetypes.get(npcId) ?? 'trader';

    return this.contextToScenario(npcId, archetype, context);
  }

  private contextToScenario(
    npcId: string,
    archetype: string,
    context: NPCMarketContext
  ): ScenarioResponse {
    return {
      npcId,
      archetype,
      marketState: {
        perpMarkets: context.perpMarkets.map((m) => ({
          ticker: m.ticker,
          currentPrice: m.currentPrice,
          changePercent24h: m.changePercent24h,
          volume24h: m.volume24h,
        })),
        predictionMarkets: context.predictionMarkets.map((m) => ({
          id: m.id,
          title: m.text ?? 'Unknown',
          yesPrice: m.yesPrice,
          noPrice: m.noPrice,
        })),
      },
      positions: context.currentPositions.map((p) => ({
        id: p.id,
        marketType: p.marketType,
        ticker: p.ticker,
        marketId: p.marketId,
        side: p.side,
        size: p.size,
        unrealizedPnL: p.unrealizedPnL,
      })),
      balance: context.availableBalance,
      recentNews: context.recentPosts.slice(0, 5).map((post) => ({
        content: post.content,
        source: post.authorName,
        timestamp: post.timestamp,
      })),
      socialContext: {
        relationships: (context.relationships ?? []).map((r) => ({
          actorId: r.actorId,
          actorName: r.actorName,
          sentiment: r.sentiment,
        })),
        groupChats: context.groupChatMessages
          .map((m) => m.chatName)
          .filter((v, i, a) => a.indexOf(v) === i),
        recentMessages: context.groupChatMessages.slice(0, 5).map((m) => ({
          from: m.fromName,
          content: m.message,
        })),
      },
    };
  }

  async executeAction(request: ExecuteRequest): Promise<ExecuteResponse> {
    if (!this.isInitialized || !this.tradeService || !this.contextService) {
      return {
        success: false,
        pnl: 0,
        newBalance: 0,
        newPositions: [],
        socialImpact: { reputationDelta: 0, followersGained: 0 },
        events: [],
        error: 'Simulation not initialized',
      };
    }

    const { npcId, action, reasoning } = request;

    // Find NPC name
    const npc = this.npcs.find((n) => n.id === npcId);
    const npcName = npc?.name ?? npcId;

    // Convert to TradingDecision format
    const decision: TradingDecision = {
      npcId,
      npcName,
      action: action.type,
      marketType:
        action.type === 'buy_yes' || action.type === 'buy_no'
          ? 'prediction'
          : action.type === 'open_long' ||
              action.type === 'open_short' ||
              action.type === 'close_position'
            ? 'perp'
            : null,
      ticker: action.ticker,
      marketId: action.marketId,
      positionId: action.positionId,
      amount: action.amount ?? 0,
      confidence: 0.8, // Default confidence
      reasoning: reasoning ?? 'No reasoning provided',
    };

    // Execute via trade service (batch of 1)
    const result = await this.tradeService.executeDecisionBatch([decision]);

    // Get updated context for balance/positions
    const context = await this.contextService.buildContextForNPC(npcId);

    return {
      success: result.executedTrades.length > 0,
      pnl: 0, // PnL calculated on position close, not on open
      newBalance: context.availableBalance,
      newPositions: context.currentPositions.map((p) => ({
        id: p.id,
        marketType: p.marketType,
        ticker: p.ticker,
        marketId: p.marketId,
        side: p.side,
        size: p.size,
      })),
      socialImpact: {
        reputationDelta: 0,
        followersGained: 0,
      },
      events: [],
    };
  }

  async advanceTick(): Promise<TickResponse> {
    if (!this.isInitialized) {
      throw new Error('Simulation not initialized');
    }

    this.tickCount++;

    // Note: GameWorld doesn't have a tick() method - it's event-driven
    // For simulation bridge, we just increment the tick counter
    // and return empty changes (the actual game loop is in GameLoop.ts)

    return {
      tickNumber: this.tickCount,
      events: [],
      marketChanges: [],
    };
  }

  reset(): void {
    this.gameWorld = null;
    this.contextService = null;
    this.tradeService = null;
    this.npcArchetypes.clear();
    this.npcs = [];
    this.tickCount = 0;
    this.isInitialized = false;
    logger.info('Simulation state reset', {}, 'SimulationBridge');
  }
}

// =============================================================================
// Server Setup
// =============================================================================

const state = new SimulationState();
const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', honoLogger());

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    initialized: state.isInitialized,
    tickCount: state.tickCount,
    npcCount: state.npcArchetypes.size,
  });
});

// Initialize simulation
app.post('/init', async (c) => {
  try {
    const body = await c.req.json<InitRequest>();
    const result = await state.initialize(body);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      { status: 'error', npcIds: [], archetypes: {}, message },
      500
    );
  }
});

// Get scenario for NPC
app.get('/scenario/:npcId', async (c) => {
  const npcId = c.req.param('npcId');

  if (!state.isInitialized) {
    return c.json({ error: 'Simulation not initialized' }, 400);
  }

  try {
    const scenario = await state.getScenario(npcId);
    return c.json(scenario);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

// Execute action
app.post('/execute', async (c) => {
  try {
    const body = await c.req.json<ExecuteRequest>();
    const result = await state.executeAction(body);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        success: false,
        pnl: 0,
        newBalance: 0,
        newPositions: [],
        socialImpact: { reputationDelta: 0, followersGained: 0 },
        events: [],
        error: message,
      },
      500
    );
  }
});

// Advance simulation
app.post('/tick', async (c) => {
  if (!state.isInitialized) {
    return c.json({ error: 'Simulation not initialized' }, 400);
  }

  try {
    const result = await state.advanceTick();
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

// Reset simulation
app.post('/reset', (c) => {
  state.reset();
  return c.json({ status: 'reset' });
});

// List NPCs
app.get('/npcs', (c) => {
  if (!state.isInitialized) {
    return c.json({ error: 'Simulation not initialized' }, 400);
  }

  const npcs = Array.from(state.npcArchetypes.entries()).map(
    ([id, archetype]) => ({
      id,
      archetype,
    })
  );

  return c.json({ npcs, count: npcs.length });
});

// Get all scenarios (for batch processing)
app.get('/scenarios', async (c) => {
  if (!state.isInitialized) {
    return c.json({ error: 'Simulation not initialized' }, 400);
  }

  try {
    const scenarios = [];
    for (const [npcId] of state.npcArchetypes) {
      const scenario = await state.getScenario(npcId);
      scenarios.push(scenario);
    }
    return c.json({ scenarios, count: scenarios.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

// =============================================================================
// Main - Use Bun.serve directly
// =============================================================================

const PORT = parseInt(process.env.SIMULATION_BRIDGE_PORT ?? '3001', 10);

// Only start server if run directly (not imported)
if (import.meta.main) {
  logger.info(
    `Starting simulation bridge server on port ${PORT}`,
    {},
    'SimulationBridge'
  );

  Bun.serve({
    fetch: app.fetch,
    port: PORT,
  });

  logger.info(
    `Simulation bridge server running at http://localhost:${PORT}`,
    {},
    'SimulationBridge'
  );
}

export { app, SimulationState };
export type {
  InitRequest,
  InitResponse,
  ScenarioResponse,
  ExecuteRequest,
  ExecuteResponse,
  TickResponse,
};
