/**
 * Market Mover Agent
 *
 * Translates world events into price movements for perpetual markets.
 * This is the bridge between the Narrative Layer (events) and the Financial Layer (prices).
 *
 * Architecture:
 * - Events occur in GameWorld (leaks, rumors, scandals, etc.)
 * - Market Mover determines how those events should affect prices
 * - Returns percentage changes (deltas), not absolute prices
 *
 * Modes:
 * 1. Deterministic Fallback (default): Rule-based bucket selection, fast and cheap
 * 2. LLM-Based: Uses BabylonLLMClient for complex scenarios (optional)
 *
 * The agent uses volatility buckets to prevent overfitting:
 * - Low: ±2% to ±4%
 * - Medium: ±5% to ±10%
 * - High: ±15% to ±25%
 *
 * The exact percentage within a bucket is selected using seeded RNG for reproducibility.
 */

import type { WorldEvent } from '@babylon/shared';
import type { BabylonLLMClient } from '../llm/openai-client';

/**
 * Volatility bucket for price movements
 */
export type VolatilityBucket = 'low' | 'medium' | 'high';

/**
 * Volatility bucket ranges for price changes
 * Each bucket defines min/max percentage change (absolute value)
 */
const VOLATILITY_BUCKET_RANGES: Record<
  VolatilityBucket,
  { min: number; max: number }
> = {
  low: { min: 0.02, max: 0.04 }, // 2% to 4%
  medium: { min: 0.05, max: 0.1 }, // 5% to 10%
  high: { min: 0.15, max: 0.25 }, // 15% to 25%
};

/**
 * Event type to volatility bucket mapping for deterministic fallback
 * Maps event types to their default volatility impact
 */
const EVENT_TYPE_VOLATILITY: Record<
  string,
  { bucket: VolatilityBucket; isNegative: boolean }
> = {
  // Negative events
  leak: { bucket: 'medium', isNegative: true },
  rumor: { bucket: 'medium', isNegative: true },
  scandal: { bucket: 'high', isNegative: true },
  conflict: { bucket: 'medium', isNegative: true },
  revelation: { bucket: 'medium', isNegative: true },
  // Positive events
  development: { bucket: 'medium', isNegative: false },
  deal: { bucket: 'medium', isNegative: false },
  announcement: { bucket: 'low', isNegative: false },
  meeting: { bucket: 'low', isNegative: false },
  // Neutral/context-dependent (use sentiment signal)
  'development:occurred': { bucket: 'low', isNegative: false },
  'news:published': { bucket: 'low', isNegative: false },
};

/**
 * Price adjustment result for a single ticker
 */
export interface PriceAdjustment {
  /** The ticker being adjusted */
  ticker: string;
  /** Percentage change (-0.07 for -7%, +0.05 for +5%) */
  percentageChange: number;
  /** The volatility bucket used */
  bucket: VolatilityBucket;
  /** The event that triggered this adjustment */
  sourceEvent: {
    type: string;
    description: string;
  };
  /** Reasoning for the adjustment */
  reason: string;
}

/**
 * Context for price adjustment decisions
 */
export interface MarketMoverContext {
  /** Recent events in the simulation for additional context */
  recentEvents?: WorldEvent[];
  /** Current market sentiment (-1 to 1) */
  marketSentiment?: number;
  /** Tickers that are explicitly affected by the events */
  affectedTickers?: string[];
  /** Current day in the simulation (1-30) */
  currentDay?: number;
  /** Current hour (0-23) */
  currentHour?: number;
}

/**
 * Configuration for MarketMoverAgent
 */
export interface MarketMoverConfig {
  /** LLM model to use (default: same as MarketDecisionEngine, qwen-32b) */
  model?: string;
  /** Temperature for LLM calls (default: 0 for deterministic) */
  temperature?: number;
  /** Use deterministic fallback instead of LLM (default: true) */
  useDeterministicFallback?: boolean;
  /** Maximum price change per event (default: 0.30 for 30%) */
  maxPriceChangePerEvent?: number;
  /** Minimum price as fraction of initial (default: 0.10 for 10%) */
  minPriceFloor?: number;
  /** Maximum price as fraction of initial (default: 4.0 for 400%) */
  maxPriceCeiling?: number;
}

/**
 * Simple seeded random number generator for reproducibility
 * Used when SeededRandom from training package is not available
 */
class SimpleSeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/**
 * Market Mover Agent
 *
 * Translates world events into price movements using volatility buckets.
 * Primary mode is deterministic fallback (fast, cheap, consistent).
 * Optional LLM mode for complex scenarios.
 */
export class MarketMoverAgent {
  private llmClient?: BabylonLLMClient;
  private rng: SimpleSeededRandom;
  private config: Required<MarketMoverConfig>;

