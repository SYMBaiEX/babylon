/**
 * Liquidity Simulation Framework
 *
 * @module simulation/liquidity-simulation
 *
 * @description
 * Simulates market liquidity scenarios to test system robustness under various conditions.
 * Generates synthetic trading activity and measures market health metrics.
 *
 * **Simulation Architecture:**
 *
 * Perpetuals:
 * - Users/agents open long/short positions (synthetic, no price impact)
 * - NPCs trade "spot" which affects underlying prices
 * - Funding rate reconciles long/short imbalances
 *
 * Predictions:
 * - NPCs, users, and agents all trade in same pool
 * - CPMM pricing with shared liquidity
 * - Points can flow between all participants
 *
 * @example
 * ```typescript
 * const simulator = new LiquiditySimulator(SCENARIOS.perpImbalance);
 * const results = await simulator.run();
 * console.log(`Final health score: ${results.finalHealthScore}`);
 * ```
 */

import {
  calculateDynamicFundingRate,
  calculatePositionFunding,
  type FundingRateResult,
  logger,
  PredictionPricing,
} from '@babylon/engine';

/**
 * Configuration for a simulation scenario
 */
export interface LiquidityScenarioConfig {
  name: string;
  description: string;

  /** Duration in simulated ticks */
  durationTicks: number;

  /** Tick interval in simulated seconds */
  tickIntervalSeconds: number;

  // Perpetuals settings
  perps: {
    /** Initial ratio of longs (0-1) */
    initialLongRatio: number;

    /** Number of user/agent traders */
    traderCount: number;

    /** Average position size in points */
    avgPositionSize: number;

    /** Volatility of NPC spot trading (affects price swings) */
    npcSpotVolatility: number;

    /** Trade frequency per tick (0-1) */
    tradeFrequency: number;
  };

  // Prediction settings
  predictions: {
    /** Initial liquidity per market */
    initialLiquidity: number;

    /** Number of markets */
    marketCount: number;

    /** NPC participation rate (0-1) */
    npcParticipationRate: number;

    /** User participation rate (0-1) */
    userParticipationRate: number;

    /** Average trade size in points */
    avgTradeSize: number;
  };

  // Events that occur during simulation
  events?: SimulationEvent[];

  /** Random seed for reproducibility */
  seed?: number;
}

/**
 * Events that can occur during simulation
 */
export interface SimulationEvent {
  /** Tick when event occurs */
  tick: number;

  /** Event type */
  type: 'npc_spot_shock' | 'mass_exit' | 'liquidity_surge' | 'funding_spike';

  /** Magnitude of event (-1 to 1 or percentage) */
  magnitude: number;

  /** Optional: specific market/ticker affected */
  target?: string;
}

/**
 * State of a simulated prediction market
 */
interface SimPredictionMarket {
  id: string;
  question: string;
  yesShares: number;
  noShares: number;
  volume: number;
  tradeCount: number;
  npcPnL: number;
  userPnL: number;
}

/**
 * State of a simulated perpetual market
 */
interface SimPerpMarket {
  ticker: string;
  spotPrice: number;
  longOI: number;
  shortOI: number;
  positions: SimPerpPosition[];
  fundingHistory: FundingRateResult[];
  totalFundingPaid: number;
}

/**
 * A simulated perpetual position
 */
interface SimPerpPosition {
  id: string;
  owner: 'user' | 'agent';
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  fundingPaid: number;
  openedAtTick: number;
  leverage: number;
  liquidationPrice: number;
  isLiquidated: boolean;
}

/**
 * Metrics collected each tick
 */
export interface TickMetrics {
  tick: number;
  timestamp: number;

  // Perp metrics
  perpLongOI: number;
  perpShortOI: number;
  perpImbalance: number;
  perpFundingRate: number;
  perpSpotPrice: number;

  // Prediction metrics
  predictionTotalLiquidity: number;
  predictionAvgSpread: number;
  predictionVolume: number;

