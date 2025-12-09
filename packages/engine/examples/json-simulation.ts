/**
 * JSON Mode Simulation Example
 *
 * Demonstrates running the Babylon engine entirely in JSON mode,
 * without any database dependencies. Perfect for:
 * - Local development and testing
 * - Training and benchmarking AI agents
 * - Observing game mechanics
 * - Debugging complex scenarios
 *
 * Run with: bun packages/engine/examples/json-simulation.ts
 */

import { generateSnowflakeId } from '@babylon/shared';
import {
  db,
  initializeSimulationMode,
  isSimulationMode,
  saveSnapshot,
} from '../src/storage-bridge';

// Simulation configuration
const SIMULATION_DAYS = 5;
const EVENTS_PER_DAY = 3;
const OUTPUT_DIR = './simulation-output';

// Example actors (normally loaded from static data)
const ACTORS = [
  {
    id: 'marcus-chen',
    name: 'Marcus Chen',
    tier: 'major' as const,
    tradingBalance: 100000,
    personality: 'aggressive trader',
  },
  {
    id: 'elena-vega',
    name: 'Elena Vega',
    tier: 'major' as const,
    tradingBalance: 80000,
    personality: 'conservative analyst',
  },
  {
    id: 'james-wright',
    name: 'James Wright',
    tier: 'minor' as const,
    tradingBalance: 30000,
    personality: 'tech enthusiast',
  },
];

// Example organizations (markets)
const ORGANIZATIONS = [
  { id: 'baymax-corp', name: 'BayMax Corp', ticker: 'BMAX', initialPrice: 150 },
  { id: 'nexus-ai', name: 'Nexus AI', ticker: 'NAIX', initialPrice: 200 },
  {
    id: 'quantum-labs',
    name: 'Quantum Labs',
    ticker: 'QLBS',
    initialPrice: 85,
  },
];

// Event types for simulation
const EVENT_TYPES = [
  'earnings_report',
  'product_launch',
  'partnership_announcement',
  'regulatory_news',
  'market_analysis',
];

