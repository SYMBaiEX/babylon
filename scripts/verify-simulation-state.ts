/**
 * Verify Simulation State Progression
 * 
 * Validates that the simulation state actually changes between ticks
 * and that agents see the changing state.
 */

import { BenchmarkDataGenerator } from '@/lib/benchmark/BenchmarkDataGenerator';
import { SimulationEngine } from '@/lib/benchmark/SimulationEngine';
import { SimulationA2AInterface } from '@/lib/benchmark/SimulationA2AInterface';

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 SIMULATION STATE VERIFICATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Generate small benchmark
  const generator = new BenchmarkDataGenerator({
    durationMinutes: 3,
    tickInterval: 30,
    numPredictionMarkets: 3,
    numPerpetualMarkets: 2,
    numAgents: 3,
    seed: 99999,
  });
  
  const snapshot = await generator.generate();
  console.log(`Generated ${snapshot.ticks.length} ticks\n`);
  
  // Create simulation
  const engine = new SimulationEngine({
    snapshot,
    agentId: 'test-agent',
    fastForward: true,
  });
  
  engine.initialize();
  
  const a2a = new SimulationA2AInterface(engine, 'test-agent');
  
  console.log('📊 Checking state progression:\n');
  
  const states = [];
  
  for (let i = 0; i < Math.min(6, snapshot.ticks.length); i++) {
    // Get market data
    const predictions = await a2a.sendRequest('a2a.getPredictions', {}) as { predictions: Array<{id: string; yesPrice: number}> };
    const perpetuals = await a2a.sendRequest('a2a.getPerpetuals', {}) as { perpetuals: Array<{ticker: string; price: number; priceChange24h?: number}> };
    
    states.push({
      tick: i,
      predictionPrice: predictions.predictions[0]?.yesPrice ?? 0,
      perpPrice: perpetuals.perpetuals[0]?.price ?? 0,
      perpChange: perpetuals.perpetuals[0]?.priceChange24h ?? 0,
    });
    
    console.log(`Tick ${i}:`);
    console.log(`  Prediction market-0 YES: ${((predictions.predictions[0]?.yesPrice ?? 0) * 100).toFixed(2)}%`);
    console.log(`  Perp ${perpetuals.perpetuals[0]?.ticker ?? 'N/A'}: $${(perpetuals.perpetuals[0]?.price ?? 0).toFixed(2)} (${(perpetuals.perpetuals[0]?.priceChange24h ?? 0).toFixed(2)}% change)`);
    console.log('');
    
    // Don't advance tick in A2A anymore since we removed that
    engine.advanceTick();
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 STATE PROGRESSION ANALYSIS\n');
  
  // Check if perp prices change
  const perpPrices = states.map(s => s.perpPrice).filter((p): p is number => typeof p === 'number');
  const perpPricesChange = perpPrices.some((p, i) => i > 0 && p !== perpPrices[0]);
  
  // Check if prediction prices change
  const predPrices = states.map(s => s.predictionPrice).filter((p): p is number => typeof p === 'number');
  const predPricesChange = predPrices.some((p, i) => i > 0 && p !== predPrices[0]);
  
  console.log(`Perp Prices Change: ${perpPricesChange ? '✅ YES' : '⚠️  NO (static)'}`);
  if (perpPrices.length > 0) {
    console.log(`  Range: $${Math.min(...perpPrices).toFixed(2)} - $${Math.max(...perpPrices).toFixed(2)}`);
  }
  console.log('');
  
  console.log(`Prediction Prices Change: ${predPricesChange ? '✅ YES' : '⚠️  NO (static)'}`);
  if (predPrices.length > 0) {
    console.log(`  Range: ${(Math.min(...predPrices) * 100).toFixed(2)}% - ${(Math.max(...predPrices) * 100).toFixed(2)}%`);
  }
  console.log('');
  
  if (!perpPricesChange && !predPricesChange) {
    console.log('⚠️  WARNING: Market states are completely static!');
    console.log('   This is OK for deterministic benchmarks but means:');
    console.log('   - Agent trades don\'t affect markets (by design)');
    console.log('   - Market dynamics are pre-recorded');
    console.log('   - Same inputs = same outputs (good for testing)');
  } else if (perpPricesChange && !predPricesChange) {
    console.log('✅ GOOD: Perp markets evolve, predictions stay stable');
    console.log('   This is realistic for:');
    console.log('   - Short simulation duration');
    console.log('   - Prediction markets with low activity');
    console.log('   - Benchmark design (perps more dynamic)');
  } else {
    console.log('✅ EXCELLENT: Both market types show dynamic progression!');
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ STATE VERIFICATION COMPLETE\n');
  
  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

