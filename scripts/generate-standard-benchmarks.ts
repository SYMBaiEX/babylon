/**
 * Generate Standard Benchmark Suite
 *
 * Creates a suite of standardized benchmarks for model evaluation.
 * These benchmarks are used as the baseline for all model comparisons.
 *
 * Usage:
 *   npx ts-node scripts/generate-standard-benchmarks.ts
 *   npx ts-node scripts/generate-standard-benchmarks.ts --force
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '@babylon/engine';
import {
  type BenchmarkConfig,
  BenchmarkDataGenerator,
} from '@babylon/training';

interface StandardBenchmark {
  name: string;
  description: string;
  config: BenchmarkConfig;
}

const STANDARD_BENCHMARKS: StandardBenchmark[] = [
  {
    name: 'quick-eval',
    description: 'Quick 5-minute evaluation benchmark',
    config: {
      durationMinutes: 5,
      tickInterval: 10,
      numPredictionMarkets: 3,
      numPerpetualMarkets: 2,
      numAgents: 5,
      seed: 12345,
    },
  },
  {
    name: 'standard-30min',
    description: 'Standard 30-minute benchmark',
    config: {
      durationMinutes: 30,
      tickInterval: 60,
      numPredictionMarkets: 5,
      numPerpetualMarkets: 3,
      numAgents: 8,
      seed: 54321,
    },
  },
  {
    name: 'long-2hour',
    description: 'Long 2-hour comprehensive benchmark',
    config: {
      durationMinutes: 120,
      tickInterval: 60,
      numPredictionMarkets: 10,
      numPerpetualMarkets: 5,
      numAgents: 12,
      seed: 99999,
    },
  },
];

async function generateStandardBenchmark(
  benchmark: StandardBenchmark,
  outputDir: string,
  force: boolean
): Promise<string> {
  const filename = `standard-${benchmark.name}.json`;
  const filepath = path.join(outputDir, filename);

  // Check if already exists
  if (
    !force &&
    (await fs
      .access(filepath)
      .then(() => true)
      .catch(() => false))
  ) {
    logger.info(`Benchmark ${benchmark.name} already exists, skipping`, {
      filepath,
    });
    console.log(`  ⏭️  ${benchmark.name}: Already exists`);
    return filepath;
  }

  console.log(`\n📊 Generating: ${benchmark.name}`);
  console.log(`   ${benchmark.description}`);

  const generator = new BenchmarkDataGenerator(benchmark.config);
  const snapshot = await generator.generate();

  await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2));

  console.log(`   ✅ Generated: ${filepath}`);
  console.log(`      Duration: ${benchmark.config.durationMinutes} minutes`);
  console.log(`      Ticks: ${snapshot.ticks.length}`);
  console.log(
    `      Markets: ${snapshot.initialState.predictionMarkets.length} prediction + ${snapshot.initialState.perpetualMarkets.length} perpetual`
  );

  return filepath;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  const outputDir = path.join(process.cwd(), 'benchmarks', 'standard');
  await fs.mkdir(outputDir, { recursive: true });

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       STANDARD BENCHMARK SUITE GENERATOR               ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`Output directory: ${outputDir}`);
  console.log(`Force regenerate: ${force ? 'yes' : 'no'}\n`);

  const generatedPaths: string[] = [];

  for (const benchmark of STANDARD_BENCHMARKS) {
    const filepath = await generateStandardBenchmark(
      benchmark,
      outputDir,
      force
    );
    generatedPaths.push(filepath);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('           BENCHMARK SUITE COMPLETE           ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Generated benchmarks:');
  generatedPaths.forEach((p) => console.log(`  - ${path.basename(p)}`));

  console.log('\nUse these benchmarks with:');
  console.log('  bun run hf:benchmark --model=MODEL_ID');
  console.log(
    '  npx ts-node scripts/run-baseline-benchmarks.ts --benchmark=benchmarks/standard/standard-quick-eval.json'
  );
  console.log('\n');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
