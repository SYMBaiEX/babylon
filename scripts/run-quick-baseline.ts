/**
 * Quick Baseline Test with Detailed Logging
 *
 * Runs a short baseline benchmark with one model to verify everything works correctly.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { db } from '@/db';
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager';
import { BenchmarkRunner } from '@/lib/benchmark/BenchmarkRunner';

async function main() {
  const benchmarkPath =
    process.argv[2] || 'benchmarks/benchmark-week-30-60-10-5-8-12345.json';
  const modelId = process.argv[3] || 'llama-3.1-8b-instant';
  const outputDir = 'benchmarks/quick-test';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 QUICK BASELINE TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Benchmark: ${benchmarkPath}`);
  console.log(`Model: ${modelId}`);
  console.log(`Output: ${outputDir}\n`);

  // Get test agent
  const agent = await db.user.findFirst({
    where: {
      isAgent: true,
      username: 'trader-aggressive',
    },
  });

  if (!agent) {
    console.error(
      '❌ Test agent not found. Run: bun run scripts/ensure-test-agents.ts'
    );
    process.exit(1);
  }

  console.log(
    `Using agent: ${agent.displayName} (${agent.id.substring(0, 12)}...)\n`
  );

  // Get runtime
  console.log('⚙️  Initializing runtime...');
  const runtime = await agentRuntimeManager.getRuntime(agent.id);
  console.log('✅ Runtime ready\n');

  // Run benchmark
  console.log(`🏃 Running benchmark with ${modelId}...\n`);
  const startTime = Date.now();

  const result = await BenchmarkRunner.runSingle({
    benchmarkPath,
    agentRuntime: runtime,
    agentUserId: agent.id,
    saveTrajectory: false,
    outputDir,
    forceModel: modelId,
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ BENCHMARK COMPLETE (${duration}s)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📊 Results:');
  console.log(`   Ticks Processed: ${result.ticksProcessed}`);
  console.log(`   Total Actions: ${result.actions.length}`);
  console.log(`   Duration: ${duration}s`);
  console.log(
    `   Avg per tick: ${(Number.parseFloat(duration) / result.ticksProcessed).toFixed(2)}s\n`
  );

  console.log('💰 Trading Performance:');
  console.log(`   Total P&L: $${result.metrics.totalPnl.toFixed(2)}`);
  console.log(
    `   Prediction Trades: ${result.metrics.predictionMetrics.totalPositions}`
  );
  console.log(
    `   Correct Predictions: ${result.metrics.predictionMetrics.correctPredictions}`
  );
  console.log(
    `   Incorrect Predictions: ${result.metrics.predictionMetrics.incorrectPredictions}`
  );
  console.log(
    `   Prediction Accuracy: ${(result.metrics.predictionMetrics.accuracy * 100).toFixed(1)}%`
  );
  console.log(
    `   Avg P&L per Position: $${result.metrics.predictionMetrics.avgPnlPerPosition.toFixed(2)}\n`
  );

  console.log('📈 Perp Trading:');
  console.log(`   Total Trades: ${result.metrics.perpMetrics.totalTrades}`);
  console.log(
    `   Profitable Trades: ${result.metrics.perpMetrics.profitableTrades}`
  );
  console.log(
    `   Win Rate: ${(result.metrics.perpMetrics.winRate * 100).toFixed(1)}%`
  );
  console.log(
    `   Avg P&L per Trade: $${result.metrics.perpMetrics.avgPnlPerTrade.toFixed(2)}\n`
  );

  console.log('🎯 Overall:');
  console.log(
    `   Optimality Score: ${result.metrics.optimalityScore.toFixed(1)}%`
  );
  console.log(
    `   Avg Response Time: ${result.metrics.timing.avgResponseTime.toFixed(2)}ms\n`
  );

  // Check for issues
  const issues: string[] = [];

  if (result.ticksProcessed === 0) {
    issues.push('❌ No ticks processed!');
  }

  if (result.actions.length === 0) {
    issues.push('❌ No actions taken!');
  }

  if (
    result.metrics.predictionMetrics.totalPositions === 0 &&
    result.metrics.perpMetrics.totalTrades === 0
  ) {
    issues.push('❌ No trades executed!');
  }

  if (
    result.metrics.predictionMetrics.totalPositions > 0 &&
    result.metrics.predictionMetrics.accuracy === 0
  ) {
    issues.push('⚠️  0% accuracy - agent got ALL predictions wrong!');
  }

  if (result.metrics.optimalityScore < 20) {
    issues.push('⚠️  Very low optimality score (<20%)');
  }

  if (issues.length > 0) {
    console.log('🚨 Issues Detected:\n');
    issues.forEach((issue) => console.log(`   ${issue}`));
    console.log('');
  } else {
    console.log('✅ All metrics look reasonable!\n');
  }

  // Save summary
  const summary = {
    model: modelId,
    benchmark: benchmarkPath,
    runAt: new Date().toISOString(),
    duration: Number.parseFloat(duration),
    metrics: result.metrics,
    issues,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log(`Results saved to: ${outputDir}/\n`);

  await db.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ ERROR:', error.message);
  console.error(error);
  process.exit(1);
});
