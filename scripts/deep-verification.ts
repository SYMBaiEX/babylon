/**
 * Deep Verification Script
 * 
 * Thoroughly tests that the benchmark system is ACTUALLY working,
 * not just appearing to work.
 */

import { BenchmarkDataGenerator } from '@/lib/benchmark/BenchmarkDataGenerator';
import { SimulationEngine } from '@/lib/benchmark/SimulationEngine';
import { SimulationA2AInterface } from '@/lib/benchmark/SimulationA2AInterface';
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager';
import { AutonomousCoordinator } from '@/lib/agents/autonomous/AutonomousCoordinator';
import { prisma } from '@/lib/prisma';

interface VerificationResult {
  test: string;
  passed: boolean;
  details: string;
  error?: string;
}

const results: VerificationResult[] = [];

function addResult(test: string, passed: boolean, details: string, error?: string) {
  results.push({ test, passed, details, error });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${test}`);
  if (details) console.log(`   ${details}`);
  if (error) console.log(`   ERROR: ${error}`);
  console.log('');
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 DEEP VERIFICATION - PROVING SYSTEM WORKS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test 1: Verify simulation state ACTUALLY changes
  console.log('TEST 1: Simulation State Changes\n');
  try {
    const generator = new BenchmarkDataGenerator({
      durationMinutes: 1,
      tickInterval: 10,
      numPredictionMarkets: 2,
      numPerpetualMarkets: 1,
      numAgents: 2,
      seed: 11111,
    });
    
    const snapshot = await generator.generate();
    const engine = new SimulationEngine({
      snapshot,
      agentId: 'test',
      fastForward: true,
    });
    
    engine.initialize();
    
    const states: Array<{ tick: number; perpPrice: number; predPrice: number }> = [];
    
    for (let i = 0; i < Math.min(6, snapshot.ticks.length); i++) {
      const state = engine.getGameState();
      states.push({
        tick: i,
        perpPrice: state.perpetualMarkets[0]?.price || 0,
        predPrice: state.predictionMarkets[0]?.yesPrice || 0,
      });
      engine.advanceTick();
    }
    
    // Check if perp prices change
    const perpPrices = states.map(s => s.perpPrice);
    const perpChanges = perpPrices.some((p, i) => i > 0 && Math.abs(p - perpPrices[i-1]!) > 0.01);
    
    const priceRange = `$${Math.min(...perpPrices).toFixed(2)} - $${Math.max(...perpPrices).toFixed(2)}`;
    
    addResult(
      'State Progression',
      perpChanges,
      perpChanges 
        ? `Perp prices evolve across ticks (${priceRange})`
        : `Perp prices are STATIC - this is a problem!`,
      perpChanges ? undefined : 'State not changing'
    );
  } catch (error) {
    addResult('State Progression', false, 'Test crashed', error instanceof Error ? error.message : String(error));
  }
  
  // Test 2: Verify actions are ACTUALLY recorded
  console.log('TEST 2: Actions Actually Recorded\n');
  try {
    const generator = new BenchmarkDataGenerator({
      durationMinutes: 1,
      tickInterval: 10,
      numPredictionMarkets: 2,
      numPerpetualMarkets: 1,
      numAgents: 2,
      seed: 22222,
    });
    
    const snapshot = await generator.generate();
    const engine = new SimulationEngine({
      snapshot,
      agentId: 'test',
      fastForward: true,
    });
    
    engine.initialize();
    
    // Manually perform actions
    const market = snapshot.initialState.predictionMarkets[0]!;
    
    await engine.performAction('buy_prediction', {
      marketId: market.id,
      outcome: 'YES',
      amount: 100,
    });
    
    await engine.performAction('buy_prediction', {
      marketId: market.id,
      outcome: 'NO',
      amount: 50,
    });
    
    engine.advanceTick();
    
    // Get results
    const result = await engine.run();
    
    const actionCount = result.actions.length;
    const expectedCount = 2;
    
    addResult(
      'Actions Recorded',
      actionCount === expectedCount,
      `Expected ${expectedCount} actions, got ${actionCount}`,
      actionCount !== expectedCount ? `Action count mismatch` : undefined
    );
  } catch (error) {
    addResult('Actions Recorded', false, 'Test crashed', error instanceof Error ? error.message : String(error));
  }
  
  // Test 3: Verify metrics come from REAL actions
  console.log('TEST 3: Metrics From Real Actions\n');
  try {
    const generator = new BenchmarkDataGenerator({
      durationMinutes: 1,
      tickInterval: 10,
      numPredictionMarkets: 2,
      numPerpetualMarkets: 1,
      numAgents: 2,
      seed: 33333,
    });
    
    const snapshot = await generator.generate();
    const engine = new SimulationEngine({
      snapshot,
      agentId: 'test',
      fastForward: true,
    });
    
    engine.initialize();
    
    // Don't make any trades
    engine.advanceTick();
    engine.advanceTick();
    
    const result = await engine.run();
    
    // If no trades, metrics should reflect that
    const hasZeroMetrics = 
      result.metrics.predictionMetrics.totalPositions === 0 &&
      result.metrics.perpMetrics.totalTrades === 0 &&
      result.metrics.totalPnl === 0;
    
    addResult(
      'Metrics Reflect Actions',
      hasZeroMetrics,
      hasZeroMetrics 
        ? 'No actions → zero metrics (correct)'
        : `Found metrics without actions! Positions: ${result.metrics.predictionMetrics.totalPositions}, PnL: ${result.metrics.totalPnl}`,
      hasZeroMetrics ? undefined : 'Metrics calculated from non-existent actions'
    );
  } catch (error) {
    addResult('Metrics Reflect Actions', false, 'Test crashed', error instanceof Error ? error.message : String(error));
  }
  
  // Test 4: Verify ground truth is ACTUALLY used
  console.log('TEST 4: Ground Truth Used for Correctness\n');
  try {
    const generator = new BenchmarkDataGenerator({
      durationMinutes: 1,
      tickInterval: 10,
      numPredictionMarkets: 2,
      numPerpetualMarkets: 1,
      numAgents: 2,
      seed: 44444,
    });
    
    const snapshot = await generator.generate();
    const engine = new SimulationEngine({
      snapshot,
      agentId: 'test',
      fastForward: true,
    });
    
    engine.initialize();
    
    const market = snapshot.initialState.predictionMarkets[0]!;
    const groundTruth = snapshot.groundTruth.marketOutcomes[market.id];
    
    console.log(`   Market: ${market.id}`);
    console.log(`   Ground Truth: ${groundTruth}`);
    
    // Bet WITH ground truth (should be correct)
    await engine.performAction('buy_prediction', {
      marketId: market.id,
      outcome: groundTruth ? 'YES' : 'NO',
      amount: 100,
    });
    
    // Bet AGAINST ground truth (should be incorrect)
    await engine.performAction('buy_prediction', {
      marketId: market.id,
      outcome: groundTruth ? 'NO' : 'YES',
      amount: 50,
    });
    
    const result = await engine.run();
    
    const correct = result.metrics.predictionMetrics.correctPredictions;
    const incorrect = result.metrics.predictionMetrics.incorrectPredictions;
    
    const isCorrect = correct === 1 && incorrect === 1;
    
    addResult(
      'Ground Truth Validation',
      isCorrect,
      isCorrect
        ? `1 correct, 1 incorrect (as expected)`
        : `Expected 1 correct / 1 incorrect, got ${correct} / ${incorrect}`,
      isCorrect ? undefined : 'Ground truth not being used correctly'
    );
  } catch (error) {
    addResult('Ground Truth Validation', false, 'Test crashed', error instanceof Error ? error.message : String(error));
  }
  
  // Test 5: Verify tick counter increments
  console.log('TEST 5: Tick Counter Increments\n');
  try {
    const generator = new BenchmarkDataGenerator({
      durationMinutes: 1,
      tickInterval: 10,
      numPredictionMarkets: 2,
      numPerpetualMarkets: 1,
      numAgents: 2,
      seed: 55555,
    });
    
    const snapshot = await generator.generate();
    const engine = new SimulationEngine({
      snapshot,
      agentId: 'test',
      fastForward: true,
    });
    
    engine.initialize();
    
    const ticksBefore = engine.getCurrentTickNumber();
    
    for (let i = 0; i < 3; i++) {
      engine.advanceTick();
    }
    
    const ticksAfter = engine.getCurrentTickNumber();
    const advanced = ticksAfter - ticksBefore;
    
    addResult(
      'Tick Counter',
      advanced === 3,
      `Advanced ${advanced} ticks (expected 3)`,
      advanced !== 3 ? 'Tick counter not incrementing' : undefined
    );
  } catch (error) {
    addResult('Tick Counter', false, 'Test crashed', error instanceof Error ? error.message : String(error));
  }
  
  // Test 6: Full agent integration test
  console.log('TEST 6: Full Agent Integration\n');
  try {
    const agent = await prisma.user.findFirst({
      where: {
        isAgent: true,
        username: 'trader-aggressive',
      },
    });
    
    if (!agent) {
      addResult('Full Agent Integration', false, 'Test agent not found', 'Run: bun run scripts/benchmark.ts setup');
    } else {
      // Generate tiny benchmark
      const generator = new BenchmarkDataGenerator({
        durationMinutes: 1,
        tickInterval: 10,
        numPredictionMarkets: 3,
        numPerpetualMarkets: 2,
        numAgents: 2,
        seed: 66666,
      });
      
      const snapshot = await generator.generate();
      
      console.log(`   Agent: ${agent.displayName}`);
      console.log(`   Ticks: ${snapshot.ticks.length}`);
      
      const runtime = await agentRuntimeManager.getRuntime(agent.id);
      
      const engine = new SimulationEngine({
        snapshot,
        agentId: agent.id,
        fastForward: true,
      });
      
      const a2a = new SimulationA2AInterface(engine, agent.id);
      (runtime as { a2aClient?: SimulationA2AInterface }).a2aClient = a2a;
      
      // Force small model for speed
      if (runtime.character?.settings) {
        runtime.character.settings.WANDB_ENABLED = 'false';
        runtime.character.settings.LARGE_GROQ_MODEL = 'llama-3.1-8b-instant';
        runtime.character.settings.SMALL_GROQ_MODEL = 'llama-3.1-8b-instant';
      }
      
      engine.initialize();
      
      const coordinator = new AutonomousCoordinator();
      let actionsTaken = 0;
      let ticksProcessed = 0;
      
      // Run through all ticks
      while (!engine.isComplete()) {
        const tickNum = engine.getCurrentTickNumber();
        
        try {
          const tickResult = await coordinator.executeAutonomousTick(agent.id, runtime);
          
          if (tickResult.success) {
            const actions = Object.values(tickResult.actionsExecuted).reduce((sum, n) => sum + n, 0);
            actionsTaken += actions;
          }
          
          ticksProcessed++;
        } catch (error) {
          console.log(`   ⚠️  Error at tick ${tickNum}: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        engine.advanceTick();
      }
      
      const result = await engine.run();
      
      console.log(`   Ticks processed: ${ticksProcessed}/${snapshot.ticks.length}`);
      console.log(`   Actions taken: ${actionsTaken}`);
      console.log(`   Actions recorded: ${result.actions.length}`);
      console.log(`   Final tick number: ${result.ticksProcessed}`);
      
      const allTicksProcessed = ticksProcessed === snapshot.ticks.length;
      const actionsRecorded = result.actions.length > 0;
      const ticksMatch = result.ticksProcessed === snapshot.ticks.length;
      
      const passed = allTicksProcessed && actionsRecorded && ticksMatch;
      
      addResult(
        'Full Agent Integration',
        passed,
        passed 
          ? `All ${ticksProcessed} ticks processed, ${result.actions.length} actions recorded`
          : `Issues: ticks=${allTicksProcessed}, actions=${actionsRecorded}, match=${ticksMatch}`,
        passed ? undefined : 'Integration incomplete'
      );
    }
  } catch (error) {
    addResult('Full Agent Integration', false, 'Test crashed', error instanceof Error ? error.message : String(error));
  }
  
  // Test 7: Verify P&L calculation is real
  console.log('TEST 7: P&L Calculation Reality Check\n');
  try {
    const generator = new BenchmarkDataGenerator({
      durationMinutes: 1,
      tickInterval: 10,
      numPredictionMarkets: 2,
      numPerpetualMarkets: 1,
      numAgents: 2,
      seed: 77777,
    });
    
    const snapshot = await generator.generate();
    const engine = new SimulationEngine({
      snapshot,
      agentId: 'test',
      fastForward: true,
    });
    
    engine.initialize();
    
    // Make controlled trades
    const market1 = snapshot.initialState.predictionMarkets[0]!;
    const market2 = snapshot.initialState.predictionMarkets[1]!;
    const truth1 = snapshot.groundTruth.marketOutcomes[market1.id];
    const truth2 = snapshot.groundTruth.marketOutcomes[market2.id];
    
    console.log(`   Market 1: truth=${truth1}`);
    console.log(`   Market 2: truth=${truth2}`);
    
    // Bet correctly on market 1
    await engine.performAction('buy_prediction', {
      marketId: market1.id,
      outcome: truth1 ? 'YES' : 'NO',
      amount: 100,
    });
    
    // Bet incorrectly on market 2
    await engine.performAction('buy_prediction', {
      marketId: market2.id,
      outcome: truth2 ? 'NO' : 'YES',  // Opposite of truth
      amount: 50,
    });
    
    const result = await engine.run();
    
    // Expected P&L: +100 (win) - 50 (loss) = +50
    const expectedPnl = 50;
    const actualPnl = result.metrics.totalPnl;
    const pnlMatch = Math.abs(actualPnl - expectedPnl) < 0.01;
    
    console.log(`   Expected P&L: $${expectedPnl}`);
    console.log(`   Actual P&L: $${actualPnl}`);
    console.log(`   Correct: ${result.metrics.predictionMetrics.correctPredictions}`);
    console.log(`   Incorrect: ${result.metrics.predictionMetrics.incorrectPredictions}`);
    
    addResult(
      'P&L Calculation',
      pnlMatch,
      pnlMatch 
        ? `P&L matches expected: $${actualPnl.toFixed(2)}`
        : `P&L mismatch: expected $${expectedPnl}, got $${actualPnl}`,
      pnlMatch ? undefined : 'P&L calculation wrong'
    );
  } catch (error) {
    addResult('P&L Calculation', false, 'Test crashed', error instanceof Error ? error.message : String(error));
  }
  
  // Test 8: Verify errors are NOT swallowed
  console.log('TEST 8: Error Reporting\n');
  try {
    const generator = new BenchmarkDataGenerator({
      durationMinutes: 1,
      tickInterval: 10,
      numPredictionMarkets: 2,
      numPerpetualMarkets: 1,
      numAgents: 2,
      seed: 88888,
    });
    
    const snapshot = await generator.generate();
    const engine = new SimulationEngine({
      snapshot,
      agentId: 'test',
      fastForward: true,
    });
    
    engine.initialize();
    
    // Try invalid action (should fail visibly)
    let errorCaught = false;
    try {
      await engine.performAction('buy_prediction', {
        marketId: 'fake-market-id',
        outcome: 'YES',
        amount: 100,
      });
    } catch (err) {
      errorCaught = true;
      console.log(`   ✅ Invalid trade properly rejected: ${err instanceof Error ? err.message : String(err)}`);
    }
    
    addResult(
      'Error Reporting',
      errorCaught,
      errorCaught 
        ? 'Errors are properly thrown and visible'
        : 'ERROR: Invalid action was accepted! Errors may be swallowed.',
      errorCaught ? undefined : 'Error swallowing detected'
    );
  } catch (error) {
    addResult('Error Reporting', false, 'Test crashed', error instanceof Error ? error.message : String(error));
  }
  
  // Test 9: Consistency across runs
  console.log('TEST 9: Deterministic Results (Same Seed)\n');
  try {
    const run1 = await quickRun(99999);
    const run2 = await quickRun(99999);  // Same seed
    
    const consistent = 
      run1.pnl === run2.pnl &&
      run1.accuracy === run2.accuracy &&
      run1.actions === run2.actions;
    
    console.log(`   Run 1: ${run1.actions} actions, $${run1.pnl.toFixed(2)}, ${(run1.accuracy * 100).toFixed(1)}%`);
    console.log(`   Run 2: ${run2.actions} actions, $${run2.pnl.toFixed(2)}, ${(run2.accuracy * 100).toFixed(1)}%`);
    
    addResult(
      'Deterministic Results',
      consistent,
      consistent 
        ? 'Same seed produces identical results (deterministic)'
        : 'Results differ with same seed (non-deterministic)',
      consistent ? undefined : 'Randomness in simulation'
    );
  } catch (error) {
    addResult('Deterministic Results', false, 'Test crashed', error instanceof Error ? error.message : String(error));
  }
  
  // Final summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 VERIFICATION SUMMARY\n');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(0);
  
  console.log(`Tests Passed: ${passed}/${total} (${passRate}%)\n`);
  
  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.test}`);
  });
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED - SYSTEM IS REAL AND WORKING!\n');
    process.exit(0);
  } else {
    console.log('⚠️  SOME TESTS FAILED - REVIEW ISSUES ABOVE\n');
    process.exit(1);
  }
}

async function quickRun(seed: number): Promise<{ pnl: number; accuracy: number; actions: number }> {
  const generator = new BenchmarkDataGenerator({
    durationMinutes: 1,
    tickInterval: 10,
    numPredictionMarkets: 2,
    numPerpetualMarkets: 1,
    numAgents: 2,
    seed,
  });
  
  const snapshot = await generator.generate();
  const engine = new SimulationEngine({
    snapshot,
    agentId: 'test',
    fastForward: true,
  });
  
  engine.initialize();
  
  // Make some fixed trades
  const market = snapshot.initialState.predictionMarkets[0]!;
  await engine.performAction('buy_prediction', {
    marketId: market.id,
    outcome: 'YES',
    amount: 100,
  });
  
  const result = await engine.run();
  
  return {
    pnl: result.metrics.totalPnl,
    accuracy: result.metrics.predictionMetrics.accuracy,
    actions: result.actions.length,
  };
}

main().catch((error) => {
  console.error('\n❌ VERIFICATION FAILED:', error);
  process.exit(1);
});