  // Health
  overallHealthScore: number;
}

/**
 * Final simulation results
 */
export interface SimulationResult {
  config: LiquidityScenarioConfig;

  /** Duration info */
  durationTicks: number;
  simulatedTimeSeconds: number;

  /** Final state */
  finalPerpState: {
    longOI: number;
    shortOI: number;
    imbalancePercent: number;
    totalFundingPaid: number;
    avgFundingRateAPR: number;
    liquidationCount: number;
  };

  finalPredictionState: {
    totalLiquidity: number;
    avgSpread: number;
    totalVolume: number;
    npcNetPnL: number;
    userNetPnL: number;
  };

  /** Health scores */
  initialHealthScore: number;
  finalHealthScore: number;
  lowestHealthScore: number;
  avgHealthScore: number;

  /** Time series data */
  tickMetrics: TickMetrics[];

  /** Events that occurred */
  eventsTriggered: SimulationEvent[];

  /** Analysis */
  findings: string[];
  recommendations: string[];
}

/**
 * Predefined simulation scenarios
 */
export const SCENARIOS = {
  normal: {
    name: 'Normal Operation',
    description: 'Balanced markets with typical trading activity',
    durationTicks: 100,
    tickIntervalSeconds: 60,
    perps: {
      initialLongRatio: 0.55,
      traderCount: 50,
      avgPositionSize: 500,
      npcSpotVolatility: 0.005, // Reduced: 0.5% per tick is more realistic
      tradeFrequency: 0.3,
    },
    predictions: {
      initialLiquidity: 10000,
      marketCount: 5,
      npcParticipationRate: 0.3,
      userParticipationRate: 0.2,
      avgTradeSize: 50,
    },
  },

  perpImbalance: {
    name: 'Extreme Long Bias',
    description: '85% of perp traders go long, testing funding rate response',
    durationTicks: 100,
    tickIntervalSeconds: 60,
    perps: {
      initialLongRatio: 0.85,
      traderCount: 50,
      avgPositionSize: 500,
      npcSpotVolatility: 0.005, // Normal volatility
      tradeFrequency: 0.3,
    },
    predictions: {
      initialLiquidity: 10000,
      marketCount: 5,
      npcParticipationRate: 0.3,
      userParticipationRate: 0.2,
      avgTradeSize: 50,
    },
  },

  spotCrash: {
    name: 'NPC Spot Price Crash',
    description: 'NPC spot trading causes 20% price drop, testing liquidations',
    durationTicks: 100,
    tickIntervalSeconds: 60,
    perps: {
      initialLongRatio: 0.7, // More longs to liquidate
      traderCount: 50,
      avgPositionSize: 500,
      npcSpotVolatility: 0.01, // Slightly elevated
      tradeFrequency: 0.3,
    },
    predictions: {
      initialLiquidity: 10000,
      marketCount: 5,
      npcParticipationRate: 0.3,
      userParticipationRate: 0.2,
      avgTradeSize: 50,
    },
    events: [{ tick: 30, type: 'npc_spot_shock', magnitude: -0.2 }],
  },

  massExit: {
    name: 'Mass Position Exit',
    description: '50% of traders close positions suddenly',
    durationTicks: 100,
    tickIntervalSeconds: 60,
    perps: {
      initialLongRatio: 0.6,
      traderCount: 100,
      avgPositionSize: 500,
      npcSpotVolatility: 0.005,
      tradeFrequency: 0.3,
    },
    predictions: {
      initialLiquidity: 10000,
      marketCount: 5,
      npcParticipationRate: 0.3,
      userParticipationRate: 0.2,
      avgTradeSize: 50,
    },
    events: [{ tick: 50, type: 'mass_exit', magnitude: 0.5 }],
  },

  lowLiquidity: {
    name: 'Low Liquidity Prediction Markets',
    description: 'Prediction markets with minimal starting liquidity',
    durationTicks: 100,
    tickIntervalSeconds: 60,
    perps: {
      initialLongRatio: 0.55,
      traderCount: 30,
      avgPositionSize: 300,
      npcSpotVolatility: 0.005,
      tradeFrequency: 0.2,
    },
    predictions: {
      initialLiquidity: 1000, // Very low
      marketCount: 10,
      npcParticipationRate: 0.4,
      userParticipationRate: 0.3,
      avgTradeSize: 100, // Large relative to liquidity
    },
  },
} satisfies Record<string, LiquidityScenarioConfig>;

