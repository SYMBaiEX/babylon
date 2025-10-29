/**
 * Babylon Price Engine
 * 
 * Generates realistic stock price movements using:
 * - Seeded PRNG for deterministic price generation
 * - Markov chain for realistic market dynamics
 * - Minute-by-minute price updates
 * - Event-driven price impacts
 * 
 * Design:
 * 1. Each company starts with an initial price
 * 2. Base price follows a Markov chain (trend, volatility, momentum)
 * 3. Events cause discrete price jumps
 * 4. Minute-by-minute prices interpolate between discrete jumps
 * 5. All generation is deterministic given the same seed
 */

import type {
  Organization,
  StockPrice,
  PriceUpdate,
  MarkovChainState,
  WorldEvent,
} from '@/shared/types';

/**
 * Seeded PRNG using Mulberry32 algorithm
 * Provides deterministic random numbers for price generation
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /**
   * Generate next random number between 0 and 1
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generate random number in range [min, max)
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Generate random integer in range [min, max]
   */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Generate random boolean with given probability
   */
  boolean(probability = 0.5): boolean {
    return this.next() < probability;
  }
}

/**
 * Price Engine - Manages stock prices for all companies
 */
export class PriceEngine {
  private rng: SeededRandom;
  private companies: Map<string, Organization> = new Map();
  private markovStates: Map<string, MarkovChainState> = new Map();

  constructor(seed: number = Date.now()) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Initialize companies with starting prices
   */
  initializeCompanies(organizations: Organization[]): void {
    for (const org of organizations) {
      if (org.type === 'company' && org.initialPrice) {
        this.companies.set(org.id, {
          ...org,
          currentPrice: org.initialPrice,
          priceHistory: [],
          markovState: this.initializeMarkovState(),
        });

        this.markovStates.set(org.id, this.initializeMarkovState());
      }
    }
  }

  /**
   * Initialize Markov state for a company
   */
  private initializeMarkovState(): MarkovChainState {
    const trends: Array<'bullish' | 'bearish' | 'neutral'> = ['bullish', 'bearish', 'neutral'];
    return {
      trend: trends[this.rng.int(0, 2)]!,
      volatility: this.rng.range(0.1, 0.4), // 10-40% volatility
      momentum: this.rng.range(-0.5, 0.5), // -50% to +50% momentum
    };
  }

  /**
   * Update Markov state (transitions between states)
   */
  private updateMarkovState(state: MarkovChainState): MarkovChainState {
    // Transition probabilities based on current trend
    const transitionProbs = {
      bullish: { bullish: 0.7, neutral: 0.2, bearish: 0.1 },
      bearish: { bullish: 0.1, neutral: 0.2, bearish: 0.7 },
      neutral: { bullish: 0.3, neutral: 0.4, bearish: 0.3 },
    };

    const probs = transitionProbs[state.trend];
    const rand = this.rng.next();

    let newTrend: 'bullish' | 'bearish' | 'neutral';
    if (rand < probs.bullish) {
      newTrend = 'bullish';
    } else if (rand < probs.bullish + probs.neutral) {
      newTrend = 'neutral';
    } else {
      newTrend = 'bearish';
    }

    // Volatility mean-reverts slowly
    const volatilityDelta = this.rng.range(-0.05, 0.05);
    const newVolatility = Math.max(0.05, Math.min(0.5, state.volatility + volatilityDelta));

    // Momentum decays and gets random shocks
    const momentumDecay = state.momentum * 0.9;
    const momentumShock = this.rng.range(-0.2, 0.2);
    const newMomentum = Math.max(-1, Math.min(1, momentumDecay + momentumShock));

    return {
      trend: newTrend,
      volatility: newVolatility,
      momentum: newMomentum,
    };
  }

