import { BenchmarkDataGenerator } from '@/lib/benchmark/BenchmarkDataGenerator';

const config = {
  durationMinutes: 1,
  tickInterval: 10,
  numPredictionMarkets: 2,
  numPerpetualMarkets: 1,
  numAgents: 2,
  seed: 12345,
};

console.log('Starting benchmark generation test...');
const g = new BenchmarkDataGenerator(config);
console.log('Generator created');

const start = Date.now();
console.log('Calling generate()...');

g.generate()
  .then((s) => {
    const duration = Date.now() - start;
    console.log(`✅ Generated in ${duration}ms`);
    console.log(`   Ticks: ${s.ticks.length}`);
    console.log(`   Markets: ${s.initialState.predictionMarkets.length}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌ Error:', e);
    if (e instanceof Error) {
      console.error('   Message:', e.message);
      console.error('   Stack:', e.stack?.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  });
