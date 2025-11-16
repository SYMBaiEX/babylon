/**
 * Debug Benchmark Generation
 * Minimal test to find where it hangs
 */

import { BenchmarkDataGenerator, type BenchmarkConfig } from '@/lib/benchmark/BenchmarkDataGenerator';

async function debugGeneration() {
  console.log('🔍 Debugging Benchmark Generation...\n');
  
  const config: BenchmarkConfig = {
    durationMinutes: 1,
    tickInterval: 10,
    numPredictionMarkets: 2,
    numPerpetualMarkets: 1,
    numAgents: 2,
    seed: 12345,
  };
  
  console.log('Config:', config);
  console.log('Expected ticks:', Math.floor((config.durationMinutes * 60) / config.tickInterval));
  
  try {
    console.log('\nCreating generator...');
    const generator = new BenchmarkDataGenerator(config);
    console.log('✅ Generator created');
    
    console.log('\nCalling generate()...');
    const startTime = Date.now();
    const snapshot = await generator.generate();
    const duration = Date.now() - startTime;
    
    console.log('✅ Generated successfully');
    console.log(`   Duration: ${duration}ms`);
    console.log(`   ID: ${snapshot.id}`);
    console.log(`   Ticks: ${snapshot.ticks.length}`);
    console.log(`   Markets: ${snapshot.initialState.predictionMarkets.length}`);
    console.log(`   Posts in first tick: ${snapshot.ticks[0]?.state.posts?.length || 0}`);
    console.log(`   Group chats in first tick: ${snapshot.ticks[0]?.state.groupChats?.length || 0}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

debugGeneration();

