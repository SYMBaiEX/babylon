/**
 * Test Benchmark Generation
 * Quick test to verify benchmark generation works correctly
 */

import { BenchmarkDataGenerator, type BenchmarkConfig } from '@/lib/benchmark/BenchmarkDataGenerator';
import { BenchmarkValidator } from '@/lib/benchmark/BenchmarkValidator';
import { BenchmarkDataViewer } from '@/lib/benchmark/BenchmarkDataViewer';
import { extractMarketOutcomesFromBenchmark, createRulerContext } from '@/lib/benchmark/RulerBenchmarkIntegration';

async function testGeneration() {
  console.log('🧪 Testing Benchmark Generation...\n');
  
  const config: BenchmarkConfig = {
    durationMinutes: 1, // Very short for quick test
    tickInterval: 10,
    numPredictionMarkets: 2,
    numPerpetualMarkets: 1,
    numAgents: 2,
    seed: 12345,
  };
  
  console.log('Config:', config);
  
  try {
    // Generate
    console.log('\n1. Generating benchmark...');
    const generator = new BenchmarkDataGenerator(config);
    const snapshot = await generator.generate();
    console.log('✅ Generated successfully');
    console.log(`   ID: ${snapshot.id}`);
    console.log(`   Ticks: ${snapshot.ticks.length}`);
    console.log(`   Markets: ${snapshot.initialState.predictionMarkets.length}`);
    
    // Validate
    console.log('\n2. Validating benchmark...');
    const validation = BenchmarkValidator.validate(snapshot);
    if (!validation.valid) {
      console.error('❌ Validation failed:', validation.errors);
      return false;
    }
    console.log('✅ Validation passed');
    if (validation.warnings.length > 0) {
      console.log(`   Warnings: ${validation.warnings.length}`);
    }
    
    // Check data completeness
    console.log('\n3. Checking data completeness...');
    
    // Check posts
    const hasPosts = snapshot.ticks.some(t => t.state.posts && t.state.posts.length > 0);
    console.log(`   Posts: ${hasPosts ? '✅' : '❌'}`);
    
    // Check group chats
    const hasGroupChats = snapshot.ticks.some(t => t.state.groupChats && t.state.groupChats.length > 0);
    console.log(`   Group Chats: ${hasGroupChats ? '✅' : '❌'}`);
    
    // Check ground truth
    console.log(`   Market Outcomes: ${Object.keys(snapshot.groundTruth.marketOutcomes).length > 0 ? '✅' : '❌'}`);
    console.log(`   Hidden Facts: ${(snapshot.groundTruth.hiddenFacts?.length || 0) > 0 ? '✅' : '❌'}`);
    console.log(`   Hidden Events: ${(snapshot.groundTruth.hiddenEvents?.length || 0) > 0 ? '✅' : '❌'}`);
    console.log(`   True Facts: ${Object.keys(snapshot.groundTruth.trueFacts || {}).length > 0 ? '✅' : '❌'}`);
    
    // Test viewer (create temp file)
    console.log('\n4. Testing data viewer...');
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const tempFile = path.join(process.cwd(), 'benchmarks', `test-${snapshot.id}.json`);
    await fs.writeFile(tempFile, JSON.stringify(snapshot, null, 2));
    await BenchmarkDataViewer.view(tempFile, { showGroundTruth: true });
    await fs.unlink(tempFile).catch(() => {});
    console.log('✅ Viewer works');
    
    // Test RULER integration
    console.log('\n5. Testing RULER integration...');
    const outcomes = extractMarketOutcomesFromBenchmark(snapshot);
    console.log(`   Market Outcomes: ${outcomes.predictions.length} predictions, ${outcomes.stocks.length} stocks`);
    
    const context = createRulerContext(snapshot);
    console.log(`   Context: ${Object.keys(context).join(', ')}`);
    console.log('✅ RULER integration works');
    
    // Security check
    console.log('\n6. Security check...');
    const security = BenchmarkDataViewer.verifyAgentCannotAccessHiddenFacts(snapshot);
    if (security.canAccess) {
      console.error('❌ SECURITY ISSUE: Agents can access hidden facts!');
      return false;
    }
    console.log('✅ Security verified: Agents cannot access hidden facts');
    
    // Check for nulls/undefined
    console.log('\n7. Checking for null/undefined values...');
    const jsonStr = JSON.stringify(snapshot);
    if (jsonStr.includes('null') && jsonStr.match(/":\s*null/g)?.length) {
      const nullMatches = jsonStr.match(/":\s*null/g);
      console.log(`   ⚠️  Found ${nullMatches?.length} null values (may be expected)`);
    } else {
      console.log('✅ No unexpected null values');
    }
    
    console.log('\n✅ All tests passed!\n');
    return true;
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    return false;
  }
}

testGeneration().then(success => {
  process.exit(success ? 0 : 1);
});