/**
 * Seeded random number generator
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  nextGaussian(): number {
    // Box-Muller transform
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/**
 * Liquidity Simulation Engine
 */
export class LiquiditySimulator {
  private config: LiquidityScenarioConfig;
  private rng: SeededRandom;

  // Simulation state
  private perpMarket: SimPerpMarket;
  private predictionMarkets: SimPredictionMarket[];
  private tickMetrics: TickMetrics[] = [];
  private currentTick = 0;
  private eventsTriggered: SimulationEvent[] = [];
  private liquidationCount = 0;

  constructor(config: LiquidityScenarioConfig) {
    this.config = config;
    this.rng = new SeededRandom(config.seed || Date.now());

    // Initialize perp market
    this.perpMarket = this.initializePerpMarket();

    // Initialize prediction markets
    this.predictionMarkets = this.initializePredictionMarkets();
  }

  /**
   * Run the full simulation
   */
  async run(): Promise<SimulationResult> {
    logger.info?.(
      `Starting liquidity simulation: ${this.config.name}`,
      { durationTicks: this.config.durationTicks },
      'LiquiditySimulator'
    );

    const startTime = Date.now();

    // Record initial state
    const initialHealth = this.calculateHealthScore();
    let lowestHealth = initialHealth;
    let totalHealth = 0;

    // Main simulation loop
    for (
      this.currentTick = 0;
      this.currentTick < this.config.durationTicks;
      this.currentTick++
    ) {
      // Check for events
      this.processEvents();

      // Simulate NPC spot trading (affects perp mark price)
      this.simulateNPCSpotTrading();

      // Process liquidations after price changes
      this.processLiquidations();

      // Simulate user/agent perp trading
      this.simulatePerpTrading();

      // Process funding payments (every N ticks to simulate 8 hours)
      if (this.currentTick % 10 === 0) {
        this.processFunding();
      }

      // Simulate prediction market trading
      this.simulatePredictionTrading();

      // Collect metrics
      const metrics = this.collectTickMetrics();
      this.tickMetrics.push(metrics);

      totalHealth += metrics.overallHealthScore;
      lowestHealth = Math.min(lowestHealth, metrics.overallHealthScore);
    }

    const finalHealth = this.calculateHealthScore();
    const avgHealth = totalHealth / this.config.durationTicks;

    // Generate findings and recommendations
    const { findings, recommendations } = this.analyzeResults();

    const result: SimulationResult = {
      config: this.config,
      durationTicks: this.config.durationTicks,
      simulatedTimeSeconds:
        this.config.durationTicks * this.config.tickIntervalSeconds,

      finalPerpState: {
        longOI: this.perpMarket.longOI,
        shortOI: this.perpMarket.shortOI,
        imbalancePercent: this.calculatePerpImbalance() * 100,
        totalFundingPaid: this.perpMarket.totalFundingPaid,
        avgFundingRateAPR: this.calculateAvgFundingRate() * 100,
        liquidationCount: this.countLiquidations(),
      },

      finalPredictionState: {
        totalLiquidity: this.predictionMarkets.reduce(
          (sum, m) => sum + m.yesShares + m.noShares,
          0
        ),
        avgSpread: this.calculateAvgPredictionSpread(),
        totalVolume: this.predictionMarkets.reduce(
          (sum, m) => sum + m.volume,
          0
        ),
        npcNetPnL: this.predictionMarkets.reduce((sum, m) => sum + m.npcPnL, 0),
        userNetPnL: this.predictionMarkets.reduce(
          (sum, m) => sum + m.userPnL,
          0
        ),
      },

      initialHealthScore: initialHealth,
      finalHealthScore: finalHealth,
      lowestHealthScore: lowestHealth,
      avgHealthScore: avgHealth,

      tickMetrics: this.tickMetrics,
      eventsTriggered: this.eventsTriggered,

      findings,
      recommendations,
    };

    logger.info?.(
      `Simulation complete: ${this.config.name}`,
      {
        duration: Date.now() - startTime,
        finalHealth,
        lowestHealth,
        perpImbalance: (this.calculatePerpImbalance() * 100).toFixed(1) + '%',
      },
      'LiquiditySimulator'
    );

    return result;
  }