  /**
   * Generate minute-by-minute prices for a time period
   * Uses Markov chain state to create realistic price movements
   */
  generateMinutePrices(
    organizationId: string,
    startTime: Date,
    endTime: Date
  ): StockPrice[] {
    const company = this.companies.get(organizationId);
    if (!company || !company.currentPrice) {
      return [];
    }

    const prices: StockPrice[] = [];
    const state = this.markovStates.get(organizationId) || this.initializeMarkovState();
    let currentPrice = company.currentPrice;
    let previousPrice = currentPrice;

    // Generate a price for each minute
    const startMinute = startTime.getTime();
    const endMinute = endTime.getTime();
    const minuteMs = 60 * 1000;

    for (let time = startMinute; time <= endMinute; time += minuteMs) {
      // Apply Markov state to generate price movement
      const trendMultiplier = state.trend === 'bullish' ? 1.0002 : state.trend === 'bearish' ? 0.9998 : 1;
      const momentumEffect = state.momentum * 0.0001;
      const volatilityEffect = this.rng.range(-state.volatility, state.volatility) * 0.001;

      const priceChange = trendMultiplier * (1 + momentumEffect + volatilityEffect);
      currentPrice = currentPrice * priceChange;

      const change = currentPrice - previousPrice;
      const changePercent = (change / previousPrice) * 100;

      prices.push({
        price: Number(currentPrice.toFixed(2)),
        timestamp: new Date(time).toISOString(),
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
      });

      previousPrice = currentPrice;

      // Update Markov state occasionally (every ~30 minutes)
      if (this.rng.boolean(0.03)) {
        const newState = this.updateMarkovState(state);
        this.markovStates.set(organizationId, newState);
        state.trend = newState.trend;
        state.volatility = newState.volatility;
        state.momentum = newState.momentum;
      }
    }

    // Update company's current price
    company.currentPrice = currentPrice;
    this.companies.set(organizationId, company);

    return prices;
  }

  /**
   * Apply event impact to a company's stock price
   * LLM determines direction and magnitude, we apply it here
   */
  applyEventImpact(
    organizationId: string,
    event: WorldEvent,
    direction: 'positive' | 'negative' | 'neutral',
    magnitude: 'major' | 'moderate' | 'minor'
  ): PriceUpdate | null {
    const company = this.companies.get(organizationId);
    if (!company || !company.currentPrice) {
      return null;
    }

    // Calculate impact multiplier based on direction and magnitude
    const directionMultiplier = direction === 'positive' ? 1 : direction === 'negative' ? -1 : 0;
    const magnitudeAmount = magnitude === 'major' ? 0.05 : magnitude === 'moderate' ? 0.02 : 0.005;

    // Add some randomness
    const randomFactor = this.rng.range(0.8, 1.2);
    const impactPercent = directionMultiplier * magnitudeAmount * randomFactor;

    const oldPrice = company.currentPrice;
    const newPrice = oldPrice * (1 + impactPercent);
    const change = newPrice - oldPrice;
    const changePercent = (change / oldPrice) * 100;

    // Update company price
    company.currentPrice = newPrice;
    this.companies.set(organizationId, company);

    // Update Markov state based on event
    const state = this.markovStates.get(organizationId);
    if (state) {
      // Events can change trend
      if (direction === 'positive' && magnitude === 'major') {
        state.trend = 'bullish';
        state.momentum = Math.min(1, state.momentum + 0.3);
      } else if (direction === 'negative' && magnitude === 'major') {
        state.trend = 'bearish';
        state.momentum = Math.max(-1, state.momentum - 0.3);
      }

      // Events can increase volatility
      if (magnitude === 'major') {
        state.volatility = Math.min(0.5, state.volatility * 1.5);
      }

      this.markovStates.set(organizationId, state);
    }

    return {
      organizationId,
      timestamp: new Date().toISOString(),
      oldPrice: Number(oldPrice.toFixed(2)),
      newPrice: Number(newPrice.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      reason: event.description,
      impact: magnitude,
    };
  }

  /**
   * Get current price for a company
   */
  getCurrentPrice(organizationId: string): number | null {
    const company = this.companies.get(organizationId);
    return company?.currentPrice || null;
  }

  /**
   * Get all companies with their current prices
   */
  getAllCompanies(): Organization[] {
    return Array.from(this.companies.values());
  }

  /**
   * Get Markov state for a company (for debugging/visualization)
   */
  getMarkovState(organizationId: string): MarkovChainState | null {
    return this.markovStates.get(organizationId) || null;
  }
}


