#!/usr/bin/env bun
/**
 * Master Benchmark Runner
 *
 * Consolidated script for all benchmarking operations.
 *
 * Usage:
 *   bun run scripts/benchmark.ts <command> [options]
 *
 * Commands:
 *   quick        - Quick 2-minute test
 *   single       - Run single model
 *   compare      - Compare two models
 *   baselines    - Run full baselines (LLaMA + Qwen)
 *   generate     - Generate benchmark data
 *   setup        - Create test agents
 *   verify       - Verify system integrity
 *
 * Examples:
 *   bun run scripts/benchmark.ts quick
 *   bun run scripts/benchmark.ts single llama-3.1-8b-instant
 *   bun run scripts/benchmark.ts compare
 *   bun run scripts/benchmark.ts baselines --full-week
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

const BENCHMARKS = {
  quick: 'benchmark-week-5-10-3-2-5-99999.json',
  short: 'benchmark-week-30-60-10-5-8-12345.json',
  full: 'benchmark-week-10080-60-10-5-8-12345.json',
};

async function runCommand(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('bun', ['run', script, ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ||
          'postgresql://babylon:babylon_dev_password@localhost:5433/babylon',
      },
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

async function ensureEnv(): Promise<void> {
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ Error: GROQ_API_KEY not set');
    console.log('\nSet it with:');
    console.log('  export GROQ_API_KEY="your_key"');
    console.log('\nOr add to .env.local');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.log(
      '⚠️  DATABASE_URL not set, using default: postgres://babylon:babylon_dev_password@localhost:5433/babylon'
    );
  }
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  if (!command || command === 'help' || command === '--help') {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 MASTER BENCHMARK RUNNER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage: bun run scripts/benchmark.ts <command> [options]

Commands:
  
  setup          Create test agents (run first!)
  quick          Quick 2-min test (12 ticks)
  single <model> Run single model on 30-min benchmark
  compare        Compare LLaMA 8B vs Qwen 32B (30 min)
  baselines      Run both models on 1-week benchmark
  generate       Generate new benchmark data
  verify         Verify system integrity
  help           Show this help

Examples:
  
  # First time setup
  bun run scripts/benchmark.ts setup
  
  # Quick test (development)
  bun run scripts/benchmark.ts quick
  
  # Test specific model
  bun run scripts/benchmark.ts single llama-3.1-8b-instant
  bun run scripts/benchmark.ts single qwen/qwen3-32b
  
  # Compare models
  bun run scripts/benchmark.ts compare
  
  # Full baselines (production)
  bun run scripts/benchmark.ts baselines

Environment Variables:
  DATABASE_URL    Database connection (required)
  GROQ_API_KEY    Groq API key (required)

Current Settings:
  DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Not set'}
  GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✅ Set' : '❌ Not set'}

For detailed docs, see:
  docs/BENCHMARK_WORKFLOWS.md    - Manual workflows
  docs/BENCHMARK_AUTOMATION.md   - Automated integration
  BENCHMARK_COMPLETE.md          - Complete guide

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
    process.exit(0);
  }

  await ensureEnv();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎯 Running: ${command.toUpperCase()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  switch (command) {
    case 'setup':
      console.log('Creating test agents...\n');
      await runCommand('apps/cli/src/index.ts', ['agent', 'spawn']);
      console.log('\n✅ Setup complete! Test agents ready.\n');
      break;

    case 'quick':
      console.log('Running quick 2-minute test...\n');
      await runCommand('scripts/test-benchmark-quick.ts');
      break;

    case 'single': {
      const model = args[0] || 'llama-3.1-8b-instant';
      const benchmark = args[1] || `benchmarks/${BENCHMARKS.short}`;
      console.log(`Testing model: ${model}`);
      console.log(`Benchmark: ${benchmark}\n`);
      await runCommand('scripts/run-quick-baseline.ts', [benchmark, model]);
      break;
    }

    case 'compare': {
      const benchmark = args[0] || `benchmarks/${BENCHMARKS.short}`;
      const output = args[1] || 'benchmarks/model-comparison';
      console.log(`Comparing models on: ${benchmark}\n`);
      await runCommand('scripts/compare-models.ts', [benchmark, output]);
      break;
    }

    case 'baselines': {
      const fullWeek = args.includes('--full-week');
      const benchmark = fullWeek ? BENCHMARKS.full : BENCHMARKS.short;
      const output = args.includes('--output')
        ? args[args.indexOf('--output') + 1]
        : 'benchmarks/baselines';

      console.log('Running baseline benchmarks...');
      console.log(`Benchmark: ${benchmark}`);
      console.log(
        `Duration: ${fullWeek ? '1 week (2-3 hours)' : '30 min (1 hour)'}\n`
      );

      await runCommand('scripts/run-baseline-benchmarks.ts', [
        `--benchmark=benchmarks/${benchmark}`,
        `--output=${output}`,
      ]);
      break;
    }

    case 'generate': {
      const duration =
        args.find((a) => a.startsWith('--duration='))?.split('=')[1] || '10080';
      const seed =
        args.find((a) => a.startsWith('--seed='))?.split('=')[1] || '12345';

      console.log('Generating benchmark...');
      console.log(`Duration: ${duration} minutes\n`);

      await runCommand('scripts/generate-benchmark.ts', [
        `--duration=${duration}`,
        '--interval=60',
        '--markets=10',
        '--perpetuals=5',
        '--agents=8',
        `--seed=${seed}`,
      ]);
      break;
    }

    case 'verify': {
      console.log('Running system verification...\n');

      // Check test agents exist
      await runCommand('apps/cli/src/index.ts', ['agent', 'spawn']);

      // Check benchmark files exist
      const benchmarkDir = path.join(process.cwd(), 'benchmarks');
      const files = await fs.readdir(benchmarkDir);
      const benchmarkFiles = files.filter(
        (f) => f.startsWith('benchmark-week-') && f.endsWith('.json')
      );

      console.log('\n📊 Benchmark Files:');
      benchmarkFiles.forEach((f) => console.log(`  ✅ ${f}`));

      // Check baselines exist
      try {
        const baselineDir = path.join(benchmarkDir, 'baselines');
        const baselineFiles = await fs.readdir(baselineDir);
        console.log('\n🎯 Baseline Files:');
        baselineFiles
          .filter((f) => f.endsWith('.json'))
          .forEach((f) => console.log(`  ✅ ${f}`));
      } catch {
        console.log(
          '\n⚠️  No baselines found. Run: bun run scripts/benchmark.ts baselines'
        );
      }

      // Run quick test
      console.log('\n🧪 Running quick validation test...\n');
      await runCommand('scripts/test-benchmark-quick.ts');

      console.log('\n✅ System verification complete!\n');
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run "bun run scripts/benchmark.ts help" for usage\n');
      process.exit(1);
  }

  console.log('');
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