  /**
   * Initialize perpetual market state
   */
  private initializePerpMarket(): SimPerpMarket {
    const positions: SimPerpPosition[] = [];
    let longOI = 0;
    let shortOI = 0;

    // Create initial positions based on config
    const initialPrice = 100;
    for (let i = 0; i < this.config.perps.traderCount; i++) {
      const isLong = this.rng.next() < this.config.perps.initialLongRatio;
      const size = this.config.perps.avgPositionSize * (0.5 + this.rng.next());
      const leverage = 3 + Math.floor(this.rng.next() * 7); // 3x to 10x leverage

      // Liquidation price: position loses all margin when price moves against by (100%/leverage)
      // For longs: liquidation when price drops by 1/leverage (e.g., 20% for 5x)
      // For shorts: liquidation when price rises by 1/leverage
      const liquidationPrice = isLong
        ? initialPrice * (1 - 1 / leverage)
        : initialPrice * (1 + 1 / leverage);

      positions.push({
        id: `pos-${i}`,
        owner: this.rng.next() < 0.5 ? 'user' : 'agent',
        side: isLong ? 'long' : 'short',
        size,
        entryPrice: initialPrice,
        fundingPaid: 0,
        openedAtTick: 0,
        leverage,
        liquidationPrice,
        isLiquidated: false,
      });

      if (isLong) {
        longOI += size;
      } else {
        shortOI += size;
      }
    }

    return {
      ticker: 'SIMCORP',
      spotPrice: 100,
      longOI,
      shortOI,
      positions,
      fundingHistory: [],
      totalFundingPaid: 0,
    };
  }

  /**
   * Initialize prediction markets
   */
  private initializePredictionMarkets(): SimPredictionMarket[] {
    const markets: SimPredictionMarket[] = [];

    for (let i = 0; i < this.config.predictions.marketCount; i++) {
      const init = PredictionPricing.initializeMarket(
        this.config.predictions.initialLiquidity
      );
      markets.push({
        id: `market-${i}`,
        question: `Test Question ${i + 1}`,
        yesShares: init.yesShares,
        noShares: init.noShares,
        volume: 0,
        tradeCount: 0,
        npcPnL: 0,
        userPnL: 0,
      });
    }

    return markets;
  }

  /**
   * Process scheduled events
   */
  private processEvents(): void {
    const events =
      this.config.events?.filter((e) => e.tick === this.currentTick) || [];

    for (const event of events) {
      this.eventsTriggered.push(event);

      switch (event.type) {
        case 'npc_spot_shock':
          this.perpMarket.spotPrice *= 1 + event.magnitude;
          logger.info?.(
            `Event: NPC spot shock ${(event.magnitude * 100).toFixed(1)}%`,
            { newPrice: this.perpMarket.spotPrice, tick: this.currentTick },
            'LiquiditySimulator'
          );
          break;

        case 'mass_exit':
          this.executeMassExit(event.magnitude);
          break;

        case 'liquidity_surge':
          this.executeLiquiditySurge(event.magnitude);
          break;

        case 'funding_spike':
          // Funding spike is handled naturally by imbalance
          break;
      }
    }
  }

