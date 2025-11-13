/**
 * Test World Context Integration
 * 
 * Demonstrates the feed prompt system with live database data
 * Run: npx tsx scripts/test-world-context.ts
 */

import { generateWorldContext } from '../src/lib/prompts';

async function main() {
  console.log('🚀 Testing World Context Integration\n');
  console.log('=' .repeat(80));
  
  try {
    // Generate context from actors.json and database
    console.log('\n📊 Fetching world context from database...\n');
    const startTime = Date.now();
    
    const worldContext = await generateWorldContext({
      maxActors: 30,
      includeMarkets: true,
      includePredictions: true,
      includeTrades: true,
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Context generated in ${duration}ms\n`);
    console.log('=' .repeat(80));
    
    // Display each context section
    console.log('\n📋 WORLD ACTORS');
    console.log('-'.repeat(80));
    const actorCount = worldContext.worldActors.split(',').length;
    console.log(`Loaded ${actorCount} actors`);
    console.log(worldContext.worldActors.substring(0, 200) + '...\n');
    
    console.log('=' .repeat(80));
    console.log('\n📈 ACTIVE MARKETS');
    console.log('-'.repeat(80));
    console.log(worldContext.currentMarkets);
    console.log('');
    
    console.log('=' .repeat(80));
    console.log('\n❓ ACTIVE PREDICTIONS');
    console.log('-'.repeat(80));
    console.log(worldContext.activePredictions);
    console.log('');
    
    console.log('=' .repeat(80));
    console.log('\n💰 RECENT TRADES');
    console.log('-'.repeat(80));
    console.log(worldContext.recentTrades);
    console.log('');
    
    console.log('=' .repeat(80));
    console.log('\n✅ Integration test complete!');
    console.log('\nNext steps:');
    console.log('  1. Use this context in feed generation');
    console.log('  2. Prompts will reference real markets and trades');
    console.log('  3. NPCs will only use parody names (AIlon Musk, etc.)');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

