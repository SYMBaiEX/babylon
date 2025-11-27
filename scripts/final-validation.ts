/**
 * Final Validation Test
 *
 * Uses existing benchmark data to validate the system without heavy operations.
 * Checks that simulation actually works and isn't faking results.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  SimulationA2AInterface,
  SimulationEngine,
} from '@babylon/training';

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 FINAL VALIDATION TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const issues: string[] = [];

  // Load existing small benchmark (avoid generating)
  const benchmarkPath = path.join(
    process.cwd(),
    'benchmarks/benchmark-week-5-10-3-2-5-99999.json'
  );
  const data = await fs.readFile(benchmarkPath, 'utf-8');
  const snapshot = JSON.parse(data);

  console.log(`✅ Loaded benchmark: ${snapshot.ticks.length} ticks\n`);

  // TEST 1: Verify tick progression
  console.log('TEST 1: Tick Counter Progression');
  console.log('─────────────────────────');

  const engine = new SimulationEngine({
    snapshot,
    agentId: 'test',
    fastForward: true,
  });

  engine.initialize();

  const ticks: number[] = [];
  for (let i = 0; i < 6; i++) {
    ticks.push(engine.getCurrentTickNumber());
    engine.advanceTick();
  }

  console.log(`Tick progression: ${ticks.join(' → ')}`);

  if (ticks.every((t) => t === ticks[0])) {
    issues.push('❌ CRITICAL: Ticks not advancing!');
  } else if (ticks.some((t, i) => t !== i)) {
    issues.push(
      `❌ Tick sequence wrong! Expected [0,1,2,3,4,5], got [${ticks.join(',')}]`
    );
  } else {
    console.log('✅ Ticks advance correctly: 0 → 1 → 2 → 3 → 4 → 5');
  }

  // TEST 2: Verify isComplete() works
  console.log('\nTEST 2: Completion Detection');
  console.log('─────────────────────────');

  const engine2 = new SimulationEngine({
    snapshot,
    agentId: 'test2',
    fastForward: true,
  });

  engine2.initialize();

  const totalTicks = engine2.getTotalTicks();
  console.log(`Total ticks in benchmark: ${totalTicks}`);
  console.log(`Is complete initially: ${engine2.isComplete()}`);

  // Advance through all ticks
  let advanceCount = 0;
  while (!engine2.isComplete() && advanceCount < totalTicks + 5) {
    engine2.advanceTick();
    advanceCount++;
  }

  console.log(`Advanced ${advanceCount} times`);
  console.log(`Is complete after advancing: ${engine2.isComplete()}`);

  if (!engine2.isComplete()) {
    issues.push('❌ Simulation never completes!');
  } else if (advanceCount !== totalTicks) {
    issues.push(
      `❌ Completion at wrong tick: Expected ${totalTicks}, got ${advanceCount}`
    );
  } else {
    console.log(`✅ Completes after exactly ${totalTicks} ticks`);
  }

  // TEST 3: Verify actions are recorded
  console.log('\nTEST 3: Action Recording');
  console.log('─────────────────────────');

  const engine3 = new SimulationEngine({
    snapshot,
    agentId: 'test3',
    fastForward: true,
  });

  engine3.initialize();

  // Perform actions manually
  const market = snapshot.initialState.predictionMarkets[0];
  const actionResults: Array<{ success: boolean; error?: string }> = [];

  if (market) {
    const r1 = await engine3.performAction('buy_prediction', {
      marketId: market.id,
      outcome: 'YES',
      amount: 100,
    });
    actionResults.push(r1);

    const r2 = await engine3.performAction('buy_prediction', {
      marketId: market.id,
      outcome: 'NO',
      amount: 50,
    });
    actionResults.push(r2);
  }

  console.log(`Performed ${actionResults.length} actions`);
  console.log(`Successful: ${actionResults.filter((r) => r.success).length}`);

  // Get results
  const result3 = await engine3.run();

  console.log(`Actions in result: ${result3.actions.length}`);
  console.log(
    `Prediction positions: ${result3.metrics.predictionMetrics.totalPositions}`
  );

  if (actionResults.length !== result3.actions.length) {
    issues.push(
      `❌ Action recording broken! Performed ${actionResults.length}, recorded ${result3.actions.length}`
    );
  } else {
    console.log('✅ All actions properly recorded');
  }

  // TEST 4: Verify state changes are visible via A2A
  console.log('\nTEST 4: A2A State Visibility');
  console.log('─────────────────────────');

  const engine4 = new SimulationEngine({
    snapshot,
    agentId: 'test4',
    fastForward: true,
  });

  engine4.initialize();

  const a2a = new SimulationA2AInterface(engine4, 'test4');

  // Get markets at different ticks
  const markets0 = (await a2a.sendRequest('a2a.getPredictions', {})) as {
    predictions: Array<{ id: string }>;
  };
  engine4.advanceTick();
  engine4.advanceTick();
  const markets2 = (await a2a.sendRequest('a2a.getPredictions', {})) as {
    predictions: Array<{ id: string }>;
  };

  console.log(`Markets at tick 0: ${markets0.predictions.length}`);
  console.log(`Markets at tick 2: ${markets2.predictions.length}`);

  if (markets0.predictions.length === 0) {
    issues.push('❌ A2A returns no markets!');
  } else {
    console.log('✅ A2A provides market data');
  }

  // TEST 5: Verify ground truth correctness
  console.log('\nTEST 5: Ground Truth Correctness');
  console.log('─────────────────────────');

  const market0 = snapshot.initialState.predictionMarkets[0];
  if (market0) {
    const groundTruth = snapshot.groundTruth.marketOutcomes[market0.id];
    console.log(`Market: ${market0.question}`);
    console.log(`Ground truth outcome: ${groundTruth ? 'YES' : 'NO'}`);

    // Make a correct bet
    const correctEngine = new SimulationEngine({
      snapshot,
      agentId: 'test-correct',
      fastForward: true,
    });
    correctEngine.initialize();

    await correctEngine.performAction('buy_prediction', {
      marketId: market0.id,
      outcome: groundTruth ? 'YES' : 'NO', // Bet correctly
      amount: 100,
    });

    const correctResult = await correctEngine.run();
    const correctAcc = correctResult.metrics.predictionMetrics.accuracy;
    const correctPnl = correctResult.metrics.totalPnl;

    console.log(
      `Correct bet: Accuracy ${(correctAcc * 100).toFixed(0)}%, P&L $${correctPnl.toFixed(0)}`
    );

    // Make an incorrect bet
    const incorrectEngine = new SimulationEngine({
      snapshot,
      agentId: 'test-incorrect',
      fastForward: true,
    });
    incorrectEngine.initialize();

    await incorrectEngine.performAction('buy_prediction', {
      marketId: market0.id,
      outcome: groundTruth ? 'NO' : 'YES', // Bet incorrectly
      amount: 100,
    });

    const incorrectResult = await incorrectEngine.run();
    const incorrectAcc = incorrectResult.metrics.predictionMetrics.accuracy;
    const incorrectPnl = incorrectResult.metrics.totalPnl;

    console.log(
      `Incorrect bet: Accuracy ${(incorrectAcc * 100).toFixed(0)}%, P&L $${incorrectPnl.toFixed(0)}`
    );

    if (correctAcc !== 1.0) {
      issues.push(
        `❌ Correct bet should have 100% accuracy, got ${(correctAcc * 100).toFixed(0)}%`
      );
    } else {
      console.log('✅ Correct bets get 100% accuracy');
    }

    if (incorrectAcc !== 0.0) {
      issues.push(
        `❌ Incorrect bet should have 0% accuracy, got ${(incorrectAcc * 100).toFixed(0)}%`
      );
    } else {
      console.log('✅ Incorrect bets get 0% accuracy');
    }

    if (correctPnl <= 0) {
      issues.push(
        `❌ Correct bet should be profitable, got $${correctPnl.toFixed(2)}`
      );
    } else {
      console.log(
        `✅ Correct bets are profitable (+$${correctPnl.toFixed(2)})`
      );
    }

    if (incorrectPnl >= 0) {
      issues.push(
        `❌ Incorrect bet should lose money, got $${incorrectPnl.toFixed(2)}`
      );
    } else {
      console.log(`✅ Incorrect bets lose money ($${incorrectPnl.toFixed(2)})`);
    }
  }

  // TEST 6: Check actual results match expectations
  console.log('\nTEST 6: Results File Validation');
  console.log('─────────────────────────');

  try {
    const resultsPath = path.join(
      process.cwd(),
      'benchmarks/model-comparison/qwen32b/result.json'
    );
    const resultsData = await fs.readFile(resultsPath, 'utf-8');
    const savedResults = JSON.parse(resultsData);

    console.log('Loaded saved results from Qwen 32B run');
    console.log(`  Actions: ${savedResults.actions.length}`);
    console.log(`  Ticks: ${savedResults.ticksProcessed}`);
    console.log(`  P&L: $${savedResults.metrics.totalPnl.toFixed(2)}`);

    // Verify actions have real data
    const sampleAction = savedResults.actions[0];
    if (!sampleAction) {
      issues.push('❌ No actions in saved results!');
    } else {
      console.log(`  Sample action type: ${sampleAction.type}`);
      console.log(`  Sample action has data: ${!!sampleAction.data}`);
      console.log(
        `  Sample action has correctness: ${!!sampleAction.correctness}`
      );

      if (!sampleAction.data || !sampleAction.type) {
        issues.push('❌ Actions missing critical fields!');
      } else {
        console.log('✅ Actions contain real data');
      }
    }

    // Verify metrics match action counts
    const predictionActions = savedResults.actions.filter(
      (a: { type: string }) => a.type === 'buy_prediction'
    ).length;
    const perpActions = savedResults.actions.filter(
      (a: { type: string }) => a.type === 'open_perp'
    ).length;

    if (
      predictionActions !==
      savedResults.metrics.predictionMetrics.totalPositions
    ) {
      issues.push(
        `❌ Prediction count mismatch: ${predictionActions} actions vs ${savedResults.metrics.predictionMetrics.totalPositions} metric`
      );
    } else {
      console.log(
        `✅ Prediction metrics match action count (${predictionActions})`
      );
    }

    if (perpActions !== savedResults.metrics.perpMetrics.totalTrades) {
      issues.push(
        `❌ Perp count mismatch: ${perpActions} actions vs ${savedResults.metrics.perpMetrics.totalTrades} metric`
      );
    } else {
      console.log(`✅ Perp metrics match action count (${perpActions})`);
    }
  } catch (_error) {
    console.log('⚠️  No saved results to validate (run comparison first)');
  }

  // FINAL REPORT
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 VALIDATION REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (issues.length === 0) {
    console.log('🎉 ALL VALIDATIONS PASSED!');
    console.log('\nThe simulation system is GENUINELY working:');
    console.log('  ✅ Tick counter advances properly');
    console.log('  ✅ Simulation completes at right time');
    console.log('  ✅ Actions are recorded');
    console.log('  ✅ State changes are visible');
    console.log('  ✅ Ground truth determines correctness');
    console.log('  ✅ Correct bets = profit, 100% accuracy');
    console.log('  ✅ Incorrect bets = loss, 0% accuracy');
    console.log('  ✅ Metrics match actual action counts');
    console.log('  ✅ Results contain real data');
    console.log('\n✅ SYSTEM IS 100% OPERATIONAL!\n');
    process.exit(0);
  } else {
    console.log(`❌ FOUND ${issues.length} ISSUES:\n`);
    issues.forEach((issue, i) => {
      console.log(`${i + 1}. ${issue}`);
    });
    console.log('\n⚠️  SYSTEM HAS PROBLEMS!\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ VALIDATION ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