  /**
   * Simulate NPC spot trading affecting prices
   */
  private simulateNPCSpotTrading(): void {
    const volatility = this.config.perps.npcSpotVolatility;
    const priceChange = this.rng.nextGaussian() * volatility;
    this.perpMarket.spotPrice *= 1 + priceChange;
    this.perpMarket.spotPrice = Math.max(1, this.perpMarket.spotPrice);
  }

  /**
   * Simulate user/agent perpetual trading
   */
  private simulatePerpTrading(): void {
    // Check if any new trades should happen this tick
    if (this.rng.next() > this.config.perps.tradeFrequency) {
      return;
    }

    // Decide if opening or closing
    const isOpen = this.rng.next() < 0.6;

    if (isOpen) {
      // New position
      const isLong = this.rng.next() < 0.5;
      const size = this.config.perps.avgPositionSize * (0.5 + this.rng.next());
      const leverage = 3 + Math.floor(this.rng.next() * 7); // 3x to 10x
      const currentPrice = this.perpMarket.spotPrice;

      // Liquidation price calculation
      const liquidationPrice = isLong
        ? currentPrice * (1 - 1 / leverage)
        : currentPrice * (1 + 1 / leverage);

      this.perpMarket.positions.push({
        id: `pos-${this.currentTick}-${this.rng.next()}`,
        owner: this.rng.next() < 0.5 ? 'user' : 'agent',
        side: isLong ? 'long' : 'short',
        size,
        entryPrice: currentPrice,
        fundingPaid: 0,
        openedAtTick: this.currentTick,
        leverage,
        liquidationPrice,
        isLiquidated: false,
      });

      if (isLong) {
        this.perpMarket.longOI += size;
      } else {
        this.perpMarket.shortOI += size;
      }
    } else if (this.perpMarket.positions.length > 0) {
      // Close random position
      const idx = Math.floor(
        this.rng.next() * this.perpMarket.positions.length
      );
      const pos = this.perpMarket.positions[idx];

      if (pos && !pos.isLiquidated) {
        if (pos.side === 'long') {
          this.perpMarket.longOI -= pos.size;
        } else {
          this.perpMarket.shortOI -= pos.size;
        }

        this.perpMarket.positions.splice(idx, 1);
      }
    }
  }

  /**
   * Check for and process liquidations
   */
  private processLiquidations(): number {
    let liquidationCount = 0;
    const currentPrice = this.perpMarket.spotPrice;

    // Check each position for liquidation
    for (let i = this.perpMarket.positions.length - 1; i >= 0; i--) {
      const pos = this.perpMarket.positions[i];
      if (!pos || pos.isLiquidated) continue;

      const shouldLiquidate =
        (pos.side === 'long' && currentPrice <= pos.liquidationPrice) ||
        (pos.side === 'short' && currentPrice >= pos.liquidationPrice);

      if (shouldLiquidate) {
        pos.isLiquidated = true;
        liquidationCount++;

        // Remove from OI
        if (pos.side === 'long') {
          this.perpMarket.longOI -= pos.size;
        } else {
          this.perpMarket.shortOI -= pos.size;
        }

        // Remove position
        this.perpMarket.positions.splice(i, 1);

        logger.info(
          `Liquidation: ${pos.side} position at ${currentPrice.toFixed(2)} (liq: ${pos.liquidationPrice.toFixed(2)})`,
          { positionId: pos.id, size: pos.size, leverage: pos.leverage },
          'LiquiditySimulator'
        );
      }
    }

    if (liquidationCount > 0) {
      this.liquidationCount += liquidationCount;
      logger.info?.(
        `Processed ${liquidationCount} liquidations at price ${currentPrice.toFixed(2)}`,
        { totalLiquidations: this.liquidationCount },
        'LiquiditySimulator'
      );
    }

    return liquidationCount;
  }