  constructor(
    rng:
      | { next(): number; nextFloat?(min: number, max: number): number }
      | number,
    llmClient?: BabylonLLMClient,
    config?: MarketMoverConfig
  ) {
    // Accept either a seed number or an RNG object
    if (typeof rng === 'number') {
      this.rng = new SimpleSeededRandom(rng);
    } else {
      // Wrap external RNG to match our interface using a wrapper class
      const externalRng = rng;
      this.rng = new SimpleSeededRandom(0);
      // Override methods to use external RNG
      this.rng.next = () => externalRng.next();
      this.rng.nextFloat = (min: number, max: number) =>
        externalRng.nextFloat
          ? externalRng.nextFloat(min, max)
          : min + externalRng.next() * (max - min);
    }

    this.llmClient = llmClient;
    this.config = {
      model: config?.model ?? 'qwen/qwen3-32b',
      temperature: config?.temperature ?? 0,
      useDeterministicFallback: config?.useDeterministicFallback ?? true,
      maxPriceChangePerEvent: config?.maxPriceChangePerEvent ?? 0.3,
      minPriceFloor: config?.minPriceFloor ?? 0.1,
      maxPriceCeiling: config?.maxPriceCeiling ?? 4.0,
    };
  }

  /**
   * Generate price adjustments for events that occurred this tick
   *
   * @param currentPrices - Map of ticker -> current price
   * @param events - World events that occurred this tick
   * @param context - Optional context for the adjustment
   * @returns Map of ticker -> percentage change
   */
  async generatePriceAdjustments(
    currentPrices: Map<string, number>,
    events: WorldEvent[],
    context?: MarketMoverContext
  ): Promise<Map<string, number>> {
    // If no events, no price changes
    if (events.length === 0) {
      return new Map();
    }

    // Use deterministic fallback by default
    if (this.config.useDeterministicFallback || !this.llmClient) {
      return this.generateDeterministicAdjustments(
        currentPrices,
        events,
        context
      );
    }

    // LLM mode (optional, not default)
    return this.generateLLMAdjustments(currentPrices, events, context);
  }

  /**
   * Deterministic price adjustment based on event type and volatility buckets
   * This is the primary mode - fast, cheap, and consistent.
   */
  private generateDeterministicAdjustments(
    currentPrices: Map<string, number>,
    events: WorldEvent[],
    context?: MarketMoverContext
  ): Map<string, number> {
    const adjustments = new Map<string, number>();

    for (const event of events) {
      // Determine which tickers are affected
      const affectedTickers = this.determineAffectedTickers(
        event,
        currentPrices,
        context
      );

      if (affectedTickers.length === 0) {
        continue;
      }

      // Get volatility bucket and direction for this event type
      const eventVolatility = this.getEventVolatility(event);

      // Generate price change for each affected ticker
      for (const ticker of affectedTickers) {
        const percentageChange = this.selectPercentageFromBucket(
          eventVolatility.bucket,
          !eventVolatility.isNegative
        );

        // Aggregate with existing adjustments for this ticker
        const existingChange = adjustments.get(ticker) ?? 0;
        const newChange = existingChange + percentageChange;

        // Clamp to max change per tick
        const clampedChange = Math.max(
          -this.config.maxPriceChangePerEvent,
          Math.min(this.config.maxPriceChangePerEvent, newChange)
        );

        adjustments.set(ticker, clampedChange);
      }
    }

    return adjustments;
  }

