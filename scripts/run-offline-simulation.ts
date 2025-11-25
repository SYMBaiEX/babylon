/**
 * Run Offline Simulation
 * 
 * Runs agents in faster-than-real-time simulation using downloaded HuggingFace data.
 * Perfect for testing, development, and evaluation without needing live system.
 * 
 * Features:
 * - Load game data from HuggingFace dataset
 * - Run agents in fast-forward mode
 * - No API calls, all local
 * - Deterministic replay
 * 
 * Usage:
 *   bun run scripts/run-offline-simulation.ts --data=path/to/game-world.json --agent=my-agent
 *   bun run scripts/run-offline-simulation.ts --month=2025-11 --agent=my-agent --fast
 */

import { SimulationEngine, type SimulationConfig } from '../src/lib/benchmark/SimulationEngine';
import { SimulationA2AInterface } from '../src/lib/benchmark/SimulationA2AInterface';
import { agentRuntimeManager } from '../src/lib/agents/runtime/AgentRuntimeManager';
import { AutonomousCoordinator } from '../src/lib/agents/autonomous/AutonomousCoordinator';
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '../src/lib/logger';
import type { BenchmarkGameSnapshot } from '../src/lib/benchmark/BenchmarkDataGenerator';
import type { IAgentRuntime } from '@elizaos/core';

interface OfflineSimulationOptions {
  dataPath?: string;     // Path to game data file
  month?: string;        // Month to load (YYYY-MM)
  agentId?: string;      // Agent to run
  fastForward?: boolean; // Fast-forward mode (default: true)
  maxTicks?: number;     // Max ticks to run (for testing)
  saveResults?: boolean; // Save results to file
}

async function loadGameData(dataPath: string): Promise<BenchmarkGameSnapshot> {
  logger.info('Loading game data', { dataPath });
  
  const data = JSON.parse(await fs.readFile(dataPath, 'utf-8'));
  
  // If this is a month file, extract first game world
  if (data.worlds && data.worlds.length > 0) {
    // Convert game world to benchmark format
    return convertWorldToBenchmark(data.worlds[0]);
  }
  
  // If this is a complete game world
  if (data.timeline && data.question) {
    return convertWorldToBenchmark(data);
  }
  
  // If this is already a benchmark snapshot
  if (data.ticks && data.initialState) {
    return data as BenchmarkGameSnapshot;
  }
  
  throw new Error('Unknown data format. Expected game world or benchmark snapshot.');
}

function convertWorldToBenchmark(world: {
  question?: string;
  outcome?: boolean;
  timeline?: unknown[];
  npcs?: unknown[];
  events?: unknown[];
  feedPosts?: unknown[];
}): BenchmarkGameSnapshot {
  // Convert game world to benchmark format
  // This allows offline simulation of generated worlds
  
  const duration = (world.timeline?.length || 30) * 24 * 60;  // Days to minutes
  const tickInterval = 60;  // 1 minute ticks
  const numTicks = duration / tickInterval;
  
  const snapshot: BenchmarkGameSnapshot = {
    id: `world-${Date.now()}`,
    version: '1.0.0',
    createdAt: Date.now(),
    duration: duration * 60,  // Seconds
    tickInterval,
    initialState: {
      tick: 0,
      timestamp: Date.now(),
      predictionMarkets: [{
        id: 'market-0',
        question: world.question || 'Unknown question',
        yesShares: 500,
        noShares: 500,
        yesPrice: 0.5,
        noPrice: 0.5,
        totalVolume: 0,
        liquidity: 1000,
        resolved: false,
        createdAt: Date.now(),
        resolveAt: Date.now() + duration * 60 * 1000,
      }],
      perpetualMarkets: [],
      agents: [],
    },
    ticks: [],
    groundTruth: {
      marketOutcomes: { 'market-0': world.outcome ?? true },
      priceHistory: {},
      optimalActions: [],
      socialOpportunities: [],
      hiddenFacts: [],
      hiddenEvents: [],
      trueFacts: {},
    },
  };
  
  // Generate ticks (simplified for now)
  for (let i = 0; i < Math.min(numTicks, 1000); i++) {
    snapshot.ticks.push({
      number: i,
      timestamp: snapshot.createdAt + i * tickInterval * 1000,
      events: [],
      state: snapshot.initialState,
    });
  }
  
  return snapshot;
}

