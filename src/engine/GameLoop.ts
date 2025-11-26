import type { GameWorld } from './GameWorld';
import type { FeedGenerator } from './FeedGenerator';
import type { MarketDecisionEngine } from './MarketDecisionEngine';
import type { PerpetualsEngine } from './PerpetualsEngine';
import type { RelationshipEvolutionEngine } from './RelationshipEvolutionEngine';
import type { NewsArticlePacingEngine } from './NewsArticlePacingEngine';
import { logger } from '@/lib/logger';
import type { WorldEvent } from './GameWorld';
import type { FeedPost, Actor, ActorTier } from '@/shared/types';
import { TradeExecutionService } from '@/lib/services/trade-execution-service';
import { db } from '@/db';
import { actors } from '@/db/schema';
import { desc } from 'drizzle-orm';

export interface TickResult {
  events: WorldEvent[];
  posts: FeedPost[];
  tradeCount: number;
  marketUpdated: boolean;
}

export class GameLoop {
  constructor(
    private world: GameWorld,
    private feed: FeedGenerator,
    private marketDecisions: MarketDecisionEngine,
    private perps: PerpetualsEngine,
    private relationships: RelationshipEvolutionEngine,
     
    // @ts-expect-error - Reserved for future article generation integration
    private _articles: NewsArticlePacingEngine
  ) {}

  /**
   * Run a single tick of the game universe.
   * Used by BOTH the live cron job (1 tick) and the generator (30 days * 24 ticks).
   * 
   * @param gameId - ID of the game instance
   * @param day - Current day number (1-30)
   * @param hour - Current hour (0-23)
   * @param marketOnly - If true, only runs market logic (for fast-forwarding)
   */
  async tick(gameId: string, day: number, hour: number, marketOnly: boolean = false): Promise<TickResult> {
    logger.info(`Processing Tick: Day ${day}, Hour ${hour}`, { gameId, marketOnly }, 'GameLoop');

    // 1. Market Maintenance (Financial Layer)
    // Funding rates run every 8 hours
    let marketUpdated = false;
    if (hour % 8 === 0) {
      this.perps.processFunding();
      marketUpdated = true;
    }

    // 2. Market Decisions (Financial Layer)
    // Generate trading activity based on current state
    // This drives price action which then feeds into narrative
    const decisions = await this.marketDecisions.generateBatchDecisions();
    let tradeCount = 0;
    
    if (decisions.length > 0) {
      try {
        const executionService = new TradeExecutionService();
        const executionResult = await executionService.executeDecisionBatch(decisions);
        tradeCount = executionResult.successfulTrades;
        
        logger.info(
          `NPC Trading: ${executionResult.successfulTrades} trades executed`,
          {
            successful: executionResult.successfulTrades,
            failed: executionResult.failedTrades,
            holds: executionResult.holdDecisions,
          },
          'GameLoop'
        );
      } catch (e) {
        logger.warn(
          `Trade execution batch failed: ${e instanceof Error ? e.message : String(e)}`,
          undefined,
          'GameLoop'
        );
      }
    }

    // 3. World Events (Narrative Layer)
    // Pass market state to world so narrative reacts to crashes/pumps
    // This implements the "Soros Loop" (Market -> Narrative)
    const marketState = this.perps.getMarkets();
    
    // Calculate significant moves for narrative context
    const significantMoves = marketState
      .filter(m => Math.abs(m.changePercent24h) > 5)
      .map(m => ({ ticker: m.ticker, change: m.changePercent24h }));

    let worldEvents: WorldEvent[] = [];
    try {
      worldEvents = await this.world.generateTickEvents(day, hour, {
        markets: marketState,
        significantMoves
      });
    } catch (e) {
      logger.warn(
        `Failed to generate world events: ${e instanceof Error ? e.message : String(e)}`,
        { day, hour },
        'GameLoop'
      );
    }

    // 4. Feed Reaction (Social Layer)
    // Skip if marketOnly is true (for fast simulations)
    let posts: FeedPost[] = [];
    if (!marketOnly) {
      // Fetch actors from database for feed generation
      // Use a subset of top actors for efficiency in simulation
      const actorsResult = await db.select().from(actors).orderBy(desc(actors.reputationPoints)).limit(15);
      
      if (actorsResult.length > 0) {
        // Convert database actors to Actor type expected by FeedGenerator
        const actorList: Actor[] = actorsResult.map(actor => ({
          id: actor.id,
          name: actor.name,
          description: actor.description || undefined,
          domain: Array.isArray(actor.domain) ? actor.domain : (actor.domain ? [actor.domain] : undefined),
          personality: actor.personality || undefined,
          tier: actor.tier as ActorTier | undefined,
          affiliations: actor.affiliations || [],
          postStyle: actor.postStyle || undefined,
          postExample: Array.isArray(actor.postExample) ? actor.postExample : (actor.postExample ? [actor.postExample] : undefined),
          role: actor.role || undefined,
          initialLuck: actor.initialLuck as 'low' | 'medium' | 'high' | undefined,
          initialMood: actor.initialMood || undefined,
        }));
        
        try {
          posts = await this.feed.generateDayFeed(day, worldEvents, actorList);
        } catch (e) {
          logger.warn(
            `Failed to generate feed posts: ${e instanceof Error ? e.message : String(e)}`,
            { day, actorCount: actorsResult.length },
            'GameLoop'
          );
        }
      } else {
        logger.warn('No actors found for feed generation', {}, 'GameLoop');
      }
    }
    
    // 5. Relationship Evolution (Social Layer)
    // Only run once per day to save tokens, or on major interactions
    if (!marketOnly && hour === 23) {
      try {
        await this.relationships.analyzeAndUpdateRelationships();
      } catch (e) {
        logger.warn(
          `Failed to analyze relationships: ${e instanceof Error ? e.message : String(e)}`,
          undefined,
          'GameLoop'
        );
      }
    }

    // 6. Record Snapshot
    if (hour === 23) {
      this.perps.recordDailySnapshot();
    }
    
    return { events: worldEvents, posts, tradeCount, marketUpdated };
  }

  /**
   * Generates a full history by fast-forwarding the loop
   */
  async simulateFullGame(gameId: string, durationDays: number = 30): Promise<TickResult[]> {
    logger.info(`Starting Simulation for ${gameId}...`, undefined, 'GameLoop');
    
    const history: TickResult[] = [];
    
    // Run the loop 30 * 24 times
    for (let day = 1; day <= durationDays; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const tickResult = await this.tick(gameId, day, hour, false);
        history.push(tickResult);
      }
    }
    
    return history;
  }
}