  /**
   * Process funding payments
   */
  private processFunding(): void {
    const fundingResult = calculateDynamicFundingRate({
      longOpenInterest: this.perpMarket.longOI,
      shortOpenInterest: this.perpMarket.shortOI,
    });

    this.perpMarket.fundingHistory.push(fundingResult);

    // Apply funding to all positions
    for (const pos of this.perpMarket.positions) {
      const payment = calculatePositionFunding(
        pos.size,
        fundingResult.periodRate,
        pos.side
      );
      pos.fundingPaid += payment;
      this.perpMarket.totalFundingPaid += Math.abs(payment);
    }
  }

  /**
   * Simulate prediction market trading
   */
  private simulatePredictionTrading(): void {
    for (const market of this.predictionMarkets) {
      // NPC trades
      if (this.rng.next() < this.config.predictions.npcParticipationRate) {
        this.executePredictionTrade(market, 'npc');
      }

      // User trades
      if (this.rng.next() < this.config.predictions.userParticipationRate) {
        this.executePredictionTrade(market, 'user');
      }
    }
  }

  /**
   * Execute a prediction market trade
   *
   * P&L Model (Zero-Sum):
   * - NPCs and Users trade in the same AMM pool
   * - Trading costs (slippage) go to LPs, modeled as a shared cost
   * - Resolution outcomes are zero-sum: NPC gain = User loss and vice versa
   * - We simulate immediate resolution for each trade to track cumulative P&L
   */
  private executePredictionTrade(
    market: SimPredictionMarket,
    trader: 'npc' | 'user'
  ): void {
    const amount =
      this.config.predictions.avgTradeSize * (0.5 + this.rng.next());
    const side: 'yes' | 'no' = this.rng.next() < 0.5 ? 'yes' : 'no';

    try {
      const calc = PredictionPricing.calculateBuy(
        market.yesShares,
        market.noShares,
        side,
        amount
      );

      market.yesShares = calc.newYesShares;
      market.noShares = calc.newNoShares;
      market.volume += amount;
      market.tradeCount++;

      // Calculate slippage cost (always negative for trader, goes to LPs)
      // Slippage = (avgPrice - theoretical midpoint) * shares
      const midPrice = 0.5; // Theoretical fair value for balanced market
      const slippageCost =
        Math.abs(calc.avgPrice - midPrice) * calc.sharesBought * 0.1;

      // Simulate market resolution for this trade
      // Use market probability as win chance (efficient market hypothesis)
      const marketProb = PredictionPricing.getCurrentPrice(
        calc.newYesShares,
        calc.newNoShares,
        side
      );
      const isWinner = this.rng.next() < marketProb;

      // Zero-sum P&L from resolution
      // Winner gets: (1 - avgPrice) * shares (profit above cost basis)
      // Loser loses: avgPrice * shares (their cost basis)
      let resolutionPnL: number;
      if (isWinner) {
        // Won: receive $1 per share, paid avgPrice
        resolutionPnL = (1 - calc.avgPrice) * calc.sharesBought;
      } else {
        // Lost: receive $0, paid avgPrice
        resolutionPnL = -calc.avgPrice * calc.sharesBought;
      }

      // Net P&L = resolution outcome - slippage cost
      const netPnL = resolutionPnL - slippageCost;

      // ZERO-SUM: One trader's gain is the other's loss
      // When NPC trades, they're effectively betting against "the market" (Users + LPs)
      // When User trades, they're betting against "the market" (NPCs + LPs)
      if (trader === 'npc') {
        market.npcPnL += netPnL;
        market.userPnL -= netPnL; // Zero-sum: user is the counterparty
      } else {
        market.userPnL += netPnL;
        market.npcPnL -= netPnL; // Zero-sum: NPC is the counterparty
      }
    } catch {
      // Trade failed (e.g., insufficient liquidity) - skip
    }
  }

