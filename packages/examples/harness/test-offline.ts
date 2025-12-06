/**
 * Test script for SimulationAdapter
 *
 * Verifies that the simulation engine works correctly tick-by-tick.
 *
 * Usage: bun run test-offline.ts
 */

import { SimulationAdapter } from './src/offline-adapter';

async function main() {
  console.log('\n🎮 Testing Simulation Adapter\n');
  console.log('='.repeat(50));

  // Create adapter with seed for reproducibility
  const adapter = new SimulationAdapter({
    numPredictionMarkets: 3,
    numPerpMarkets: 5,
    numAgents: 10,
    durationDays: 5, // Short test
    seed: 12345,
  });

  // Check initial state
  const stats = await adapter.getStats();
  console.log(`\n📦 Initial State:`);
  console.log(`   Total agents: ${stats.totalAgents}`);
  console.log(`   Total markets: ${stats.totalMarkets}`);

  // Get markets
  const markets = await adapter.getMarkets();
  console.log(`\n📊 Markets:`);
  console.log(`   Predictions: ${markets.predictions.length}`);
  for (const m of markets.predictions) {
    console.log(
      `      - ${m.question.slice(0, 50)}... (YES: ${m.yesPrice.toFixed(2)})`
    );
  }
  console.log(`   Perps: ${markets.perps.length}`);
  for (const m of markets.perps) {
    console.log(`      - ${m.id}: $${m.yesPrice.toFixed(2)}`);
  }

  // Get initial portfolio
  let portfolio = await adapter.getPortfolio();
  console.log(`\n💰 Initial Portfolio:`);
  console.log(`   Balance: $${portfolio.balance.toFixed(2)}`);
  console.log(`   Positions: ${portfolio.positions.length}`);

  // Make some trades
  console.log(`\n🔄 Making trades...`);

  if (markets.predictions.length > 0) {
    const market = markets.predictions[0];
    console.log(`   Buying YES on: ${market.question.slice(0, 40)}...`);
    const trade = await adapter.buyShares(market.id, 'YES', 100);
    console.log(
      `   ✅ Bought ${trade.shares.toFixed(2)} shares @ $${trade.price.toFixed(2)}`
    );
  }

  // Create a post
  console.log(`\n📝 Creating post...`);
  const post = await adapter.createPost('Testing the simulation engine! 🚀');
  console.log(`   ✅ Created post: ${post.id}`);

  // Run some ticks
  console.log(`\n⏰ Running simulation ticks...`);

  for (let i = 0; i < 24; i++) {
    const _result = adapter.tick();
    const progress = adapter.getProgress();

    // Log every 6 hours
    if (progress.hour % 6 === 0) {
      console.log(
        `   Tick ${progress.tick}: Day ${progress.day}, Hour ${progress.hour}`
      );
    }
  }

  // Check final portfolio
  portfolio = await adapter.getPortfolio();
  console.log(`\n💰 Final Portfolio:`);
  console.log(`   Balance: $${portfolio.balance.toFixed(2)}`);
  console.log(`   Positions: ${portfolio.positions.length}`);
  console.log(`   P&L: $${portfolio.pnl.toFixed(2)}`);

  // Check feed
  const feed = await adapter.getFeed(5);
  console.log(`\n📰 Latest posts: ${feed.posts.length}`);
  for (const p of feed.posts.slice(0, 3)) {
    console.log(`   - [${p.authorName}] ${p.content.slice(0, 50)}...`);
  }

  // Leaderboard
  const leaderboard = await adapter.getLeaderboard(5);
  console.log(`\n🏆 Leaderboard:`);
  for (const entry of leaderboard.entries) {
    console.log(
      `   #${entry.rank} ${entry.displayName}: $${entry.pnl.toFixed(2)}`
    );
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Simulation Adapter test complete!');
  console.log(
    `   Simulation: Day ${adapter.getProgress().day}, Hour ${adapter.getProgress().hour}`
  );
  console.log(`   Complete: ${adapter.isComplete()}`);
}

main().catch(console.error);