async function main() {
  console.log('='.repeat(60));
  console.log('Babylon JSON Mode Simulation');
  console.log('='.repeat(60));
  console.log();

  // Initialize simulation mode
  console.log(`Initializing simulation in: ${OUTPUT_DIR}`);
  await initializeSimulationMode(OUTPUT_DIR);

  console.log('Mode:', isSimulationMode() ? 'SIMULATION' : 'DATABASE');
  console.log();

  // Initialize game state
  console.log('Initializing game state...');
  const gameId = await generateSnowflakeId();
  const game = await db.game.create({
    data: {
      id: gameId,
      currentDay: 1,
      dayStartedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log(`Game initialized: ${game.id}`);
  console.log();

  // Set up actors
  console.log('Setting up actors...');
  for (const actor of ACTORS) {
    await db.actorState.create({
      data: {
        id: actor.id,
        actorId: actor.id,
        tradingBalance: String(actor.tradingBalance),
        reputationPoints: 10000,
        hasPool: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`  - ${actor.name} (${actor.id}): $${actor.tradingBalance}`);
  }
  console.log();

  // Create prediction questions (markets)
  console.log('Creating prediction markets...');
  const questions = [];
  for (const org of ORGANIZATIONS) {
    const questionId = await generateSnowflakeId();
    const question = await db.question.create({
      data: {
        id: questionId,
        title: `Will ${org.name} (${org.ticker}) beat earnings?`,
        description: `Prediction market for ${org.name} Q4 earnings`,
        category: 'earnings',
        questionType: 'binary',
        yesShares: '10000',
        noShares: '10000',
        initialLiquidity: '20000',
        currentLiquidity: '20000',
        status: 'active',
        visibility: 'public',
        resolutionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    questions.push(question);
    console.log(`  - ${question.title}`);
  }
  console.log();

  // Run simulation days
  console.log('='.repeat(60));
  console.log('SIMULATION START');
  console.log('='.repeat(60));
  console.log();

  for (let day = 1; day <= SIMULATION_DAYS; day++) {
    console.log(`--- Day ${day} ---`);

    // Update game state
    await db.game.update({
      where: { id: game.id },
      data: {
        currentDay: day,
        updatedAt: new Date(),
      },
    });

    // Generate events
    for (let e = 0; e < EVENTS_PER_DAY; e++) {
      const eventType =
        EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)]!;
      const org =
        ORGANIZATIONS[Math.floor(Math.random() * ORGANIZATIONS.length)]!;
      const isPositive = Math.random() > 0.5;

      const eventId = await generateSnowflakeId();
      const event = await db.worldEvent.create({
        data: {
          id: eventId,
          eventType,
          title: `${org.name} ${eventType.replace('_', ' ')}`,
          description: `${org.name}: ${eventType.replace('_', ' ')} - ${isPositive ? 'Positive' : 'Negative'} outlook`,
          actors: [ACTORS[Math.floor(Math.random() * ACTORS.length)]!.id],
          visibility: 'public',
          sentiment: isPositive ? 0.7 : 0.3,
          dayNumber: day,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      console.log(`  Event: ${event.description}`);
    }

    // Actors make trades
    for (const actor of ACTORS) {
      const question = questions[Math.floor(Math.random() * questions.length)]!;
      const side = Math.random() > 0.5 ? 'YES' : 'NO';
      const amount = Math.floor(Math.random() * 5000) + 1000;
      const price =
        side === 'YES'
          ? 0.45 + Math.random() * 0.2
          : 0.35 + Math.random() * 0.2;

      // Record the trade
      const tradeId = await generateSnowflakeId();
      await db.npcTrade.create({
        data: {
          id: tradeId,
          npcActorId: actor.id,
          marketType: 'prediction',
          marketId: question.id,
          action: side === 'YES' ? 'buy_yes' : 'buy_no',
          side,
          amount: String(amount),
          price: String(price),
          sentiment: side === 'YES' ? 0.7 : 0.3,
          reason: `Day ${day} trading decision`,
          createdAt: new Date(),
        },
      });

      // Update actor balance
      const state = await db.actorState.findUnique({ where: { id: actor.id } });
      const newBalance = Number(state?.tradingBalance ?? 0) - amount;
      await db.actorState.update({
        where: { id: actor.id },
        data: { tradingBalance: String(newBalance) },
      });

      console.log(
        `  Trade: ${actor.name} bought ${side} on ${question.id} for $${amount} @ ${(price * 100).toFixed(1)}%`
      );
    }

    // Actors post content
    const poster = ACTORS[Math.floor(Math.random() * ACTORS.length)]!;
    const postId = await generateSnowflakeId();
    await db.post.create({
      data: {
        id: postId,
        postType: 'status',
        content: `Day ${day} market update: Seeing interesting movement in the prediction markets! 📊`,
        authorId: poster.id,
        authorType: 'actor',
        visibility: 'public',
        dayNumber: day,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`  Post: ${poster.name} shared market update`);

    console.log();
  }

  console.log('='.repeat(60));
  console.log('SIMULATION COMPLETE');
  console.log('='.repeat(60));
  console.log();

  // Summary statistics using db interface
  const allActorStates = await db.actorState.findMany();
  const activeQuestions = await db.question.findMany({
    where: { status: 'active' },
  });
  const recentPosts = await db.post.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
  });
  const recentEvents = await db.worldEvent.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
  });
  const allTrades = await db.npcTrade.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  console.log('Final State Summary:');
  console.log(`  - Days simulated: ${SIMULATION_DAYS}`);
  console.log(`  - Actors: ${allActorStates.length}`);
  console.log(`  - Markets: ${activeQuestions.length}`);
  console.log(`  - Posts: ${recentPosts.length}`);
  console.log(`  - World Events: ${recentEvents.length}`);
  console.log(`  - NPC Trades: ${allTrades.length}`);
  console.log();

  // Show actor balances
  console.log('Actor Final Balances:');
  for (const actor of ACTORS) {
    const state = await db.actorState.findUnique({ where: { id: actor.id } });
    console.log(
      `  - ${actor.name}: $${Number(state?.tradingBalance ?? 0).toLocaleString()}`
    );
  }
  console.log();

  // Save final state
  await saveSnapshot();
  console.log(`State saved to: ${OUTPUT_DIR}/state.json`);
  console.log();

  console.log('You can inspect the JSON file to see all simulation data!');
}

void main();