  /**
   * Execute mass exit event
   */
  private executeMassExit(ratio: number): void {
    const exitCount = Math.floor(this.perpMarket.positions.length * ratio);

    for (
      let i = 0;
      i < exitCount && this.perpMarket.positions.length > 0;
      i++
    ) {
      const idx = Math.floor(
        this.rng.next() * this.perpMarket.positions.length
      );
      const pos = this.perpMarket.positions[idx];

      if (pos) {
        if (pos.side === 'long') {
          this.perpMarket.longOI -= pos.size;
        } else {
          this.perpMarket.shortOI -= pos.size;
        }
        this.perpMarket.positions.splice(idx, 1);
      }
    }

    logger.info?.(
      `Event: Mass exit - ${exitCount} positions closed`,
      { remainingPositions: this.perpMarket.positions.length },
      'LiquiditySimulator'
    );
  }

  /**
   * Execute liquidity surge event
   */
  private executeLiquiditySurge(ratio: number): void {
    for (const market of this.predictionMarkets) {
      const addLiquidity = ((market.yesShares + market.noShares) * ratio) / 2;
      market.yesShares += addLiquidity;
      market.noShares += addLiquidity;
    }

    logger.info?.(
      `Event: Liquidity surge - ${(ratio * 100).toFixed(0)}% added`,
      undefined,
      'LiquiditySimulator'
    );
  }

  /**
   * Collect metrics for current tick
   */
  private collectTickMetrics(): TickMetrics {
    const perpImbalance = this.calculatePerpImbalance();
    const fundingRate =
      this.perpMarket.fundingHistory[this.perpMarket.fundingHistory.length - 1];

    return {
      tick: this.currentTick,
      timestamp: this.currentTick * this.config.tickIntervalSeconds,

      perpLongOI: this.perpMarket.longOI,
      perpShortOI: this.perpMarket.shortOI,
      perpImbalance,
      perpFundingRate: fundingRate?.annualRate || 0.01,
      perpSpotPrice: this.perpMarket.spotPrice,

      predictionTotalLiquidity: this.predictionMarkets.reduce(
        (sum, m) => sum + m.yesShares + m.noShares,
        0
      ),
      predictionAvgSpread: this.calculateAvgPredictionSpread(),
      predictionVolume: this.predictionMarkets.reduce(
        (sum, m) => sum + m.volume,
        0
      ),

      overallHealthScore: this.calculateHealthScore(),
    };
  }

  /**
   * Calculate perpetual market imbalance
   */
  private calculatePerpImbalance(): number {
    const total = this.perpMarket.longOI + this.perpMarket.shortOI;
    if (total === 0) return 0;
    return (this.perpMarket.longOI - this.perpMarket.shortOI) / total;
  }

  /**
   * Calculate average prediction market spread
   */
  private calculateAvgPredictionSpread(): number {
    let totalSpread = 0;
    for (const market of this.predictionMarkets) {
      const total = market.yesShares + market.noShares;
      if (total > 0) {
        // Simplified spread calculation
        const imbalance = Math.abs(market.yesShares - market.noShares) / total;
        totalSpread += imbalance * 500; // Convert to basis points
      }
    }
    return totalSpread / this.predictionMarkets.length;
  }

  /**
   * Calculate average funding rate
   */
  private calculateAvgFundingRate(): number {
    if (this.perpMarket.fundingHistory.length === 0) return 0.01;
    const sum = this.perpMarket.fundingHistory.reduce(
      (s, f) => s + Math.abs(f.annualRate),
      0
    );
    return sum / this.perpMarket.fundingHistory.length;
  }

  /**
   * Get total liquidation count
   */
  private countLiquidations(): number {
    return this.liquidationCount;
  }

