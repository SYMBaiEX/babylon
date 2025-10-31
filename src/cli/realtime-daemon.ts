#!/usr/bin/env bun

/**
 * Babylon Realtime Daemon
 * 
 * Continuously running game engine that generates content every minute.
 * - Runs at 1x speed (realtime)
 * - Generates 10-20 posts per minute
 * - Updates stock prices every minute
 * - Creates/resolves questions automatically
 * - Keeps rolling 30-day history
 * 
 * Usage:
 *   bun run daemon              (start daemon)
 *   bun run daemon --verbose    (with detailed logging)
 */

import { RealtimeGameEngine } from '../engine/RealtimeGameEngine';

interface CLIOptions {
  verbose?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  args.forEach(arg => {
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    }
  });

  return options;
}

async function main() {
  const options = parseArgs();

  console.log('\n🎮 BABYLON REALTIME DAEMON');
  console.log('==========================\n');

  // Validate API key
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    console.error('❌ ERROR: No API key found!\n');
    console.error('Set GROQ_API_KEY or OPENAI_API_KEY environment variable.\n');
    process.exit(1);
  }

  if (groqKey) {
    console.log('🚀 Using Groq (fast inference)\n');
  } else if (openaiKey) {
    console.log('🤖 Using OpenAI\n');
  }

  // Create engine with A2A enabled
  const engine = new RealtimeGameEngine({
    tickIntervalMs: 60000, // 1 minute
    postsPerTick: 15, // Average 15 posts/minute
    historyDays: 30,
    a2a: {
      enabled: true, // Enable A2A protocol
      port: 8080,
      host: '0.0.0.0',
      maxConnections: 1000,
      enableBlockchain: false, // Optional blockchain integration
    },
  });

  // Set up event listeners
  engine.on('tick', (tick) => {
    if (options.verbose) {
      console.log(`\n📊 Tick Summary:`);
      console.log(`   Posts: ${tick.posts.length}`);
      console.log(`   Price Updates: ${tick.priceUpdates.length}`);
      console.log(`   Events: ${tick.events.length}`);
      console.log(`   Questions Resolved: ${tick.questionsResolved}`);
      console.log(`   Questions Created: ${tick.questionsCreated}`);
    }
  });

  engine.on('error', (error) => {
    console.error('\n❌ Engine Error:', error);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n📊 Final Stats:');
    const state = engine.getState();
    console.log(`   Total Actors: ${state.actors}`);
    console.log(`   Companies: ${state.companies}`);
    console.log(`   Active Questions: ${state.activeQuestions}`);
    console.log(`   Total Questions: ${state.totalQuestions}`);
    console.log(`   History Ticks: ${state.recentTicks}`);
    
    engine.stop();
    process.exit(0);
  });

  // Initialize and start
  try {
    await engine.initialize();
    engine.start();

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    console.error('\n❌ Fatal Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

export { main };


