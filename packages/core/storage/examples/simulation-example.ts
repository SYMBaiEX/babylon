/**
 * Example: Using JSON Storage for Simulation
 *
 * This demonstrates how to use the storage abstraction layer
 * for simulation without requiring a database connection.
 */

import { createSimulationStorage } from '../index';

async function runSimulation() {
  // Initialize JSON storage (no database required)
  const provider = await createSimulationStorage('./simulation-output');

  console.log('Storage provider initialized:', provider.mode);

  // Initialize game state
  const game = await provider.game.initializeGame();
  console.log('Game initialized:', game.id);

  // Create some actors (normally loaded from static data)
  await provider.actors.upsertActorState({
    id: 'marcus-chen',
    tradingBalance: '50000',
    reputationPoints: 10000,
    hasPool: false,
  });

  await provider.actors.upsertActorState({
    id: 'sarah-williams',
    tradingBalance: '75000',
    reputationPoints: 15000,
    hasPool: true,
  });

  // Create a prediction market
  await provider.markets.createMarket({
    id: 'market-1',
    title: 'Will TechCorp stock reach $500 by end of month?',
    description: 'Price target prediction',
    category: 'technology',
    yesShares: '10000',
    noShares: '10000',
    liquidity: '20000',
    resolved: false,
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  // Create a question
  const question = await provider.questions.createQuestion({
    questionNumber: 1,
    text: 'Will TechCorp announce positive earnings?',
    scenarioId: 1,
    outcome: false,
    rank: 1,
    status: 'active',
    resolutionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  console.log('Question created:', question.id);

  // Create a post
  await provider.posts.createPost({
    id: 'post-1',
    type: 'post',
    content: 'TechCorp earnings looking strong! 📈',
    authorId: 'marcus-chen',
    timestamp: new Date(),
  });

  // Get recent posts
  const posts = await provider.posts.getRecentPosts({ limit: 10 });
  console.log('Recent posts:', posts.items.length);

  // Create a trade
  await provider.trading.createNpcTrade({
    npcActorId: 'marcus-chen',
    marketType: 'prediction',
    marketId: 'market-1',
    action: 'buy_yes',
    side: 'YES',
    amount: 1000,
    price: 0.55,
    sentiment: 0.8,
    reason: 'Strong earnings outlook',
  });

  // Update actor balance after trade
  await provider.actors.updateActorBalance('marcus-chen', 49000);

  // Record a world event
  await provider.game.createEvent({
    id: 'event-1',
    eventType: 'earnings_report',
    description: 'TechCorp preliminary Q3 earnings exceed analyst expectations',
    actors: ['marcus-chen'],
    visibility: 'public',
    pointsToward: 'YES',
    relatedQuestion: 1,
    dayNumber: 1,
  });

  // Get current state summary
  const actorStates = await provider.actors.getAllActorStates();
  const activeMarkets = await provider.markets.getActiveMarkets();
  const activeQuestions = await provider.questions.getActiveQuestions();

  console.log('\n=== Simulation State ===');
  console.log('Actors:', actorStates.length);
  console.log('Active Markets:', activeMarkets.length);
  console.log('Active Questions:', activeQuestions.length);
  console.log('Total Posts:', await provider.posts.getTotalPosts());

  // Save snapshot
  await provider.saveSnapshot?.();
  console.log('\nState saved to ./simulation-output/state.json');

  // Shutdown
  await provider.shutdown();
}

// Run if this file is executed directly
if (import.meta.main) {
  void runSimulation();
}
