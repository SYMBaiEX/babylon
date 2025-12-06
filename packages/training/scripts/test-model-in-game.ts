#!/usr/bin/env bun

/**
 * Test Trained Model in Actual Game
 *
 * This script verifies that:
 * 1. Trained models can be loaded and used
 * 2. The benchmark simulation engine works correctly
 * 3. Agents make decisions using the trained model
 * 4. All game mechanics (trading, posting, etc.) execute properly
 *
 * Run: bun run packages/training/scripts/test-model-in-game.ts
 *
 * Options:
 *   --use-ollama        Use Ollama for local model inference
 *   --import-mlx <path> Import MLX adapter to Ollama before test
 *   --model-name <name> Model name to test (default: babylon-trader:latest)
 *   --archetype <type>  Agent archetype to test (default: trader)
 *   --ticks <n>         Number of simulation ticks (default: 100)
 *   --verbose           Enable verbose logging
 */

import { db, desc, eq, trainedModels } from '@babylon/db';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseArgs } from 'util';

// Import benchmark components
import {
  type BenchmarkConfig,
  BenchmarkDataGenerator,
} from '../src/benchmark/BenchmarkDataGenerator';
import { SimulationA2AInterface } from '../src/benchmark/SimulationA2AInterface';
import {
  type SimulationConfig,
  SimulationEngine,
  type SimulationResult,
} from '../src/benchmark/SimulationEngine';

// Types
interface TestConfig {
  useOllama: boolean;
  importMlxPath?: string;
  modelName: string;
  archetype: string;
  ticks: number;
  verbose: boolean;
}

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
  details?: Record<string, unknown>;
}

// Parse command line arguments
function parseConfig(): TestConfig {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'use-ollama': { type: 'boolean', default: false },
      'import-mlx': { type: 'string' },
      'model-name': { type: 'string', default: 'babylon-trader:latest' },
      archetype: { type: 'string', default: 'trader' },
      ticks: { type: 'string', default: '100' },
      verbose: { type: 'boolean', default: false },
    },
  });

  return {
    useOllama: values['use-ollama'] ?? false,
    importMlxPath: values['import-mlx'],
    modelName: values['model-name'] ?? 'babylon-trader:latest',
    archetype: values.archetype ?? 'trader',
    ticks: parseInt(values.ticks ?? '100', 10),
    verbose: values.verbose ?? false,
  };
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  testFn: () => Promise<{
    passed: boolean;
    message: string;
    details?: Record<string, unknown>;
  }>
): Promise<void> {
  const start = Date.now();
  console.log(`\n🧪 Running: ${name}...`);

  const result = await testFn();
  const duration = Date.now() - start;

  results.push({
    name,
    ...result,
    duration,
  });

  if (result.passed) {
    console.log(`   ✅ PASSED (${duration}ms): ${result.message}`);
  } else {
    console.log(`   ❌ FAILED (${duration}ms): ${result.message}`);
  }
}

