/**
 * Compare Model Performance on Benchmark
 * 
 * Runs the same benchmark with multiple models and compares results.
 */

import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager';
import { BenchmarkRunner } from '@/lib/benchmark/BenchmarkRunner';
import { prisma } from '@/lib/prisma';
import { promises as fs } from 'fs';
import * as path from 'path';

interface ModelConfig {
  name: string;
  modelId: string;
  displayName: string;
}

const MODELS: ModelConfig[] = [
  {
    name: 'llama8b',
    modelId: 'llama-3.1-8b-instant',
    displayName: 'LLaMA 8B Instant',
  },
  {
    name: 'qwen32b',
    modelId: 'qwen/qwen3-32b',
    displayName: 'Qwen 32B',
  },
];

async function runModelBenchmark(
  agentId: string,
  benchmarkPath: string,
  model: ModelConfig,
  outputDir: string
) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Running: ${model.displayName}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  const startTime = Date.now();
  const runtime = await agentRuntimeManager.getRuntime(agentId);
  
  const result = await BenchmarkRunner.runSingle({
    benchmarkPath,
    agentRuntime: runtime,
    agentUserId: agentId,
    saveTrajectory: false,
    outputDir: path.join(outputDir, model.name),
    forceModel: model.modelId,
  });
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n✅ ${model.displayName} Complete (${duration}s)\n`);
  console.log(`   P&L: $${result.metrics.totalPnl.toFixed(2)}`);
  console.log(`   Accuracy: ${(result.metrics.predictionMetrics.accuracy * 100).toFixed(1)}%`);
  console.log(`   Correct: ${result.metrics.predictionMetrics.correctPredictions}/${result.metrics.predictionMetrics.totalPositions}`);
  console.log(`   Optimality: ${result.metrics.optimalityScore.toFixed(1)}%`);
  console.log(`   Perp Trades: ${result.metrics.perpMetrics.totalTrades}`);
  
  return {
    model,
    result,
    duration: parseFloat(duration),
  };
}

async function main() {
  const benchmarkPath = process.argv[2] || 'benchmarks/benchmark-week-30-60-10-5-8-12345.json';
  const outputDir = process.argv[3] || 'benchmarks/model-comparison';
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 MODEL COMPARISON BENCHMARK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Benchmark: ${benchmarkPath}`);
  console.log(`Output: ${outputDir}\n`);
  
  // Get test agent
  const agent = await prisma.user.findFirst({
    where: {
      isAgent: true,
      username: 'trader-aggressive',
    },
  });
  
  if (!agent) {
    console.error('❌ Test agent not found');
    process.exit(1);
  }
  
  console.log(`Agent: ${agent.displayName}\n`);
  
  // Run all models
  const results = [];
  
  for (const model of MODELS) {
    const modelResult = await runModelBenchmark(
      agent.id,
      benchmarkPath,
      model,
      outputDir
    );
    results.push(modelResult);
    
    // Small delay between models
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Generate comparison
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 COMPARISON RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('┌─────────────────────┬──────────┬──────────┐');
  console.log('│ Model               │ LLaMA 8B │ Qwen 32B │');
  console.log('├─────────────────────┼──────────┼──────────┤');
  
  const llama = results[0]!;
  const qwen = results[1]!;
  
  console.log(`│ P&L                 │ $${llama.result.metrics.totalPnl.toFixed(0).padStart(7)} │ $${qwen.result.metrics.totalPnl.toFixed(0).padStart(7)} │`);
  console.log(`│ Accuracy            │ ${(llama.result.metrics.predictionMetrics.accuracy * 100).toFixed(1).padStart(6)}% │ ${(qwen.result.metrics.predictionMetrics.accuracy * 100).toFixed(1).padStart(6)}% │`);
  console.log(`│ Correct/Total       │ ${llama.result.metrics.predictionMetrics.correctPredictions.toString().padStart(2)}/${llama.result.metrics.predictionMetrics.totalPositions.toString().padEnd(2)}    │ ${qwen.result.metrics.predictionMetrics.correctPredictions.toString().padStart(2)}/${qwen.result.metrics.predictionMetrics.totalPositions.toString().padEnd(2)}    │`);
  console.log(`│ Optimality Score    │ ${llama.result.metrics.optimalityScore.toFixed(1).padStart(6)}% │ ${qwen.result.metrics.optimalityScore.toFixed(1).padStart(6)}% │`);
  console.log(`│ Perp Trades         │ ${llama.result.metrics.perpMetrics.totalTrades.toString().padStart(8)} │ ${qwen.result.metrics.perpMetrics.totalTrades.toString().padStart(8)} │`);
  console.log(`│ Duration            │ ${llama.duration.toFixed(1).padStart(7)}s │ ${qwen.duration.toFixed(1).padStart(7)}s │`);
  console.log('└─────────────────────┴──────────┴──────────┘\n');
  
  // Determine winner
  const winner = llama.result.metrics.totalPnl > qwen.result.metrics.totalPnl ? 'LLaMA 8B' : 'Qwen 32B';
  const pnlDelta = Math.abs(llama.result.metrics.totalPnl - qwen.result.metrics.totalPnl);
  const accuracyDelta = Math.abs(llama.result.metrics.predictionMetrics.accuracy - qwen.result.metrics.predictionMetrics.accuracy);
  
  console.log(`🏆 Winner: ${winner}`);
  console.log(`   P&L Delta: $${pnlDelta.toFixed(2)}`);
  console.log(`   Accuracy Delta: ${(accuracyDelta * 100).toFixed(1)}%\n`);
  
  // Save comparison
  const comparison = {
    benchmark: benchmarkPath,
    runAt: new Date().toISOString(),
    agent: {
      id: agent.id,
      name: agent.displayName,
    },
    results: results.map(r => ({
      model: r.model,
      duration: r.duration,
      metrics: r.result.metrics,
    })),
    winner,
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
  
  console.log(`Results saved to: ${outputDir}/comparison.json\n`);
  
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ ERROR:', error.message);
  process.exit(1);
});



