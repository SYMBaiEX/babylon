/**
 * Generate Training Data for RL
 *
 * This script generates training data for reinforcement learning by running
 * a simulation of the game world. It supports two modes:
 *
 * 1. Random Walk Mode (default): Prices follow random walk with drift
 * 2. Causal Simulation Mode: Hidden facts → Events → Price movements (learnable signal)
 *
 * Usage:
 *   bun run packages/engine/examples/generate-training-data.ts
 *   bun run packages/engine/examples/generate-training-data.ts --causal
 *   bun run packages/engine/examples/generate-training-data.ts --causal --days 30 --seed 12345
 */

import { logger } from '@babylon/shared';
// Import types from training package for causal simulation
import {
  type ArchetypeResolver,
  type BenchmarkConfig,
  BenchmarkDataGenerator,
  deriveArchetype,
  type GroundTruth,
  type NPCCharacteristics,
} from '@babylon/training';
import {
  BabylonLLMClient,
  type CausalEventContext,
  FeedGenerator,
  GameLoop,
  GameWorld,
  initializeSimulationMode,
  MarketContextService,
  MarketDecisionEngine,
  RelationshipEvolutionEngine,
  type ScheduledCausalEvent,
  StaticDataRegistry,
  saveSnapshot,
} from '../src';
import { TrajectoryMarketEngine } from '../src/services/trajectory-market-engine';

logger.info = console.log;
logger.warn = console.warn;
logger.error = console.error;

type ModelProvider = 'groq' | 'openai' | 'anthropic';

interface ModelConfig {
  provider: ModelProvider;
  model: string;
  maxOutputTokens: number;
}

interface TrainingDataConfig {
  /** Enable causal simulation mode */
  useCausalSimulation: boolean;
  /** Number of days to simulate (default: 1) */
  simulationDays: number;
  /** Random seed for reproducibility */
  seed: number;
  /** Number of NPCs in the simulation */
  numNPCs: number;
  /** Outcome of prediction markets (true = YES wins) */
  outcome: boolean;
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

function parseArgs(): TrainingDataConfig {
  const args = process.argv.slice(2);
  return {
    useCausalSimulation: args.includes('--causal'),
    simulationDays: parseInt(getArgValue(args, '--days') ?? '1', 10),
    seed: parseInt(getArgValue(args, '--seed') ?? String(Date.now()), 10),
    numNPCs: parseInt(getArgValue(args, '--npcs') ?? '10', 10),
    outcome: true,
  };
}

function detectAvailableProvider(): ModelProvider {
  if (process.env.GROQ_API_KEY) {
    console.log('📡 Detected GROQ_API_KEY');
    return 'groq';
  }
  if (process.env.OPENAI_API_KEY) {
    console.log('📡 Detected OPENAI_API_KEY');
    return 'openai';
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('📡 Detected ANTHROPIC_API_KEY');
    return 'anthropic';
  }
  throw new Error(
    'No API keys found. Set GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY'
  );
}

function getModelConfig(provider: ModelProvider): ModelConfig {
  const configs: Record<ModelProvider, ModelConfig> = {
    groq: {
      provider: 'groq',
      model: 'qwen/qwen3-32b',
      maxOutputTokens: 32000, // qwen3-32b supports up to 40k output
    },
    openai: {
      provider: 'openai',
      model: 'gpt-5-mini-2025-08-07',
      maxOutputTokens: 16000,
    },
    anthropic: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      maxOutputTokens: 16000,
    },
  };

  return configs[provider];
}

/**
 * Convert BenchmarkDataGenerator's causal events to GameWorld's CausalEventContext
 */