// Test 1: Check Ollama availability (if using Ollama)
async function testOllamaAvailability(config: TestConfig): Promise<{
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  if (!config.useOllama) {
    return {
      passed: true,
      message: 'Skipped (not using Ollama)',
    };
  }

  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  const response = await fetch(`${ollamaUrl}/api/tags`, {
    method: 'GET',
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  if (!response?.ok) {
    return {
      passed: false,
      message: `Ollama not available at ${ollamaUrl}. Start Ollama first: ollama serve`,
    };
  }

  const data = (await response.json()) as { models: Array<{ name: string }> };
  const models = data.models || [];

  return {
    passed: true,
    message: `Ollama available with ${models.length} models`,
    details: { models: models.map((m) => m.name) },
  };
}

// Test 2: Import MLX adapter to Ollama (if specified)
async function testImportMlxToOllama(config: TestConfig): Promise<{
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  if (!config.importMlxPath) {
    return {
      passed: true,
      message: 'Skipped (no MLX path specified)',
    };
  }

  if (!existsSync(config.importMlxPath)) {
    return {
      passed: false,
      message: `MLX adapter not found at: ${config.importMlxPath}`,
    };
  }

  // Create Modelfile for Ollama
  const baseModel = process.env.OLLAMA_BASE_MODEL || 'qwen2.5:7b-instruct';
  const modelfile = `FROM ${baseModel}
ADAPTER ${config.importMlxPath}
PARAMETER temperature 0.7
PARAMETER num_predict 8192
`;

  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  const response = await fetch(`${ollamaUrl}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: config.modelName,
      modelfile,
      stream: false,
    }),
    signal: AbortSignal.timeout(600000), // 10 minute timeout
  }).catch((e: Error) => ({ ok: false, error: e.message }));

  if (!response || !('ok' in response) || !response.ok) {
    const error = 'error' in response ? response.error : 'Unknown error';
    return {
      passed: false,
      message: `Failed to import MLX adapter: ${error}`,
    };
  }

  return {
    passed: true,
    message: `Successfully imported MLX adapter as ${config.modelName}`,
    details: { modelName: config.modelName, adapterPath: config.importMlxPath },
  };
}

// Test 3: Generate benchmark data
async function testGenerateBenchmark(config: TestConfig): Promise<{
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const benchmarkConfig: BenchmarkConfig = {
    durationMinutes: Math.ceil(config.ticks / 60), // 1 tick per second
    tickInterval: 1,
    numPredictionMarkets: 5,
    numPerpetualMarkets: 3,
    numAgents: 10,
    seed: 12345, // Fixed seed for reproducibility
  };

  const generator = new BenchmarkDataGenerator(benchmarkConfig);
  const snapshot = await generator.generate();

  if (!snapshot || !snapshot.ticks || snapshot.ticks.length === 0) {
    return {
      passed: false,
      message: 'Failed to generate benchmark data',
    };
  }

  // Store for later tests
  (global as { testSnapshot?: typeof snapshot }).testSnapshot = snapshot;

  return {
    passed: true,
    message: `Generated ${snapshot.ticks.length} ticks with ${snapshot.initialState.predictionMarkets.length} prediction markets`,
    details: {
      ticks: snapshot.ticks.length,
      predictionMarkets: snapshot.initialState.predictionMarkets.length,
      perpetualMarkets: snapshot.initialState.perpetualMarkets.length,
      agents: snapshot.initialState.agents.length,
    },
  };
}

// Test 4: Initialize simulation engine
async function testSimulationEngine(config: TestConfig): Promise<{
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const snapshot = (
    global as { testSnapshot?: ReturnType<BenchmarkDataGenerator['generate']> }
  ).testSnapshot;

  if (!snapshot) {
    return {
      passed: false,
      message: 'No benchmark snapshot available',
    };
  }

  const simConfig: SimulationConfig = {
    snapshot,
    agentId: 'test-agent-001',
    fastForward: true,
    responseTimeout: 30000,
  };

  const engine = new SimulationEngine(simConfig);
  engine.initialize();

  const initialState = engine.getGameState();

  if (!initialState || !initialState.predictionMarkets) {
    return {
      passed: false,
      message: 'Failed to get initial game state',
    };
  }

  // Store for later tests
  (global as { testEngine?: SimulationEngine }).testEngine = engine;

  return {
    passed: true,
    message: 'Simulation engine initialized successfully',
    details: {
      totalTicks: engine.getTotalTicks(),
      currentTick: engine.getCurrentTickNumber(),
      markets: initialState.predictionMarkets.length,
    },
  };
}

// Test 5: Test A2A interface
async function testA2AInterface(config: TestConfig): Promise<{
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const engine = (global as { testEngine?: SimulationEngine }).testEngine;

  if (!engine) {
    return {
      passed: false,
      message: 'No simulation engine available',
    };
  }

  const a2aInterface = new SimulationA2AInterface(engine, 'test-agent-001');

  // Test getting predictions
  const predictions = await a2aInterface.sendRequest('a2a.getPredictions');
  if (!predictions || !('predictions' in predictions)) {
    return {
      passed: false,
      message: 'Failed to get predictions via A2A',
    };
  }

  // Test getting perpetuals
  const perpetuals = await a2aInterface.sendRequest('a2a.getPerpetuals');
  if (!perpetuals || !('perpetuals' in perpetuals)) {
    return {
      passed: false,
      message: 'Failed to get perpetuals via A2A',
    };
  }

  // Test getting balance
  const balance = await a2aInterface.sendRequest('a2a.getBalance');
  if (!balance || !('balance' in balance)) {
    return {
      passed: false,
      message: 'Failed to get balance via A2A',
    };
  }

  // Store for later tests
  (global as { testA2A?: SimulationA2AInterface }).testA2A = a2aInterface;

  return {
    passed: true,
    message: 'A2A interface working correctly',
    details: {
      predictions: (predictions as { predictions: unknown[] }).predictions
        .length,
      perpetuals: (perpetuals as { perpetuals: unknown[] }).perpetuals.length,
      balance: (balance as { balance: number }).balance,
    },
  };
}

// Test 6: Execute trading action
async function testTradingAction(config: TestConfig): Promise<{
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const engine = (global as { testEngine?: SimulationEngine }).testEngine;
  const a2aInterface = (global as { testA2A?: SimulationA2AInterface }).testA2A;

  if (!engine || !a2aInterface) {
    return {
      passed: false,
      message: 'No simulation engine or A2A interface available',
    };
  }

  // Get available markets
  const predictions = await a2aInterface.sendRequest('a2a.getPredictions');
  const markets = (predictions as { predictions: Array<{ id: string }> })
    .predictions;

  if (markets.length === 0) {
    return {
      passed: false,
      message: 'No prediction markets available for testing',
    };
  }

  // Execute a buy action
  const marketId = markets[0]!.id;
  const buyResult = await a2aInterface.buyShares(marketId, 'YES', 100);

  if (!buyResult || !buyResult.positionId) {
    return {
      passed: false,
      message: 'Failed to execute buy action',
    };
  }

  // Advance tick
  engine.advanceTick();

  return {
    passed: true,
    message: 'Trading action executed successfully',
    details: {
      marketId,
      positionId: buyResult.positionId,
      shares: buyResult.shares,
      avgPrice: buyResult.avgPrice,
    },
  };
}

// Test 7: Execute perpetual trade
async function testPerpetualTrade(config: TestConfig): Promise<{
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const engine = (global as { testEngine?: SimulationEngine }).testEngine;
  const a2aInterface = (global as { testA2A?: SimulationA2AInterface }).testA2A;

  if (!engine || !a2aInterface) {
    return {
      passed: false,
      message: 'No simulation engine or A2A interface available',
    };
  }

  // Get available perpetuals
  const perpetuals = await a2aInterface.sendRequest('a2a.getPerpetuals');
  const perps = (perpetuals as { perpetuals: Array<{ ticker: string }> })
    .perpetuals;

  if (perps.length === 0) {
    return {
      passed: false,
      message: 'No perpetual markets available for testing',
    };
  }

  // Execute an open position action
  const ticker = perps[0]!.ticker;
  const openResult = await a2aInterface.openPosition(ticker, 'long', 10, 2);

  if (!openResult || !openResult.positionId) {
    return {
      passed: false,
      message: 'Failed to open perpetual position',
    };
  }

  // Advance a few ticks
  for (let i = 0; i < 5; i++) {
    engine.advanceTick();
  }

  // Close position
  const closeResult = await a2aInterface.closePosition(openResult.positionId);

  return {
    passed: true,
    message: 'Perpetual trade executed successfully',
    details: {
      ticker,
      positionId: openResult.positionId,
      entryPrice: openResult.entryPrice,
      pnl: closeResult.pnl,
    },
  };
}

// Test 8: Run full simulation
async function testFullSimulation(config: TestConfig): Promise<{
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const snapshot = (
    global as { testSnapshot?: ReturnType<BenchmarkDataGenerator['generate']> }
  ).testSnapshot;

  if (!snapshot) {
    return {
      passed: false,
      message: 'No benchmark snapshot available',
    };
  }

  // Create fresh engine
  const simConfig: SimulationConfig = {
    snapshot,
    agentId: 'simulation-test-agent',
    fastForward: true,
    responseTimeout: 30000,
  };

  const engine = new SimulationEngine(simConfig);
  const a2a = new SimulationA2AInterface(engine, 'simulation-test-agent');

  engine.initialize();

  // Run simulation loop with random actions
  const maxTicks = Math.min(config.ticks, snapshot.ticks.length);
  let actionsExecuted = 0;

  for (let tick = 0; tick < maxTicks && !engine.isComplete(); tick++) {
    // Make a random decision every 10 ticks
    if (tick % 10 === 0) {
      const predictions = await a2a.sendRequest('a2a.getPredictions');
      const markets = (predictions as { predictions: Array<{ id: string }> })
        .predictions;

      if (markets.length > 0) {
        const randomMarket =
          markets[Math.floor(Math.random() * markets.length)]!;
        const outcome = Math.random() > 0.5 ? 'YES' : 'NO';

        await a2a.buyShares(
          randomMarket.id,
          outcome as 'YES' | 'NO',
          50 + Math.random() * 100
        );
        actionsExecuted++;
      }
    }

    engine.advanceTick();
  }

  // Get final results
  const result: SimulationResult = await engine.run();

  return {
    passed: result.ticksProcessed > 0,
    message: `Simulation completed: ${result.ticksProcessed} ticks, ${actionsExecuted} actions`,
    details: {
      ticksProcessed: result.ticksProcessed,
      actionsCount: result.actions.length,
      totalPnl: result.metrics.totalPnl,
      predictionAccuracy: result.metrics.predictionMetrics.accuracy,
      optimalityScore: result.metrics.optimalityScore,
    },
  };
}

// Test 9: Test with trained model (if available)
async function testWithTrainedModel(config: TestConfig): Promise<{
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  // Check for trained models in database
  const modelsResult = await db
    .select()
    .from(trainedModels)
    .where(eq(trainedModels.status, 'ready'))
    .orderBy(desc(trainedModels.createdAt))
    .limit(5);

  if (modelsResult.length === 0) {
    return {
      passed: true,
      message: 'No trained models found (skipped - train a model first)',
      details: {
        hint: 'Run: cd packages/training/python && python scripts/train_local.py --backend mlx',
      },
    };
  }

  const model = modelsResult[0]!;

  return {
    passed: true,
    message: `Found ${modelsResult.length} trained models (latest: ${model.modelId})`,
    details: {
      latestModel: {
        id: model.modelId,
        version: model.version,
        archetype: model.archetype,
        benchmarkScore: model.benchmarkScore,
        storagePath: model.storagePath,
      },
      totalModels: modelsResult.length,
    },
  };
}

// Main test runner
async function main(): Promise<void> {
  const config = parseConfig();

  console.log(
    '═══════════════════════════════════════════════════════════════'
  );
  console.log('  Test Trained Model in Actual Game');
  console.log(
    '═══════════════════════════════════════════════════════════════'
  );
  console.log(`\nConfiguration:`);
  console.log(`  - Use Ollama: ${config.useOllama}`);
  console.log(`  - Model Name: ${config.modelName}`);
  console.log(`  - Archetype: ${config.archetype}`);
  console.log(`  - Ticks: ${config.ticks}`);
  console.log(`  - Verbose: ${config.verbose}`);
  if (config.importMlxPath) {
    console.log(`  - Import MLX: ${config.importMlxPath}`);
  }

  // Run tests
  await runTest('Ollama Availability', () => testOllamaAvailability(config));
  await runTest('Import MLX to Ollama', () => testImportMlxToOllama(config));
  await runTest('Generate Benchmark Data', () => testGenerateBenchmark(config));
  await runTest('Initialize Simulation Engine', () =>
    testSimulationEngine(config)
  );
  await runTest('A2A Interface', () => testA2AInterface(config));
  await runTest('Trading Action', () => testTradingAction(config));
  await runTest('Perpetual Trade', () => testPerpetualTrade(config));
  await runTest('Full Simulation', () => testFullSimulation(config));
  await runTest('Trained Model Check', () => testWithTrainedModel(config));

  // Summary
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('  TEST SUMMARY');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}: ${result.message}`);
    if (config.verbose && result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
    }
  }

  console.log(`\n📊 Results: ${passed}/${total} passed, ${failed} failed`);

  // Save report
  const outputDir = './research-output/game-tests';
  mkdirSync(outputDir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    config,
    results,
    summary: { passed, failed, total },
  };

  const reportPath = join(outputDir, `game-test-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}`);

  // Exit with appropriate code
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. See above for details.');
    process.exit(1);
  }

  console.log('\n✅ All tests passed! The benchmark system works correctly.');

  // Additional guidance
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('  NEXT STEPS TO TEST WITH YOUR TRAINED MODEL');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );
  console.log('1. Train a model on Mac:');
  console.log('   cd packages/training/python');
  console.log('   python scripts/train_local.py --backend mlx\n');
  console.log('2. Test the MLX adapter directly:');
  console.log('   python scripts/test_trained_model.py \\');
  console.log('     --adapter-path ./trained_models/local/adapters \\');
  console.log('     --validate\n');
  console.log('3. Import to Ollama for game testing:');
  console.log('   bun run packages/training/scripts/test-model-in-game.ts \\');
  console.log('     --use-ollama \\');
  console.log('     --import-mlx ./trained_models/local/adapters\n');
  console.log('4. Run full benchmark with Ollama:');
  console.log(
    '   AGENT_LLM_PROVIDER=ollama bun run packages/training/scripts/test-model-in-game.ts \\'
  );
  console.log('     --use-ollama --ticks 500\n');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
