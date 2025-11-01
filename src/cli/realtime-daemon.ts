#!/usr/bin/env bun

/**
 * Babylon Game Daemon
 * 
 * Continuously running game engine that generates content every minute.
 * - Runs at 1x speed
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

import { GameEngine } from '../engine/GameEngine';
import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';
import { logger } from '@/lib/logger';

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

  logger.info('BABYLON GAME DAEMON', undefined, 'CLI');
  logger.info('===================', undefined, 'CLI');

  // Validate API key
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    logger.error('ERROR: No API key found!', undefined, 'CLI');
    logger.error('Set GROQ_API_KEY or OPENAI_API_KEY environment variable.', undefined, 'CLI');
    process.exit(1);
  }

  if (groqKey) {
    logger.info('Using Groq (fast inference)', undefined, 'CLI');
  } else if (openaiKey) {
    logger.info('Using OpenAI', undefined, 'CLI');
  }

  // Create engine with A2A enabled
  const engine = new GameEngine({
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
      logger.info('Tick Summary:', {
        posts: tick.posts.length,
        priceUpdates: tick.priceUpdates.length,
        events: tick.events.length,
        questionsResolved: tick.questionsResolved,
        questionsCreated: tick.questionsCreated
      }, 'CLI');
    }
  });

  engine.on('error', (error) => {
    logger.error('Engine Error:', error, 'CLI');
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Final Stats:', undefined, 'CLI');
    const state = engine.getState();
    logger.info(`Total Actors: ${state.actors}`, undefined, 'CLI');
    logger.info(`Companies: ${state.companies}`, undefined, 'CLI');
    logger.info(`Active Questions: ${state.activeQuestions}`, undefined, 'CLI');
    logger.info(`Total Questions: ${state.totalQuestions}`, undefined, 'CLI');
    logger.info(`History Ticks: ${state.recentTicks}`, undefined, 'CLI');
    
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
      logger.info('Starting agents...', undefined, 'CLI');
      await startAgents();
    } else {
      logger.info('Agent auto-start disabled (set AUTO_START_AGENTS=false to disable)', undefined, 'CLI');
    }

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    logger.error('Fatal Error:', error, 'CLI');
    process.exit(1);
  }
}

// Track if agents have been started to prevent duplicate spawning
let agentsStarted = false;
let agentProcess: ChildProcess | null = null;

/**
 * Start all agents using the spawn script
 * Prevents duplicate spawning if called multiple times
 */
async function startAgents(): Promise<void> {
  // If agents already started, don't start again
  if (agentsStarted && agentProcess) {
    logger.info('Agents already started, skipping duplicate spawn', undefined, 'CLI');
    return;
  }

  try {
    const agentScript = join(process.cwd(), 'scripts', 'run-all-agents.ts');
    const autoTrade = process.env.AGENT_AUTO_TRADE === 'true';
    
    logger.info(`Spawning agents with auto-trade: ${autoTrade ? 'ENABLED' : 'DISABLED'}`, undefined, 'CLI');
    
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
          logger.info(line, undefined, 'CLI');
        }
      });
    });

    agentProcess.stderr?.on('data', (data) => {
      const errorLines = data.toString().split('\n').filter((line: string) => line.trim());
      errorLines.forEach((line: string) => {
        if (line.includes('Error') || line.includes('error')) {
          logger.warn(line, undefined, 'CLI');
        }
      });
    });

    agentProcess.on('exit', (code) => {
      agentsStarted = false;
      agentProcess = null;
      if (code !== 0 && code !== null) {
        logger.warn(`Agent spawn process exited with code ${code}`, undefined, 'CLI');
      }
    });

    // Wait a bit to see if agents start successfully
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    logger.info('Agent spawn process started', undefined, 'CLI');
  } catch (error) {
    agentsStarted = false;
    agentProcess = null;
    logger.error('Failed to start agents:', error, 'CLI');
    logger.error('Agents can be started manually with: bun run eliza:all', undefined, 'CLI');
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    logger.error('Error:', error.message, 'CLI');
    if (error.stack) {
      logger.error('Stack trace:', error.stack, 'CLI');
    }
    process.exit(1);
  });
}

export { main };