function buildCausalEventContext(
  groundTruth: GroundTruth,
  currentTick: number
): CausalEventContext | undefined {
  if (!groundTruth.causalEvents || groundTruth.causalEvents.length === 0) {
    return undefined;
  }

  const scheduledEvents: ScheduledCausalEvent[] = groundTruth.causalEvents.map(
    (event) => ({
      tick: event.tick,
      day: event.day,
      hour: event.hour,
      eventType: event.eventType,
      description: event.description,
      affectedTickers: event.affectedTickers,
      isPositive: event.isPositive,
      sourceFactId: event.sourceFactId,
    })
  );

  return {
    scheduledEvents,
    currentTick,
  };
}

async function main() {
  const config = parseArgs();

  console.log('🚀 Starting RL Data Generation Pipeline...');
  console.log('===========================================');
  console.log(
    `   Mode: ${config.useCausalSimulation ? 'CAUSAL SIMULATION' : 'RANDOM WALK'}`
  );
  console.log(`   Days: ${config.simulationDays}`);
  console.log(`   Seed: ${config.seed}`);
  console.log(`   NPCs: ${config.numNPCs}`);
  console.log('===========================================');

  // Detect available provider
  const provider = detectAvailableProvider();
  const modelConfig = getModelConfig(provider);

  console.log(`✅ Provider: ${provider.toUpperCase()}`);
  console.log(`✅ Model: ${modelConfig.model}`);

  // 1. Initialize JSON DB Mode (Bypass Postgres)
  await initializeSimulationMode('./training-data-output');
  console.log('✅ Storage Bridge: JSON Mode Initialized');

  // 2. Setup the LLM Client
  const llmClient = BabylonLLMClient.forGameTick();
  console.log(`✅ LLM Client: Connected via ${llmClient.getProvider()}`);

  // 3. Initialize Core Services
  const actors = StaticDataRegistry.getAllActors();
  console.log(`✅ Static Registry: Loaded ${actors.length} actors`);

  const feed = new FeedGenerator(llmClient);
  const contextService = new MarketContextService();
  const relationships = new RelationshipEvolutionEngine(llmClient);

  // 4. Initialize the Market Engines with dynamic config
  const rawMarketEngine = new MarketDecisionEngine(llmClient, contextService, {
    model: modelConfig.model,
    maxOutputTokens: modelConfig.maxOutputTokens,
  });

  // 5. Setup Game World first (we need NPCs for archetype resolver)
  const world = new GameWorld(
    { outcome: config.outcome, numNPCs: config.numNPCs },
    llmClient
  );

  // Initialize world to create NPCs
  await world.generate();

  // Create archetype resolver from world NPCs
  const worldNPCs = world.getNPCs();
  const archetypeResolver: ArchetypeResolver = (npcId: string): string => {
    const npc = worldNPCs.find((n) => n.id === npcId);
    if (!npc) {
      console.warn(`NPC not found for archetype resolution: ${npcId}`);
      return 'trader';
    }
    // Convert NPC to NPCCharacteristics for archetype derivation
    const characteristics: NPCCharacteristics = {
      id: npc.id,
      name: npc.name,
      role: npc.role,
      personality: npc.personality,
      reliability: npc.reliability,
      willingToLie: npc.role === 'deceiver' || npc.reliability < 0.3,
    };
    return deriveArchetype(characteristics);
  };

  // Log archetype assignments
  console.log('📊 NPC Archetype Assignments:');
  for (const npc of worldNPCs) {
    const archetype = archetypeResolver(npc.id);
    console.log(`   - ${npc.name} (${npc.role}): ${archetype}`);
  }

  // The 'Trajectory' engine wraps it to record the (Observation -> Thought -> Action) loop
  const trajectoryEngine = new TrajectoryMarketEngine(rawMarketEngine, {
    enableRecording: true,
    samplingRate: 1.0, // Record 100% of decisions for the dataset
    archetypeResolver, // Archetype resolver for RL scoring
  });
  console.log('✅ Trajectory Recorder: ATTACHED with archetype resolver');

  const loop = new GameLoop(world, feed, trajectoryEngine, relationships);

  // 6. Setup Causal Simulation if enabled
  let groundTruth: GroundTruth | undefined;
  let currentPrices: Map<string, number> | undefined;
  let initialPrices: Map<string, number> | undefined;

  if (config.useCausalSimulation) {
    console.log('\n🎯 CAUSAL SIMULATION MODE ENABLED');

    // Create BenchmarkDataGenerator with causal simulation enabled
    const benchmarkConfig: BenchmarkConfig = {
      durationMinutes: config.simulationDays * 24 * 60, // Convert days to minutes
      tickInterval: 3600, // 1 tick per hour (3600 seconds)
      numPredictionMarkets: 5,
      numPerpetualMarkets: 5,
      numAgents: config.numNPCs,
      seed: config.seed,
      useCausalSimulation: true,
    };

    const generator = new BenchmarkDataGenerator(benchmarkConfig);
    const snapshot = await generator.generate();
    groundTruth = snapshot.groundTruth;

    // Log the hidden narrative fact
    if (
      groundTruth.hiddenNarrativeFacts &&
      groundTruth.hiddenNarrativeFacts.length > 0
    ) {
      const fact = groundTruth.hiddenNarrativeFacts[0]!;
      console.log(`   📜 Hidden Fact: "${fact.fact}"`);
      console.log(`   📈 Affected Tickers: ${fact.affectsTickers.join(', ')}`);
      console.log(`   📅 Event Schedule:`);
      for (const event of fact.eventSchedule) {
        console.log(
          `      - Day ${event.baseDay} + ${event.jitterHours}h jitter: ${event.eventType}`
        );
      }
    }

    // Log causal events
    if (groundTruth.causalEvents && groundTruth.causalEvents.length > 0) {
      console.log(`   ⚡ Scheduled Causal Events:`);
      for (const event of groundTruth.causalEvents) {
        const priceChange = Object.entries(event.priceChanges)
          .map(([ticker, change]) => `${ticker}: ${(change * 100).toFixed(1)}%`)
          .join(', ');
        console.log(
          `      - Day ${event.day} Hour ${event.hour}: ${event.eventType} (${priceChange})`
        );
      }
    }

    // Initialize current prices from initial state
    // Note: We use pre-calculated prices from groundTruth.causalEvents.priceChanges
    // instead of calling MarketMoverAgent at runtime to ensure consistency
    currentPrices = new Map(
      snapshot.initialState.perpetualMarkets.map((m) => [m.ticker, m.price])
    );
    initialPrices = new Map(currentPrices);
    console.log(
      `✅ Initial Prices: ${Array.from(currentPrices.entries())
        .map(([t, p]) => `${t}=$${p}`)
        .join(', ')}`
    );
  }

  // 7. Run Simulation
  console.log('\n🧠 STARTING SIMULATION LOOP...');
  const gameId = `training-batch-${Date.now()}`;

  // Note: world.generate() already called above when setting up archetype resolver

  let currentTick = 0;

  // Run simulation
  for (let day = 1; day <= config.simulationDays; day++) {
    console.log(`\n📅 === DAY ${day} ===`);

    for (let hour = 0; hour < 24; hour++) {
      currentTick++;
      console.log(`\n--- Tick ${currentTick}: Day ${day}, Hour ${hour}:00 ---`);

      // Build causal event context if in causal mode
      const causalContext = groundTruth
        ? buildCausalEventContext(groundTruth, currentTick)
        : undefined;

      // Apply price changes BEFORE tick so NPCs trade at correct prices
      if (groundTruth?.causalEvents && currentPrices && initialPrices) {
        const causalEventsThisTick = groundTruth.causalEvents.filter(
          (e) => e.day === day && e.hour === hour
        );

        if (causalEventsThisTick.length > 0) {
          console.log(`   ⚡ CAUSAL EVENT TRIGGERED!`);

          // Apply the PRE-CALCULATED price changes from groundTruth
          for (const causalEvent of causalEventsThisTick) {
            for (const [ticker, priceChange] of Object.entries(
              causalEvent.priceChanges
            )) {
              const oldPrice = currentPrices.get(ticker);
              if (oldPrice !== undefined) {
                let newPrice = oldPrice * (1 + priceChange);

                // Apply price bounds (10% to 400% of initial)
                const initial = initialPrices.get(ticker) ?? oldPrice;
                const minPrice = initial * 0.1;
                const maxPrice = initial * 4.0;
                newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));

                currentPrices.set(ticker, newPrice);
                console.log(
                  `   💰 ${ticker}: $${oldPrice.toFixed(2)} → $${newPrice.toFixed(2)} (${(priceChange * 100).toFixed(1)}%)`
                );
              }
            }
          }
        }
      }

      // Run the tick with causal context and price overrides
      // GameLoop.tick now handles event generation with causal context internally
      const result = await loop.tick(gameId, day, hour, false, {
        priceOverrides: currentPrices,
        causalContext,
      });

      console.log(`   > Trades: ${result.tradeCount}`);
      console.log(`   > Posts:  ${result.posts.length}`);
      console.log(`   > Events: ${result.events.length}`);
    }
  }

  // 8. Save the raw state
  await saveSnapshot();

  // 9. Save causal simulation ground truth if enabled
  if (config.useCausalSimulation && groundTruth) {
    const groundTruthPath = './training-data-output/ground-truth.json';
    await Bun.write(
      groundTruthPath,
      JSON.stringify(
        {
          seed: config.seed,
          simulationDays: config.simulationDays,
          hiddenNarrativeFacts: groundTruth.hiddenNarrativeFacts,
          causalEvents: groundTruth.causalEvents,
          priceHistory: groundTruth.priceHistory,
          finalPrices: currentPrices
            ? Object.fromEntries(currentPrices)
            : undefined,
          initialPrices: initialPrices
            ? Object.fromEntries(initialPrices)
            : undefined,
        },
        null,
        2
      )
    );
    console.log(`✅ Ground truth saved to: ${groundTruthPath}`);
  }

  // 10. Output summary for causal simulation
  if (
    config.useCausalSimulation &&
    groundTruth &&
    currentPrices &&
    initialPrices
  ) {
    console.log('\n===========================================');
    console.log('📊 CAUSAL SIMULATION SUMMARY');
    console.log('===========================================');

    // Show final prices vs initial
    console.log('\n💰 Price Changes:');
    for (const [ticker, finalPrice] of currentPrices) {
      const initial = initialPrices.get(ticker) ?? 0;
      const changePercent = ((finalPrice - initial) / initial) * 100;
      const direction = changePercent >= 0 ? '📈' : '📉';
      console.log(
        `   ${direction} ${ticker}: $${initial.toFixed(2)} → $${finalPrice.toFixed(2)} (${changePercent.toFixed(1)}%)`
      );
    }

    // Show causal events that occurred
    if (groundTruth.causalEvents) {
      console.log('\n⚡ Causal Events:');
      for (const event of groundTruth.causalEvents) {
        console.log(
          `   - Day ${event.day} Hour ${event.hour}: ${event.eventType}`
        );
        console.log(`     "${event.description}"`);
        for (const [ticker, change] of Object.entries(event.priceChanges)) {
          console.log(`     ${ticker}: ${(change * 100).toFixed(1)}%`);
        }
      }
    }

    // Show hidden narrative fact
    if (
      groundTruth.hiddenNarrativeFacts &&
      groundTruth.hiddenNarrativeFacts.length > 0
    ) {
      const fact = groundTruth.hiddenNarrativeFacts[0]!;
      console.log(`\n📜 Hidden Narrative Fact:`);
      console.log(`   "${fact.fact}"`);
      console.log(`   Sentiment: ${fact.sentiment}`);
    }
  }

  console.log('\n===========================================');
  console.log('✅ GENERATION COMPLETE');
  console.log('Data saved to: ./training-data-output/state.json');
  console.log("Review this JSON to ensure 'reasoning' fields are populated.");
}

main().catch(console.error);
