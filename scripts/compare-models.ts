/**
 * Compare Model Performance on Benchmark
 *
 * Runs the same benchmark with multiple models and compares results.
 *
 * Usage:
 *   bun run scripts/compare-models.ts [benchmark] [output-dir] [--models=model1,model2]
 *
 * Examples:
 *   bun run scripts/compare-models.ts                                    # Default benchmark, default models
 *   bun run scripts/compare-models.ts benchmarks/benchmark-week-30-60-10-5-8-12345.json
 *   bun run scripts/compare-models.ts --models=llama-8b,qwen-32b         # Specific models from registry
 *   bun run scripts/compare-models.ts --models=llama-3.1-8b-instant      # Also accepts model IDs
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { db } from '@babylon/db';
import { agentRuntimeManager } from '@babylon/agents';
import {
  BenchmarkChartGenerator,
  BenchmarkRunner,
  getBaselineModels,
  getModelById,
  getModelByModelId,
  MODEL_REGISTRY,
  type ModelComparisonData,
  type ModelConfig,
} from '@babylon/training';

/**
 * Parse model selection from command line args
 */
function parseModelSelection(args: string[]): ModelConfig[] {
  const modelsArg = args.find((a) => a.startsWith('--models='));

  if (!modelsArg) {
    // Default to baseline models
    return getBaselineModels();
  }

  const modelIds = modelsArg.split('=')[1]?.split(',') ?? [];
  const models: ModelConfig[] = [];

  for (const id of modelIds) {
    // Try to find by registry ID first, then by model API ID
    const model = getModelById(id.trim()) ?? getModelByModelId(id.trim());
    if (model) {
      models.push(model);
    } else {
      console.warn(`⚠️  Unknown model: ${id}. Available models:`);
      for (const m of MODEL_REGISTRY) {
        console.log(`     - ${m.id} (${m.displayName})`);
      }
      process.exit(1);
    }
  }

  return models;
}

/**
 * Show available models
 */
function showAvailableModels(): void {
  console.log('\n📋 Available Models:\n');
  for (const m of MODEL_REGISTRY) {
    const baseline = m.isBaseline ? ' [baseline]' : '';
    console.log(`   ${m.id.padEnd(15)} - ${m.displayName}${baseline}`);
  }
  console.log('');
}