  /**
   * LLM-based price adjustment (optional mode, not default)
   * Uses LLM to select volatility bucket based on event context.
   */
  private async generateLLMAdjustments(
    currentPrices: Map<string, number>,
    events: WorldEvent[],
    _context?: MarketMoverContext
  ): Promise<Map<string, number>> {
    // Format events for LLM
    const eventDescriptions = events
      .map((e) => `- [${e.type}] ${e.description}`)
      .join('\n');

    // Format current prices
    const priceDescriptions = Array.from(currentPrices.entries())
      .map(([ticker, price]) => `- ${ticker}: $${price.toFixed(2)}`)
      .join('\n');

    const prompt = `You are analyzing market events to determine their impact on stock prices.

Events this tick:
${eventDescriptions}

Current prices:
${priceDescriptions}

For each affected ticker, select a volatility bucket:
- "low": Minor news, 2-4% impact
- "medium": Significant news, 5-10% impact
- "high": Major news, 15-25% impact

Also determine if the impact is positive or negative.

Return JSON with this structure:
{
  "adjustments": [
    { "ticker": "TSLA", "bucket": "medium", "isPositive": false, "reason": "Recall rumor" }
  ]
}

Only include tickers that are directly affected by the events.`;

    const response = await this.llmClient!.generateJSON<{
      adjustments: Array<{
        ticker: string;
        bucket: VolatilityBucket;
        isPositive: boolean;
        reason: string;
      }>;
    }>(
      prompt,
      {
        properties: {
          adjustments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ticker: { type: 'string' },
                bucket: { type: 'string' }, // 'low' | 'medium' | 'high'
                isPositive: { type: 'boolean' },
                reason: { type: 'string' },
              },
            },
          },
        },
        required: ['adjustments'],
      },
      {
        model: this.config.model,
        temperature: this.config.temperature,
        maxTokens: 500,
      }
    );

    // Convert LLM response to price adjustments
    const adjustments = new Map<string, number>();

    for (const adj of response.adjustments) {
      if (currentPrices.has(adj.ticker)) {
        const percentageChange = this.selectPercentageFromBucket(
          adj.bucket,
          adj.isPositive
        );
        adjustments.set(adj.ticker, percentageChange);
      }
    }

    return adjustments;
  }

  /**
   * Determine which tickers are affected by an event
   */
  private determineAffectedTickers(
    event: WorldEvent,
    currentPrices: Map<string, number>,
    context?: MarketMoverContext
  ): string[] {
    // If context specifies affected tickers, use those
    if (context?.affectedTickers && context.affectedTickers.length > 0) {
      return context.affectedTickers.filter((t) => currentPrices.has(t));
    }

    // Check if event description mentions any tickers
    const tickers = Array.from(currentPrices.keys());
    const mentionedTickers = tickers.filter((ticker) =>
      event.description.toUpperCase().includes(ticker.toUpperCase())
    );

    if (mentionedTickers.length > 0) {
      return mentionedTickers;
    }

    // Check actors for ticker hints (actors might be named after companies)
    for (const actor of event.actors) {
      for (const ticker of tickers) {
        if (actor.toUpperCase().includes(ticker.toUpperCase())) {
          return [ticker];
        }
      }
    }

    // No specific ticker identified - return empty (no price change)
    return [];
  }

  /**
   * Get volatility bucket and direction for an event type
   */
  private getEventVolatility(event: WorldEvent): {
    bucket: VolatilityBucket;
    isNegative: boolean;
  } {
    // Check if we have a mapping for this event type
    const mapping = EVENT_TYPE_VOLATILITY[event.type];

    if (mapping) {
      // Use sentiment signal if available to override direction
      if (event.sentimentSignal !== undefined) {
        return {
          bucket: mapping.bucket,
          isNegative: event.sentimentSignal < 0,
        };
      }
      return mapping;
    }

    // Default: use sentiment signal if available
    if (event.sentimentSignal !== undefined) {
      // Map sentiment magnitude to bucket
      const magnitude = Math.abs(event.sentimentSignal);
      let bucket: VolatilityBucket;
      if (magnitude > 0.7) {
        bucket = 'high';
      } else if (magnitude > 0.4) {
        bucket = 'medium';
      } else {
        bucket = 'low';
      }

      return {
        bucket,
        isNegative: event.sentimentSignal < 0,
      };
    }

    // Default: low volatility, direction based on pointsToward
    return {
      bucket: 'low',
      isNegative: event.pointsToward === 'NO',
    };
  }

  /**
   * Select a percentage change within a volatility bucket using seeded RNG
   */
  private selectPercentageFromBucket(
    bucket: VolatilityBucket,
    isPositive: boolean
  ): number {
    const range = VOLATILITY_BUCKET_RANGES[bucket];
    const magnitude = this.rng.nextFloat(range.min, range.max);
    return isPositive ? magnitude : -magnitude;
  }

  /**
   * Apply price adjustments to current prices, respecting bounds
   *
   * @param currentPrices - Map of ticker -> current price
   * @param adjustments - Map of ticker -> percentage change
   * @param initialPrices - Map of ticker -> initial price (for bounds)
   * @returns Map of ticker -> new price
   */
  applyAdjustments(
    currentPrices: Map<string, number>,
    adjustments: Map<string, number>,
    initialPrices: Map<string, number>
  ): Map<string, number> {
    const newPrices = new Map<string, number>();

    for (const [ticker, currentPrice] of currentPrices) {
      const adjustment = adjustments.get(ticker) ?? 0;
      let newPrice = currentPrice * (1 + adjustment);

      // Apply price bounds based on initial price
      const initialPrice = initialPrices.get(ticker) ?? currentPrice;
      const minPrice = initialPrice * this.config.minPriceFloor;
      const maxPrice = initialPrice * this.config.maxPriceCeiling;
      newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));

      newPrices.set(ticker, newPrice);
    }

    return newPrices;
  }

  /**
   * Get detailed price adjustment results for logging/debugging
   */
  async generateDetailedAdjustments(
    currentPrices: Map<string, number>,
    events: WorldEvent[],
    context?: MarketMoverContext
  ): Promise<PriceAdjustment[]> {
    const results: PriceAdjustment[] = [];

    for (const event of events) {
      const affectedTickers = this.determineAffectedTickers(
        event,
        currentPrices,
        context
      );
      const eventVolatility = this.getEventVolatility(event);

      for (const ticker of affectedTickers) {
        const percentageChange = this.selectPercentageFromBucket(
          eventVolatility.bucket,
          !eventVolatility.isNegative
        );

        results.push({
          ticker,
          percentageChange,
          bucket: eventVolatility.bucket,
          sourceEvent: {
            type: event.type,
            description: event.description,
          },
          reason: `Event type "${event.type}" maps to ${eventVolatility.bucket} bucket (${eventVolatility.isNegative ? 'negative' : 'positive'})`,
        });
      }
    }

    return results;
  }
}

/**
 * Create a MarketMoverAgent with default configuration
 */
export function createMarketMoverAgent(
  seed: number,
  llmClient?: BabylonLLMClient,
  config?: MarketMoverConfig
): MarketMoverAgent {
  return new MarketMoverAgent(seed, llmClient, config);
}