async function runOfflineSimulation(options: OfflineSimulationOptions): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║    OFFLINE FASTER-THAN-REAL-TIME SIMULATION            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  // Load game data
  let dataPath = options.dataPath;
  
  if (!dataPath && options.month) {
    // Load from exports by month
    dataPath = path.join(process.cwd(), 'exports', 'huggingface', 'latest', 'by-month', `${options.month}.json`);
  }
  
  if (!dataPath) {
    throw new Error('Either --data or --month must be specified');
  }
  
  console.log(`📊 Loading data from: ${dataPath}\n`);
  const snapshot = await loadGameData(dataPath);
  
  console.log(`Question: ${snapshot.initialState.predictionMarkets[0]?.question || 'Unknown'}`);
  console.log(`Duration: ${snapshot.ticks.length} ticks (${Math.floor(snapshot.ticks.length * snapshot.tickInterval / 60)} minutes)`);
  console.log(`Fast-forward: ${options.fastForward ?? true ? 'YES (faster-than-real-time)' : 'NO (real-time)'}`);
  console.log('');
  
  // Get or create agent
  const agentId = options.agentId || await getTestAgent();
  const runtime = await agentRuntimeManager.getRuntime(agentId);
  
  console.log(`🤖 Agent: ${agentId.substring(0, 12)}...\n`);
  console.log(`🚀 Starting simulation...`);
  console.log(`   Mode: ${options.fastForward !== false ? 'FAST-FORWARD (no delays)' : 'REAL-TIME'}\n`);
  
  // Create simulation engine
  const simConfig: SimulationConfig = {
    snapshot,
    agentId,
    fastForward: options.fastForward !== false,
    responseTimeout: 30000,
  };
  
  const engine = new SimulationEngine(simConfig);
  const a2aInterface = new SimulationA2AInterface(engine, agentId);
  
  interface RuntimeWithA2A extends IAgentRuntime {
    a2aClient?: SimulationA2AInterface;
  }
  (runtime as RuntimeWithA2A).a2aClient = a2aInterface;
  
  // Initialize
  engine.initialize();
  const coordinator = new AutonomousCoordinator();
  
  const startTime = Date.now();
  const maxTicks = options.maxTicks || snapshot.ticks.length;
  
  // Run simulation
  let ticksProcessed = 0;
  while (!engine.isComplete() && ticksProcessed < maxTicks) {
    const currentTick = engine.getCurrentTickNumber();
    
    if (currentTick % 100 === 0 || currentTick < 5) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const ticksPerSec = ticksProcessed / (Date.now() - startTime) * 1000;
      console.log(`   Tick ${currentTick}/${maxTicks} (${ticksPerSec.toFixed(1)} ticks/sec, ${elapsed}s elapsed)`);
    }
    
    // Execute tick (no delay in fast-forward mode!)
    await coordinator.executeAutonomousTick(agentId, runtime);
    
    engine.advanceTick();
    ticksProcessed++;
    
    // Only add delay if NOT in fast-forward mode
    if (options.fastForward === false) {
      await new Promise(resolve => setTimeout(resolve, snapshot.tickInterval * 1000));
    }
  }
  
  // Get results
  const result = await engine.run();
  
  const duration = Date.now() - startTime;
  const ticksPerSec = (ticksProcessed / duration) * 1000;
  
  console.log(`\n✅ Simulation Complete!\n`);
  console.log(`Ticks Processed: ${ticksProcessed}`);
  console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`Speed: ${ticksPerSec.toFixed(1)} ticks/second`);
  console.log(`Speedup: ${(ticksPerSec / (1 / snapshot.tickInterval)).toFixed(1)}x faster than real-time`);
  console.log('');
  console.log(`📊 Results:`);
  console.log(`   P&L: $${result.metrics.totalPnl.toFixed(2)}`);
  console.log(`   Accuracy: ${(result.metrics.predictionMetrics.accuracy * 100).toFixed(1)}%`);
  console.log(`   Actions: ${result.actions.length}`);
  console.log(`   Optimality: ${result.metrics.optimalityScore.toFixed(1)}`);
  console.log('');
  
  // Save results if requested
  if (options.saveResults) {
    const resultsPath = path.join(process.cwd(), 'offline-results', `${agentId}-${Date.now()}.json`);
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });
    await fs.writeFile(resultsPath, JSON.stringify(result, null, 2));
    console.log(`💾 Results saved to: ${resultsPath}\n`);
  }
}

async function getTestAgent(): Promise<string> {
  const { db } = await import('@/db');
  const { generateSnowflakeId } = await import('../src/lib/snowflake');
  const { ethers } = await import('ethers');
  
  let agent = await db.user.findFirst({
    where: {
      isAgent: true,
      username: 'offline-test-agent',
    },
  });
  
  if (!agent) {
    const agentId = await generateSnowflakeId();
    agent = await db.user.create({
      data: {
        id: agentId,
        privyId: `did:privy:offline-test-${agentId}`,
        username: 'offline-test-agent',
        displayName: 'Offline Test Agent',
        walletAddress: ethers.Wallet.createRandom().address,
        isAgent: true,
        autonomousTrading: true,
        agentSystem: 'You are an offline test agent for fast simulation.',
        agentModelTier: 'lite',
        virtualBalance: '10000',
        reputationPoints: 1000,
        agentPointsBalance: 1000,
        isTest: true,
        updatedAt: new Date(),
      },
    });
  }
  
  return agent.id;
}

function parseArgs(): OfflineSimulationOptions {
  const args = process.argv.slice(2);
  
  const options: OfflineSimulationOptions = {
    fastForward: !args.includes('--real-time'),
    saveResults: args.includes('--save'),
  };
  
  for (const arg of args) {
    if (arg.startsWith('--data=')) {
      options.dataPath = arg.split('=')[1];
    } else if (arg.startsWith('--month=')) {
      options.month = arg.split('=')[1];
    } else if (arg.startsWith('--agent=')) {
      options.agentId = arg.split('=')[1];
    } else if (arg.startsWith('--max-ticks=')) {
      options.maxTicks = parseInt(arg.split('=')[1]!);
    }
  }
  
  return options;
}

async function main() {
  const options = parseArgs();
  await runOfflineSimulation(options);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

