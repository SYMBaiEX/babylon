#!/usr/bin/env bun
/**
 * Benchmark Results CLI
 *
 * View, compare, and visualize benchmark results.
 *
 * Usage:
 *   bun run scripts/benchmark-results.ts list                    - List all benchmark results
 *   bun run scripts/benchmark-results.ts view <path>             - View a benchmark result
 *   bun run scripts/benchmark-results.ts compare <dir>           - Compare models in a directory
 *   bun run scripts/benchmark-results.ts report <dir> [output]   - Generate HTML report
 *   bun run scripts/benchmark-results.ts history                 - Show historical trends
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  BenchmarkChartGenerator,
  type ModelComparisonData,
} from '@/lib/benchmark/BenchmarkChartGenerator';
import { getModelDisplayName } from '@/lib/benchmark/ModelRegistry';
import type { SimulationMetrics } from '@/lib/benchmark/SimulationEngine';

interface BenchmarkResultFile {
  modelId?: string;
  model?: {
    name: string;
    modelId: string;
    displayName: string;
  };
  metrics?: SimulationMetrics;
  totalPnl?: number;
  predictionMetrics?: SimulationMetrics['predictionMetrics'];
  perpMetrics?: SimulationMetrics['perpMetrics'];
  socialMetrics?: SimulationMetrics['socialMetrics'];
  timing?: SimulationMetrics['timing'];
  optimalityScore?: number;
  runAt?: string;
}

interface ComparisonFile {
  benchmark: string;
  runAt: string;
  results: Array<{
    model: {
      name: string;
      modelId: string;
      displayName: string;
    };
    duration: number;
    metrics: SimulationMetrics;
  }>;
  winner: string;
  deltas: {
    pnl: number;
    accuracy: number;
  };
}

async function listResults(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 AVAILABLE BENCHMARK RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const benchmarksDir = path.join(process.cwd(), 'benchmarks');

  // List comparison directories
  const dirs = [
    'baselines',
    'model-comparison',
    'test-baselines',
    'quick-test',
  ];

  for (const dir of dirs) {
    const fullPath = path.join(benchmarksDir, dir);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        const files = await fs.readdir(fullPath);
        const jsonFiles = files.filter((f) => f.endsWith('.json'));
        console.log(`📁 ${dir}/`);
        for (const file of jsonFiles) {
          console.log(`   └─ ${file}`);
        }
        console.log('');
      }
    } catch {
      // Directory doesn't exist
    }
  }

  // List benchmark data files
  console.log('📊 Benchmark Data Files:');
  try {
    const files = await fs.readdir(benchmarksDir);
    const benchmarkFiles = files.filter(
      (f) => f.startsWith('benchmark-') && f.endsWith('.json')
    );
    for (const file of benchmarkFiles) {
      const fullPath = path.join(benchmarksDir, file);
      const stat = await fs.stat(fullPath);
      const sizeMb = (stat.size / 1024 / 1024).toFixed(2);
      console.log(`   └─ ${file} (${sizeMb} MB)`);
    }
  } catch (error) {
    console.error('Error reading benchmarks directory:', error);
  }

  console.log('\n');
}

async function viewResult(filePath: string): Promise<void> {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 BENCHMARK RESULT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const data = JSON.parse(content) as BenchmarkResultFile;

    // Check if this is a comparison file
    if ('results' in data && Array.isArray((data as ComparisonFile).results)) {
      await viewComparisonResult(data as ComparisonFile);
      return;
    }

    // Single result file
    const metrics = data.metrics ?? {
      totalPnl: data.totalPnl ?? 0,
      predictionMetrics: data.predictionMetrics ?? {
        totalPositions: 0,
        correctPredictions: 0,
        incorrectPredictions: 0,
        accuracy: 0,
        avgPnlPerPosition: 0,
      },
      perpMetrics: data.perpMetrics ?? {
        totalTrades: 0,
        profitableTrades: 0,
        winRate: 0,
        avgPnlPerTrade: 0,
        maxDrawdown: 0,
      },
      socialMetrics: data.socialMetrics ?? {
        postsCreated: 0,
        groupsJoined: 0,
        messagesReceived: 0,
        reputationGained: 0,
      },
      timing: data.timing ?? {
        avgResponseTime: 0,
        maxResponseTime: 0,
        totalDuration: 0,
      },
      optimalityScore: data.optimalityScore ?? 0,
    };

    const modelName =
      data.model?.displayName ?? data.modelId ?? 'Unknown Model';

    console.log(`Model: ${modelName}`);
    console.log(`Run At: ${data.runAt ?? 'Unknown'}\n`);

    console.log('💰 Performance:');
    console.log(`   Total P&L: $${metrics.totalPnl.toFixed(2)}`);
    console.log(
      `   Optimality Score: ${metrics.optimalityScore.toFixed(1)}%\n`
    );

    console.log('🎯 Prediction Markets:');
    console.log(
      `   Total Positions: ${metrics.predictionMetrics.totalPositions}`
    );
    console.log(
      `   Accuracy: ${(metrics.predictionMetrics.accuracy * 100).toFixed(1)}%`
    );
    console.log(`   Correct: ${metrics.predictionMetrics.correctPredictions}`);
    console.log(
      `   Incorrect: ${metrics.predictionMetrics.incorrectPredictions}\n`
    );

    console.log('📈 Perpetual Trades:');
    console.log(`   Total Trades: ${metrics.perpMetrics.totalTrades}`);
    console.log(
      `   Win Rate: ${(metrics.perpMetrics.winRate * 100).toFixed(1)}%`
    );
    console.log(
      `   Max Drawdown: $${metrics.perpMetrics.maxDrawdown.toFixed(2)}\n`
    );

    console.log('⏱️ Timing:');
    console.log(
      `   Total Duration: ${(metrics.timing.totalDuration / 1000).toFixed(1)}s`
    );
    console.log(
      `   Avg Response: ${metrics.timing.avgResponseTime.toFixed(0)}ms\n`
    );
  } catch (error) {
    console.error('Error reading result file:', error);
    process.exit(1);
  }
}

async function viewComparisonResult(data: ComparisonFile): Promise<void> {
  console.log(`Benchmark: ${data.benchmark}`);
  console.log(`Run At: ${data.runAt}`);
  console.log(`Winner: 🏆 ${data.winner}\n`);

  // Convert to ModelComparisonData for chart generation
  const results: ModelComparisonData[] = data.results.map((r) => ({
    modelId: r.model.modelId,
    modelName: r.model.displayName,
    metrics: r.metrics,
    runAt: new Date(data.runAt),
  }));

  // Print terminal summary
  console.log(BenchmarkChartGenerator.generateTerminalSummary(results));
}

async function compareModels(dirPath: string): Promise<void> {
  const fullPath = path.isAbsolute(dirPath)
    ? dirPath
    : path.join(process.cwd(), dirPath);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 MODEL COMPARISON');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Check for comparison.json first
    const comparisonPath = path.join(fullPath, 'comparison.json');
    try {
      const content = await fs.readFile(comparisonPath, 'utf-8');
      const data = JSON.parse(content) as ComparisonFile;
      await viewComparisonResult(data);
      return;
    } catch {
      // No comparison.json, look for individual model results
    }

    // Look for subdirectories with metrics.json
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const results: ModelComparisonData[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metricsPath = path.join(fullPath, entry.name, 'metrics.json');
        try {
          const content = await fs.readFile(metricsPath, 'utf-8');
          const metrics = JSON.parse(content) as SimulationMetrics;
          results.push({
            modelId: entry.name,
            modelName: getModelDisplayName(entry.name),
            metrics,
            runAt: new Date(),
          });
        } catch {
          // No metrics.json in this directory
        }
      }
    }

    if (results.length === 0) {
      console.log('No benchmark results found in this directory.\n');
      console.log('Expected structure:');
      console.log('  <dir>/');
      console.log('    ├─ comparison.json  (or)');
      console.log('    ├─ model1/');
      console.log('    │   └─ metrics.json');
      console.log('    └─ model2/');
      console.log('        └─ metrics.json\n');
      return;
    }

    console.log(BenchmarkChartGenerator.generateTerminalSummary(results));
  } catch (error) {
    console.error('Error comparing models:', error);
    process.exit(1);
  }
}

async function generateReport(
  dirPath: string,
  outputPath?: string
): Promise<void> {
  const fullPath = path.isAbsolute(dirPath)
    ? dirPath
    : path.join(process.cwd(), dirPath);
  const output = outputPath
    ? path.isAbsolute(outputPath)
      ? outputPath
      : path.join(process.cwd(), outputPath)
    : path.join(fullPath, 'report.html');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📄 GENERATING HTML REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const results: ModelComparisonData[] = [];
    let benchmarkId = 'unknown';

    // Check for comparison.json first
    const comparisonPath = path.join(fullPath, 'comparison.json');
    try {
      const content = await fs.readFile(comparisonPath, 'utf-8');
      const data = JSON.parse(content) as ComparisonFile;
      benchmarkId = data.benchmark;

      for (const r of data.results) {
        results.push({
          modelId: r.model.modelId,
          modelName: r.model.displayName,
          metrics: r.metrics,
          runAt: new Date(data.runAt),
        });
      }
    } catch {
      // No comparison.json, look for individual model results
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metricsPath = path.join(fullPath, entry.name, 'metrics.json');
          try {
            const content = await fs.readFile(metricsPath, 'utf-8');
            const metrics = JSON.parse(content) as SimulationMetrics;
            results.push({
              modelId: entry.name,
              modelName: getModelDisplayName(entry.name),
              metrics,
              runAt: new Date(),
            });
          } catch {
            // No metrics.json in this directory
          }
        }
      }
    }

    if (results.length === 0) {
      console.log('No benchmark results found to generate report.\n');
      return;
    }

    console.log(`Found ${results.length} model results`);
    console.log('Generating report...');

    const reportPath = await BenchmarkChartGenerator.generateReport(
      results,
      output,
      {
        title: 'Model Benchmark Comparison',
        benchmarkId,
      }
    );

    console.log(`\n✅ Report generated: ${reportPath}`);
    console.log(`\nOpen in browser: file://${reportPath}\n`);
  } catch (error) {
    console.error('Error generating report:', error);
    process.exit(1);
  }
}

async function showHistory(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 BENCHMARK HISTORY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const benchmarksDir = path.join(process.cwd(), 'benchmarks');
  const dirs = ['baselines', 'model-comparison', 'test-baselines'];

  const history: Array<{
    dir: string;
    modelName: string;
    pnl: number;
    accuracy: number;
    runAt: string;
  }> = [];

  for (const dir of dirs) {
    const fullPath = path.join(benchmarksDir, dir);
    try {
      // Check for comparison.json
      const comparisonPath = path.join(fullPath, 'comparison.json');
      try {
        const content = await fs.readFile(comparisonPath, 'utf-8');
        const data = JSON.parse(content) as ComparisonFile;

        for (const r of data.results) {
          history.push({
            dir,
            modelName: r.model.displayName,
            pnl: r.metrics.totalPnl,
            accuracy: r.metrics.predictionMetrics.accuracy * 100,
            runAt: data.runAt,
          });
        }
      } catch {
        // No comparison.json, look for subdirectories
        const entries = await fs.readdir(fullPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const metricsPath = path.join(fullPath, entry.name, 'metrics.json');
            try {
              const content = await fs.readFile(metricsPath, 'utf-8');
              const metrics = JSON.parse(content) as SimulationMetrics;
              const stat = await fs.stat(metricsPath);

              history.push({
                dir,
                modelName: getModelDisplayName(entry.name),
                pnl: metrics.totalPnl,
                accuracy: metrics.predictionMetrics.accuracy * 100,
                runAt: stat.mtime.toISOString(),
              });
            } catch {
              // Skip
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  if (history.length === 0) {
    console.log('No historical benchmark data found.\n');
    return;
  }

  // Sort by date
  history.sort(
    (a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime()
  );

  // Print table
  console.log(
    '┌────────────────────────┬─────────────────────┬────────────┬──────────┬───────────────────────┐'
  );
  console.log(
    '│ Directory              │ Model               │ P&L        │ Accuracy │ Run At                │'
  );
  console.log(
    '├────────────────────────┼─────────────────────┼────────────┼──────────┼───────────────────────┤'
  );

  for (const h of history) {
    const pnlColor = h.pnl >= 0 ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    const pnlStr = `${h.pnl >= 0 ? '+' : ''}$${h.pnl.toFixed(2)}`;
    const date = new Date(h.runAt).toLocaleString();

    console.log(
      `│ ${h.dir.padEnd(22)} │ ${h.modelName.substring(0, 19).padEnd(19)} │ ${pnlColor}${pnlStr.padStart(10)}${reset} │ ${h.accuracy.toFixed(1).padStart(6)}% │ ${date.substring(0, 21).padEnd(21)} │`
    );
  }

  console.log(
    '└────────────────────────┴─────────────────────┴────────────┴──────────┴───────────────────────┘\n'
  );
}

async function showHelp(): Promise<void> {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 BENCHMARK RESULTS CLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage: bun run scripts/benchmark-results.ts <command> [args]

Commands:
  
  list                      List all available benchmark results
  view <path>               View a specific benchmark result file
  compare <dir>             Compare models in a directory
  report <dir> [output]     Generate an HTML report with charts
  history                   Show historical benchmark trends
  help                      Show this help message

Examples:

  # List all benchmark results
  bun run scripts/benchmark-results.ts list
  
  # View a comparison result
  bun run scripts/benchmark-results.ts view benchmarks/model-comparison/comparison.json
  
  # Compare models in a directory
  bun run scripts/benchmark-results.ts compare benchmarks/model-comparison
  
  # Generate HTML report
  bun run scripts/benchmark-results.ts report benchmarks/model-comparison
  bun run scripts/benchmark-results.ts report benchmarks/baselines ./output/report.html
  
  # Show historical trends
  bun run scripts/benchmark-results.ts history

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'list':
      await listResults();
      break;

    case 'view':
      if (!args[0]) {
        console.error(
          'Error: Please provide a path to a benchmark result file'
        );
        process.exit(1);
      }
      await viewResult(args[0]);
      break;

    case 'compare':
      if (!args[0]) {
        console.error('Error: Please provide a directory path');
        process.exit(1);
      }
      await compareModels(args[0]);
      break;

    case 'report':
      if (!args[0]) {
        console.error('Error: Please provide a directory path');
        process.exit(1);
      }
      await generateReport(args[0], args[1]);
      break;

    case 'history':
      await showHistory();
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      await showHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      await showHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
