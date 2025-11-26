#!/usr/bin/env npx tsx
/**
 * CLI Tool for Running Liquidity Simulations
 * 
 * @description
 * Runs liquidity simulation scenarios and outputs reports.
 * 
 * Usage:
 *   npx tsx scripts/run-liquidity-simulation.ts [options]
 * 
 * Options:
 *   --scenario <name>   Run specific scenario (default: normal)
 *   --all               Run all predefined scenarios
 *   --compare           Compare all scenarios side by side
 *   --output <format>   Output format: console, json, csv (default: console)
 *   --file <path>       Write output to file
 *   --ticks <n>         Override number of simulation ticks
 *   --seed <n>          Random seed for reproducibility
 *   --help              Show this help message
 * 
 * Available Scenarios:
 *   normal        - Balanced markets with typical trading activity
 *   perpImbalance - 85% long bias testing funding rate response
 *   spotCrash     - NPC spot trading causes 20% price drop
 *   massExit      - 50% of traders close positions suddenly
 *   lowLiquidity  - Prediction markets with minimal starting liquidity
 * 
 * Examples:
 *   npx tsx scripts/run-liquidity-simulation.ts --scenario normal
 *   npx tsx scripts/run-liquidity-simulation.ts --all --compare
 *   npx tsx scripts/run-liquidity-simulation.ts --scenario spotCrash --output json --file results.json
 */

import {
  LiquiditySimulator,
  SCENARIOS,
  runScenarioComparison,
  type LiquidityScenarioConfig,
  type ScenarioName,
} from '../src/lib/simulation/liquidity-simulation';
import {
  generateReport,
  formatReportForConsole,
  compareScenarios,
  exportToJSON,
  exportTimeSeriesCSV,
} from '../src/lib/simulation/simulation-report';
import * as fs from 'fs';

interface CLIOptions {
  scenario: string;
  all: boolean;
  compare: boolean;
  output: 'console' | 'json' | 'csv';
  file: string | null;
  ticks: number | null;
  seed: number | null;
  help: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    scenario: 'normal',
    all: false,
    compare: false,
    output: 'console',
    file: null,
    ticks: null,
    seed: null,
    help: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--scenario':
        options.scenario = args[++i] || 'normal';
        break;
      case '--all':
        options.all = true;
        break;
      case '--compare':
        options.compare = true;
        break;
      case '--output':
        options.output = (args[++i] as 'console' | 'json' | 'csv') || 'console';
        break;
      case '--file':
        options.file = args[++i] || null;
        break;
      case '--ticks':
        options.ticks = parseInt(args[++i] || '100', 10);
        break;
      case '--seed':
        options.seed = parseInt(args[++i] || '12345', 10);
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }
  
  return options;
}

function printHelp(): void {
  console.log(`
Liquidity Simulation Tool
=========================

Usage:
  npx tsx scripts/run-liquidity-simulation.ts [options]

Options:
  --scenario <name>   Run specific scenario (default: normal)
  --all               Run all predefined scenarios
  --compare           Compare all scenarios side by side
  --output <format>   Output format: console, json, csv (default: console)
  --file <path>       Write output to file
  --ticks <n>         Override number of simulation ticks
  --seed <n>          Random seed for reproducibility
  --help              Show this help message

Available Scenarios:
  normal        - Balanced markets with typical trading activity
  perpImbalance - 85% long bias testing funding rate response
  spotCrash     - NPC spot trading causes 20% price drop
  massExit      - 50% of traders close positions suddenly
  lowLiquidity  - Prediction markets with minimal starting liquidity

Examples:
  npx tsx scripts/run-liquidity-simulation.ts --scenario normal
  npx tsx scripts/run-liquidity-simulation.ts --all --compare
  npx tsx scripts/run-liquidity-simulation.ts --scenario spotCrash --output json --file results.json
  npx tsx scripts/run-liquidity-simulation.ts --scenario perpImbalance --ticks 200 --seed 42
`);
}

function isValidScenario(name: string): name is ScenarioName {
  return name in SCENARIOS;
}

async function runSingleScenario(
  scenarioName: string,
  options: CLIOptions
): Promise<void> {
  if (!isValidScenario(scenarioName)) {
    console.error(`Unknown scenario: ${scenarioName}`);
    console.error(`Available scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }
  
  const baseConfig = SCENARIOS[scenarioName];
  
  // Apply overrides - cast to LiquidityScenarioConfig since we validated the scenario name
  const config: LiquidityScenarioConfig = {
    ...(baseConfig as LiquidityScenarioConfig),
    durationTicks: options.ticks ?? baseConfig.durationTicks,
    seed: options.seed ?? undefined,
  };
  
  console.log(`\nRunning scenario: ${config.name}`);
  console.log(`Description: ${config.description}`);
  console.log(`Ticks: ${config.durationTicks}`);
  if (options.seed) {
    console.log(`Seed: ${options.seed}`);
  }
  console.log('');
  
  const startTime = Date.now();
  const simulator = new LiquiditySimulator(config);
  const result = await simulator.run();
  const elapsed = Date.now() - startTime;
  
  console.log(`Simulation completed in ${elapsed}ms\n`);
  
  // Generate report
  const report = generateReport(result);
  
  // Output based on format
  let output: string;
  switch (options.output) {
    case 'json':
      output = exportToJSON(report);
      break;
    case 'csv':
      output = exportTimeSeriesCSV(result.tickMetrics);
      break;
    case 'console':
    default:
      output = formatReportForConsole(report);
      break;
  }
  
  // Write to file or console
  if (options.file) {
    fs.writeFileSync(options.file, output);
    console.log(`Report written to: ${options.file}`);
  } else {
    console.log(output);
  }
}

async function runAllScenarios(options: CLIOptions): Promise<void> {
  const scenarioNames = Object.keys(SCENARIOS) as ScenarioName[];
  console.log(`\nRunning ${scenarioNames.length} scenarios...\n`);
  
  const startTime = Date.now();
  const results = await runScenarioComparison(scenarioNames);
  const elapsed = Date.now() - startTime;
  
  console.log(`All simulations completed in ${elapsed}ms\n`);
  
  if (options.compare) {
    // Show comparison table
    console.log(compareScenarios(results));
  }
  
  if (options.output === 'json' && options.file) {
    // Export all results as JSON
    const allReports: Record<string, unknown> = {};
    for (const [name, result] of results) {
      allReports[name] = generateReport(result);
    }
    fs.writeFileSync(options.file, JSON.stringify(allReports, null, 2));
    console.log(`All reports written to: ${options.file}`);
  } else if (!options.compare) {
    // Show individual reports
    for (const [_name, result] of results) {
      const report = generateReport(result);
      console.log(formatReportForConsole(report));
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs();
  
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           BABYLON LIQUIDITY SIMULATION TOOL                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  try {
    if (options.all) {
      await runAllScenarios(options);
    } else {
      await runSingleScenario(options.scenario, options);
    }
    
    console.log('Simulation complete.\n');
  } catch (error) {
    console.error('Simulation failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);