async function runModelBenchmark(
  agentId: string,
  benchmarkPath: string,
  model: ModelConfig,
  outputDir: string
): Promise<{
  model: ModelConfig;
  result: Awaited<ReturnType<typeof BenchmarkRunner.runSingle>>;
  duration: number;
}> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Running: ${model.displayName}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();
  const runtime = await agentRuntimeManager.getRuntime(agentId);

  const result = await BenchmarkRunner.runSingle({
    benchmarkPath,
    agentRuntime: runtime,
    agentUserId: agentId,
    saveTrajectory: false,
    outputDir: path.join(outputDir, model.id),
    forceModel: model.modelId,
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ ${model.displayName} Complete (${duration}s)\n`);
  console.log(`   P&L: $${result.metrics.totalPnl.toFixed(2)}`);
  console.log(
    `   Accuracy: ${(result.metrics.predictionMetrics.accuracy * 100).toFixed(1)}%`
  );
  console.log(
    `   Correct: ${result.metrics.predictionMetrics.correctPredictions}/${result.metrics.predictionMetrics.totalPositions}`
  );
  console.log(`   Optimality: ${result.metrics.optimalityScore.toFixed(1)}%`);
  console.log(`   Perp Trades: ${result.metrics.perpMetrics.totalTrades}`);

  return {
    model,
    result,
    duration: Number.parseFloat(duration),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔬 MODEL COMPARISON BENCHMARK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage:
  bun run scripts/compare-models.ts [benchmark] [output-dir] [--models=model1,model2]

Options:
  --models=...     Comma-separated list of models to compare
  --list-models    Show available models
  --help           Show this help

Examples:
  bun run scripts/compare-models.ts
  bun run scripts/compare-models.ts benchmarks/benchmark-week-30-60-10-5-8-12345.json
  bun run scripts/compare-models.ts --models=llama-8b,qwen-32b
  bun run scripts/compare-models.ts benchmarks/benchmark-week-30-60-10-5-8-12345.json output --models=llama-8b,llama-70b
`);
    showAvailableModels();
    process.exit(0);
  }

  // Check for list models
  if (args.includes('--list-models')) {
    showAvailableModels();
    process.exit(0);
  }

  // Parse arguments
  const nonFlagArgs = args.filter((a) => !a.startsWith('--'));
  const benchmarkPath =
    nonFlagArgs[0] ?? 'benchmarks/benchmark-week-30-60-10-5-8-12345.json';
  const outputDir = nonFlagArgs[1] ?? 'benchmarks/model-comparison';

  // Parse model selection
  const models = parseModelSelection(args);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 MODEL COMPARISON BENCHMARK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Benchmark: ${benchmarkPath}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Models: ${models.map((m) => m.displayName).join(', ')}\n`);

  // Get test agent
  const agent = await db.user.findFirst({
    where: {
      isAgent: true,
      username: 'trader-aggressive',
    },
  });

  if (!agent) {
    console.error(
      '❌ Test agent not found. Run: babylon agent spawn'
    );
    process.exit(1);
  }

  console.log(`Agent: ${agent.displayName}\n`);

  // Run all models
  const results: Array<{
    model: ModelConfig;
    result: Awaited<ReturnType<typeof BenchmarkRunner.runSingle>>;
    duration: number;
  }> = [];

  for (const model of models) {
    const modelResult = await runModelBenchmark(
      agent.id,
      benchmarkPath,
      model,
      outputDir
    );
    results.push(modelResult);

    // Small delay between models
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Convert to ModelComparisonData for chart generation
  const comparisonData: ModelComparisonData[] = results.map((r) => ({
    modelId: r.model.modelId,
    modelName: r.model.displayName,
    metrics: r.result.metrics,
    runAt: new Date(),
  }));

  // Print terminal summary with charts
  console.log(BenchmarkChartGenerator.generateTerminalSummary(comparisonData));

  // Determine winner
  const sorted = [...results].sort(
    (a, b) => b.result.metrics.totalPnl - a.result.metrics.totalPnl
  );
  const winner = sorted[0]!;
  const loser = sorted[sorted.length - 1]!;
  const pnlDelta = Math.abs(
    winner.result.metrics.totalPnl - loser.result.metrics.totalPnl
  );
  const accuracyDelta = Math.abs(
    winner.result.metrics.predictionMetrics.accuracy -
      loser.result.metrics.predictionMetrics.accuracy
  );

  // Save comparison
  const comparison = {
    benchmark: benchmarkPath,
    runAt: new Date().toISOString(),
    agent: {
      id: agent.id,
      name: agent.displayName,
    },
    results: results.map((r) => ({
      model: {
        name: r.model.id,
        modelId: r.model.modelId,
        displayName: r.model.displayName,
      },
      duration: r.duration,
      metrics: r.result.metrics,
    })),
    winner: winner.model.displayName,
    deltas: {
      pnl: pnlDelta,
      accuracy: accuracyDelta,
    },
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'comparison.json'),
    JSON.stringify(comparison, null, 2)
  );

  // Generate HTML report
  const reportPath = path.join(outputDir, 'report.html');
  await BenchmarkChartGenerator.generateReport(comparisonData, reportPath, {
    title: 'Model Comparison Benchmark',
    benchmarkId: benchmarkPath,
  });

  console.log(`Results saved to: ${outputDir}/comparison.json`);
  console.log(`HTML Report: ${outputDir}/report.html`);
  console.log(`\nOpen report: file://${path.resolve(reportPath)}\n`);

  await db.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ ERROR:', error.message);
  process.exit(1);
});