  /**
   * Calculate overall health score
   */
  private calculateHealthScore(): number {
    let score = 100;

    // Perp imbalance penalty
    const perpImbalance = Math.abs(this.calculatePerpImbalance());
    if (perpImbalance > 0.8) score -= 30;
    else if (perpImbalance > 0.6) score -= 20;
    else if (perpImbalance > 0.4) score -= 10;

    // Prediction liquidity check
    const avgLiquidity =
      this.predictionMarkets.reduce(
        (sum, m) => sum + m.yesShares + m.noShares,
        0
      ) / this.predictionMarkets.length;

    if (avgLiquidity < 2000) score -= 30;
    else if (avgLiquidity < 5000) score -= 15;
    else if (avgLiquidity < 10000) score -= 5;

    // Spread check
    const avgSpread = this.calculateAvgPredictionSpread();
    if (avgSpread > 500) score -= 20;
    else if (avgSpread > 200) score -= 10;

    return Math.max(0, score);
  }

  /**
   * Analyze results and generate findings
   */
  private analyzeResults(): { findings: string[]; recommendations: string[] } {
    const findings: string[] = [];
    const recommendations: string[] = [];

    // Perp analysis
    const perpImbalance = Math.abs(this.calculatePerpImbalance());
    if (perpImbalance > 0.7) {
      findings.push(
        `Perp market ended with ${(perpImbalance * 100).toFixed(0)}% imbalance`
      );
      recommendations.push(
        'Funding rate mechanism may need more aggressive scaling'
      );
    }

    const avgFunding = this.calculateAvgFundingRate();
    if (avgFunding > 0.2) {
      findings.push(
        `Average funding rate was ${(avgFunding * 100).toFixed(1)}% APR (high)`
      );
    }

    // Prediction analysis
    const finalLiquidity = this.predictionMarkets.reduce(
      (sum, m) => sum + m.yesShares + m.noShares,
      0
    );
    const initialLiquidity =
      this.config.predictions.initialLiquidity *
      this.config.predictions.marketCount;
    const liquidityChange =
      ((finalLiquidity - initialLiquidity) / initialLiquidity) * 100;

    if (Math.abs(liquidityChange) > 30) {
      findings.push(
        `Prediction liquidity changed by ${liquidityChange.toFixed(0)}%`
      );
    }

    const npcPnL = this.predictionMarkets.reduce((sum, m) => sum + m.npcPnL, 0);
    const userPnL = this.predictionMarkets.reduce(
      (sum, m) => sum + m.userPnL,
      0
    );

    if (npcPnL < -1000) {
      findings.push(
        `NPCs lost ${Math.abs(npcPnL).toFixed(0)} points to users (user P&L: +${userPnL.toFixed(0)})`
      );
    } else if (npcPnL > 1000) {
      findings.push(
        `NPCs gained ${npcPnL.toFixed(0)} points from users (user P&L: ${userPnL.toFixed(0)})`
      );
      recommendations.push('Consider reviewing NPC trading strategies');
    } else if (Math.abs(userPnL) > 1000) {
      findings.push(
        `Users P&L: ${userPnL > 0 ? '+' : ''}${userPnL.toFixed(0)} points`
      );
    }

    // Event analysis
    for (const event of this.eventsTriggered) {
      findings.push(`Event "${event.type}" occurred at tick ${event.tick}`);
    }

    // Health analysis
    const lowestHealth = Math.min(
      ...this.tickMetrics.map((m) => m.overallHealthScore)
    );
    if (lowestHealth < 40) {
      findings.push(
        `Health score dropped to ${lowestHealth} during simulation`
      );
      recommendations.push(
        'Consider implementing circuit breakers for extreme conditions'
      );
    }

    return { findings, recommendations };
  }
}

/**
 * Type for valid scenario names
 */
export type ScenarioName = keyof typeof SCENARIOS;

/**
 * Run multiple scenarios and compare
 */
export async function runScenarioComparison(
  scenarioNames: ScenarioName[]
): Promise<Map<string, SimulationResult>> {
  const results = new Map<string, SimulationResult>();

  for (const name of scenarioNames) {
    const config = SCENARIOS[name];
    const simulator = new LiquiditySimulator(config);
    const result = await simulator.run();
    results.set(name, result);
  }

  return results;
}
