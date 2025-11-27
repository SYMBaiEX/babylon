/**
 * Benchmark RL Model
 *
 * Run standardized benchmarks on a trained RL model and save results.
 *
 * Usage:
 *   npx ts-node scripts/benchmark-rl-model.ts --model=babylon-agent-v1.0.0
 */

import { db } from '@/db';
import { ModelBenchmarkService } from '@/lib/benchmark/ModelBenchmarkService';
import { logger } from '@/lib/logger';

async function main() {
  const args = process.argv.slice(2);

  const modelId = args.find((a) => a.startsWith('--model='))?.split('=')[1];
  const compare = args.includes('--compare');
  const save = !args.includes('--no-save');

  if (!modelId) {
    console.error('❌ Error: --model argument is required');
    console.log('\nUsage:');
    console.log(
      '  npx ts-node scripts/benchmark-rl-model.ts --model=babylon-agent-v1.0.0'
    );
    console.log('\nOptions:');
    console.log('  --model=ID     Model ID from database (required)');
    console.log('  --compare      Compare to baseline');
    console.log("  --no-save      Don't save results to files");
    console.log('\nExamples:');
    console.log('  # Benchmark and save results');
    console.log(
      '  npx ts-node scripts/benchmark-rl-model.ts --model=babylon-agent-v1.0.0'
    );
    console.log('');
    console.log('  # Benchmark and compare to baseline');
    console.log(
      '  npx ts-node scripts/benchmark-rl-model.ts --model=babylon-agent-v1.0.0 --compare'
    );
    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       RL MODEL BENCHMARKING                            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log(`Model ID: ${modelId}`);
  console.log(`Compare to Baseline: ${compare ? 'yes' : 'no'}`);
  console.log(`Save Results: ${save ? 'yes' : 'no'}\n`);

  try {
    // Check if model exists
    const model = await db.trainedModel.findUnique({
      where: { modelId },
    });

    if (!model) {
      console.error(`❌ Model not found: ${modelId}`);
      process.exit(1);
    }

    console.log(`Found model: ${model.modelId} v${model.version}`);
    console.log(`Base model: ${model.baseModel}`);
    console.log(`Status: ${model.status}\n`);

    // Get standard benchmark paths
    console.log('📊 Loading standard benchmarks...\n');
    const benchmarkPaths =
      await ModelBenchmarkService.getStandardBenchmarkPaths();

    if (benchmarkPaths.length === 0) {
      console.error('❌ No standard benchmarks found');
      console.log('\nGenerate benchmarks with:');
      console.log('  npx ts-node scripts/generate-benchmark.ts');
      process.exit(1);
    }

    console.log(`Found ${benchmarkPaths.length} standard benchmarks:`);
    benchmarkPaths.forEach((p) => console.log(`  - ${p}`));
    console.log('');

    // Run benchmarks
    console.log('🚀 Running benchmarks...\n');

    const results = await ModelBenchmarkService.benchmarkModel({
      modelId,
      benchmarkPaths,
      saveResults: save,
    });

    console.log(`\n✅ Benchmark complete: ${results.length} runs\n`);

    // Display results
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('                 RESULTS                     ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const result of results) {
      console.log(`📊 ${result.benchmarkId}`);
      console.log(`   Run at: ${result.runAt.toISOString()}`);
      console.log('   ────────────────────────────────');
      console.log(`   P&L:        ${result.metrics.totalPnl.toFixed(2)}`);
      console.log(
        `   Accuracy:   ${(result.metrics.predictionMetrics.accuracy * 100).toFixed(1)}%`
      );
      console.log(
        `   Win Rate:   ${(result.metrics.perpMetrics.winRate * 100).toFixed(1)}%`
      );
      console.log(
        `   Optimality: ${result.metrics.optimalityScore.toFixed(1)}`
      );

      if (result.comparisonToBaseline) {
        console.log('   ────────────────────────────────');
        console.log('   vs Baseline:');
        const pnlDelta = result.comparisonToBaseline.pnlDelta;
        const accDelta = result.comparisonToBaseline.accuracyDelta;
        const optDelta = result.comparisonToBaseline.optimalityDelta;

        console.log(
          `     P&L:        ${pnlDelta > 0 ? '📈 +' : pnlDelta < 0 ? '📉 ' : '➡️  '}${pnlDelta.toFixed(2)}`
        );
        console.log(
          `     Accuracy:   ${accDelta > 0 ? '📈 +' : accDelta < 0 ? '📉 ' : '➡️  '}${(accDelta * 100).toFixed(1)}%`
        );
        console.log(
          `     Optimality: ${optDelta > 0 ? '📈 +' : optDelta < 0 ? '📉 ' : '➡️  '}${optDelta.toFixed(1)}`
        );
        console.log(
          `     Improved:   ${result.comparisonToBaseline.improved ? '✅ Yes' : '❌ No'}`
        );
      }
      console.log('');
    }

    // Calculate averages
    const avgPnl =
      results.reduce((sum, r) => sum + r.metrics.totalPnl, 0) / results.length;
    const avgAccuracy =
      results.reduce(
        (sum, r) => sum + r.metrics.predictionMetrics.accuracy,
        0
      ) / results.length;
    const avgWinRate =
      results.reduce((sum, r) => sum + r.metrics.perpMetrics.winRate, 0) /
      results.length;
    const avgOptimality =
      results.reduce((sum, r) => sum + r.metrics.optimalityScore, 0) /
      results.length;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('              AVERAGE PERFORMANCE            ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`P&L:        ${avgPnl.toFixed(2)}`);
    console.log(`Accuracy:   ${(avgAccuracy * 100).toFixed(1)}%`);
    console.log(`Win Rate:   ${(avgWinRate * 100).toFixed(1)}%`);
    console.log(`Optimality: ${avgOptimality.toFixed(1)}\n`);

    // Compare to baseline if requested
    if (compare) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('          COMPARISON TO BASELINE            ');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      const comparison = await ModelBenchmarkService.compareToBaseline(modelId);

      console.log(`New Model (${comparison.newModel.version}):`);
      console.log(
        `  P&L:        ${comparison.newModel.avgMetrics.totalPnl.toFixed(2)}`
      );
      console.log(
        `  Accuracy:   ${(comparison.newModel.avgMetrics.accuracy * 100).toFixed(1)}%`
      );
      console.log(
        `  Optimality: ${comparison.newModel.avgMetrics.optimality.toFixed(1)}`
      );
      console.log('');
      console.log('Baseline:');
      console.log(
        `  P&L:        ${comparison.baseline.avgMetrics.totalPnl.toFixed(2)}`
      );
      console.log(
        `  Accuracy:   ${(comparison.baseline.avgMetrics.accuracy * 100).toFixed(1)}%`
      );
      console.log(
        `  Optimality: ${comparison.baseline.avgMetrics.optimality.toFixed(1)}`
      );
      console.log('');
      console.log('Improvement:');
      console.log(
        `  P&L Delta:        ${comparison.improvement.pnlDelta > 0 ? '+' : ''}${comparison.improvement.pnlDelta.toFixed(2)}`
      );
      console.log(
        `  Accuracy Delta:   ${comparison.improvement.accuracyDelta > 0 ? '+' : ''}${(comparison.improvement.accuracyDelta * 100).toFixed(1)}%`
      );
      console.log(
        `  Optimality Delta: ${comparison.improvement.optimalityDelta > 0 ? '+' : ''}${comparison.improvement.optimalityDelta.toFixed(1)}`
      );
      console.log(
        `  Is Improvement:   ${comparison.improvement.isImprovement ? '✅ Yes' : '❌ No'}`
      );
      console.log('');
      console.log(
        `📋 Recommendation: ${comparison.recommendation.toUpperCase()}\n`
      );
    }

    if (save) {
      console.log('💾 Results saved to: benchmarks/model-results/\n');
    }

    await db.$disconnect();
  } catch (error) {
    logger.error('Benchmark failed', { error });
    console.error('\n❌ BENCHMARK FAILED\n');
    console.error(error instanceof Error ? error.message : String(error));
    await db.$disconnect();
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await db.$disconnect();
  process.exit(1);
});
