/**
 * Quick Benchmark Test
 *
 * Simplified benchmark runner with progress feedback and timeout handling
 */

import { db } from '@/db';
import { AutonomousCoordinator } from '@/lib/agents/autonomous/AutonomousCoordinator';
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager';
import { BenchmarkDataGenerator } from '@/lib/benchmark/BenchmarkDataGenerator';
import { SimulationA2AInterface } from '@/lib/benchmark/SimulationA2AInterface';
import {
  type SimulationConfig,
  SimulationEngine,
} from '@/lib/benchmark/SimulationEngine';

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 QUICK BENCHMARK TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Generate tiny benchmark (2 minutes, 12 ticks)
  console.log('📊 Generating 2-minute test benchmark...');
  const generator = new BenchmarkDataGenerator({
    durationMinutes: 2,
    tickInterval: 10,
    numPredictionMarkets: 2,
    numPerpetualMarkets: 1,
    numAgents: 3,
    seed: 12345,
  });

  const snapshot = await generator.generate();
  console.log(`✅ Generated: ${snapshot.ticks.length} ticks\n`);

  // 2. Get test agent
  console.log('🤖 Getting test agent...');
  const agent = await db.user.findFirst({
    where: {
      isAgent: true,
      username: 'trader-aggressive',
    },
  });

  if (!agent) {
    console.error(
      '❌ No test agent found. Run: bun run scripts/ensure-test-agents.ts'
    );
    process.exit(1);
  }

  console.log(
    `✅ Agent: ${agent.displayName} (${agent.id.substring(0, 12)}...)\n`
  );

  // 3. Initialize runtime
  console.log('⚙️  Initializing agent runtime...');
  const runtime = await agentRuntimeManager.getRuntime(agent.id);
  console.log('✅ Runtime ready\n');

  // 4. Create simulation engine
  console.log('🎮 Setting up simulation...');
  const simConfig: SimulationConfig = {
    snapshot,
    agentId: agent.id,
    fastForward: true,
    responseTimeout: 5000,
  };

  const engine = new SimulationEngine(simConfig);
  const a2aInterface = new SimulationA2AInterface(engine, agent.id);

  // Inject A2A
  (runtime as { a2aClient?: SimulationA2AInterface }).a2aClient = a2aInterface;

  // Force to use small Groq model for fast testing
  if (runtime.character?.settings) {
    runtime.character.settings.WANDB_ENABLED = 'false';
    runtime.character.settings.LARGE_GROQ_MODEL = 'llama-3.1-8b-instant';
    runtime.character.settings.SMALL_GROQ_MODEL = 'llama-3.1-8b-instant';
  }

  engine.initialize();
  console.log('✅ Simulation initialized\n');

  // 5. Run simulation with progress
  console.log('🏃 Running simulation...\n');
  const coordinator = new AutonomousCoordinator();
  const totalTicks = snapshot.ticks.length;
  let actionsCount = 0;
  let errorsCount = 0;

  const startTime = Date.now();

  for (let i = 0; i < totalTicks; i++) {
    const progress = ((i / totalTicks) * 100).toFixed(0);
    process.stdout.write(
      `\r   Progress: [${i + 1}/${totalTicks}] ${progress}% | Actions: ${actionsCount} | Errors: ${errorsCount}`
    );

    try {
      // Set timeout for tick
      const tickPromise = coordinator.executeAutonomousTick(agent.id, runtime);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tick timeout')), 10000)
      );

      const tickResult = (await Promise.race([
        tickPromise,
        timeoutPromise,
      ])) as {
        success: boolean;
        actionsExecuted: Record<string, number>;
      };

      if (tickResult.success) {
        const actions = Object.values(tickResult.actionsExecuted).reduce(
          (sum, n) => sum + n,
          0
        );
        actionsCount += actions;
      }
    } catch (error) {
      errorsCount++;
      // Continue even on error
    }

    engine.advanceTick();
  }

  console.log('\n');

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // 6. Get results
  console.log('\n📈 Calculating results...');
  const result = await engine.run();

  // 7. Display results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ BENCHMARK COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📊 Results:');
  console.log(`   Ticks Processed: ${result.ticksProcessed}`);
  console.log(`   Total Actions: ${actionsCount}`);
  console.log(`   Errors: ${errorsCount}`);
  console.log(`   Duration: ${duration}s`);
  console.log(
    `   Avg per tick: ${(Number.parseFloat(duration) / totalTicks).toFixed(2)}s\n`
  );

  console.log('💰 Performance:');
  console.log(`   Total P&L: $${result.metrics.totalPnl.toFixed(2)}`);
  console.log(
    `   Prediction Trades: ${result.metrics.predictionMetrics.totalPositions}`
  );
  console.log(
    `   Prediction Accuracy: ${(result.metrics.predictionMetrics.accuracy * 100).toFixed(1)}%`
  );
  console.log(`   Perp Trades: ${result.metrics.perpMetrics.totalTrades}`);
  console.log(
    `   Perp Win Rate: ${(result.metrics.perpMetrics.winRate * 100).toFixed(1)}%`
  );
  console.log(
    `   Optimality Score: ${result.metrics.optimalityScore.toFixed(1)}%\n`
  );

  // 8. Validate
  if (result.ticksProcessed === 0) {
    console.log('❌ FAILED: No ticks were processed!\n');
    process.exit(1);
  }

  if (actionsCount === 0) {
    console.log('⚠️  WARNING: Agent took no actions during benchmark\n');
  } else {
    console.log(`✅ SUCCESS: Agent took ${actionsCount} actions\n`);
  }

  await db.$disconnect();

  // Force exit to avoid hanging on open connections
  setTimeout(() => {
    console.log('\nForcing exit...');
    process.exit(0);
  }, 100);
}

main().catch((error) => {
  console.error('\n❌ ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
