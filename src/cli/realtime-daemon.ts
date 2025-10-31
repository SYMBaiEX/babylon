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
 * - Auto-starts ElizaOS agents (if enabled)
 * 
 * Usage:
 *   bun run daemon              (start daemon)
 *   bun run daemon --verbose    (with detailed logging)
 * 
 * Environment Variables:
 *   AUTO_START_AGENTS=true      (default: true) - Auto-start agents on daemon launch
 *   AGENT_AUTO_TRADE=true       (default: false) - Enable auto-trading for agents
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
      enableBlockchain: process.env.A2A_ENABLE_BLOCKCHAIN === 'true', // Enable blockchain integration for agent discovery
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

    // Auto-start agents if enabled
    const autoStartAgents = process.env.AUTO_START_AGENTS !== 'false'; // Default to true
    if (autoStartAgents) {
      console.log('\n🤖 Starting agents...');
      await startAgents();
    } else {
      console.log('\n⏭️  Agent auto-start disabled (set AUTO_START_AGENTS=false to disable)');
    }

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    console.error('\n❌ Fatal Error:', error);
    process.exit(1);
  }
}

// Track if agents have been started to prevent duplicate spawning
let agentsStarted = false;
let agentProcess: ReturnType<typeof import('child_process').spawn> | null = null;

/**
 * Start all agents using the spawn script
 * Prevents duplicate spawning if called multiple times
 */
async function startAgents(): Promise<void> {
  // If agents already started, don't start again
  if (agentsStarted && agentProcess) {
    console.log('   ⏭️  Agents already started, skipping duplicate spawn');
    return;
  }

  try {
    const { spawn } = await import('child_process');
    const { join } = await import('path');
    
    const agentScript = join(process.cwd(), 'scripts', 'run-all-agents.ts');
    const autoTrade = process.env.AGENT_AUTO_TRADE === 'true';
    
    console.log(`   Spawning agents with auto-trade: ${autoTrade ? 'ENABLED' : 'DISABLED'}`);
    
    agentProcess = spawn('bun', [
      agentScript,
      ...(autoTrade ? ['--auto-trade'] : []),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
      },
    });

    agentsStarted = true;

    // Log agent output
    agentProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter((line: string) => line.trim());
      lines.forEach((line: string) => {
        if (line.includes('✅') || line.includes('❌') || line.includes('Starting')) {
          console.log(`   ${line}`);
        }
      });
    });

    agentProcess.stderr?.on('data', (data) => {
      const errorLines = data.toString().split('\n').filter((line: string) => line.trim());
      errorLines.forEach((line: string) => {
        if (line.includes('Error') || line.includes('error')) {
          console.error(`   ⚠️  ${line}`);
        }
      });
    });

    agentProcess.on('exit', (code) => {
      agentsStarted = false;
      agentProcess = null;
      if (code !== 0 && code !== null) {
        console.error(`   ⚠️  Agent spawn process exited with code ${code}`);
      }
    });

    // Wait a bit to see if agents start successfully
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('   ✅ Agent spawn process started');
  } catch (error) {
    agentsStarted = false;
    agentProcess = null;
    console.error('   ⚠️  Failed to start agents:', error);
    console.error('   Agents can be started manually with: bun run eliza:all');
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


