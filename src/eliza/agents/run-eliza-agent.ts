#!/usr/bin/env node

/**
 * Run Eliza Agent - ElizaOS 1.6.3
 *
 * Starts an Eliza agent that interacts with Babylon prediction markets as a real player
 * Following ElizaOS 1.6.3 best practices and architecture patterns
 */

import {
  logger,
  type Character,
  type IAgentRuntime,
} from '@elizaos/core';
import { predictionMarketsPlugin, createBabylonClient } from '../../../plugin-babylon/src';
import type { AgentConfig } from '../../../plugin-babylon/src/types';
import { createDatabaseAdapter } from '@elizaos/plugin-sql';
// @ts-ignore - @elizaos/plugin-bootstrap doesn't have TypeScript declarations yet
import bootstrapPlugin from '@elizaos/plugin-bootstrap';
import * as fs from 'fs';
import * as path from 'path';

interface CLIOptions {
  character?: string;
  apiUrl?: string;
  authToken?: string;
  maxTradeSize?: number;
  autoTrade?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    apiUrl: 'http://localhost:3000',
    maxTradeSize: 100,
    autoTrade: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--character':
      case '-c':
        options.character = args[++i];
        break;
      case '--api-url':
      case '-u':
        options.apiUrl = args[++i];
        break;
      case '--auth-token':
      case '-t':
        options.authToken = args[++i];
        break;
      case '--max-trade':
      case '-m':
        options.maxTradeSize = parseInt(args[++i] || '100');
        break;
      case '--auto-trade':
      case '-a':
        options.autoTrade = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
🤖 Eliza Agent Runner for Babylon Game

Usage: bun run src/eliza/agents/run-eliza-agent-v2.ts [options]

Options:
  -c, --character <path>     Path to character JSON file (default: alice-trader.json)
  -u, --api-url <url>        Babylon API base URL (default: http://localhost:3000)
  -t, --auth-token <token>   Optional: Manual authentication token (overrides auto-auth)
  -m, --max-trade <amount>   Maximum trade size in USD (default: 100)
  -a, --auto-trade           Enable automatic trading based on analysis
  -h, --help                 Show this help message

Authentication:
  Agents authenticate automatically using BABYLON_AGENT_ID and BABYLON_AGENT_SECRET
  from environment variables. No manual Privy tokens required.

  Set in .env file:
    BABYLON_AGENT_ID=babylon-agent-alice
    BABYLON_AGENT_SECRET=<generate with: openssl rand -hex 32>

Database Configuration:
  PostgreSQL (Production - Recommended):
    POSTGRES_URL=postgresql://user:password@localhost:5432/babylon

  PGlite (Development - Embedded Database):
    If POSTGRES_URL is not set, PGlite will be used automatically
    Optional: PGLITE_DATA_DIR=./data/pglite (default)

Examples:
  # Run Alice with automatic authentication (requires .env configuration)
  bun run src/eliza/agents/run-eliza-agent-v2.ts

  # Run with auto-trading enabled
  bun run src/eliza/agents/run-eliza-agent-v2.ts --auto-trade --max-trade 50

  # Run custom character
  bun run src/eliza/agents/run-eliza-agent-v2.ts --character ./src/eliza/characters/bob-analyst.json
  `);
}

async function loadCharacter(characterPath?: string): Promise<Character> {
  if (!characterPath) {
    // Default to Alice trader
    characterPath = path.join(__dirname, '../characters/alice-trader.json');
  }

  try {
    const characterData = fs.readFileSync(characterPath, 'utf-8');
    const character = JSON.parse(characterData);

    // Validate required fields
    if (!character.name) {
      throw new Error('Character missing required field: name');
    }

    return character;
  } catch (error) {
    console.error(`Error loading character from ${characterPath}:`, error);
    throw error;
  }
}

/**
 * Initialize character with Babylon plugin
 * This follows ElizaOS 1.6.3 ProjectAgent pattern
 */
async function initCharacter({ runtime, options }: { runtime: IAgentRuntime; options: CLIOptions }) {
  logger.info('Initializing Babylon trading character');
  logger.info({ name: runtime.character.name }, 'Character:');

  // Configure Babylon plugin
  const babylonConfig: AgentConfig = {
    characterId: runtime.character.name || 'agent',
    apiBaseUrl: options.apiUrl || 'http://localhost:3000',
    authToken: options.authToken,
    tradingLimits: {
      maxTradeSize: options.maxTradeSize || 100,
      maxPositionSize: 500,
      minConfidence: 0.6,
    },
  };

  // Create and register Babylon client
  const babylonClient = createBabylonClient(babylonConfig);

  // Register client in runtime (if runtime supports it)
  if (runtime && typeof runtime === 'object') {
    (runtime as any).clients = (runtime as any).clients || {};
    (runtime as any).clients.babylonClient = babylonClient;
  }

  logger.info('✅ Babylon client initialized');

  // Enable auto-trading if requested
  if (options.autoTrade) {
    logger.info('📊 Auto-trading enabled via CLI flag');
    const tradingService = runtime.getService('babylon_trading' as any);
    if (tradingService && 'enableAutoTrading' in tradingService) {
      (tradingService as any).enableAutoTrading(runtime);
    }
  }
}

async function main() {
  const options = parseArgs();

  console.log('🤖 Starting Eliza Agent for Babylon Game\n');

  // Validate required environment variables
  const token = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!token) {
    throw new Error('Model provider API key required (OPENAI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY)');
  }

  // Load character
  console.log('📖 Loading character...');
  let character = await loadCharacter(options.character);
  console.log(`✅ Loaded character: ${character.name}\n`);

  // Add required plugins to character
  console.log('🔌 Adding plugins to character...');
  character = {
    ...character,
    plugins: [
      bootstrapPlugin,
      predictionMarketsPlugin,
      ...(Array.isArray(character.plugins) ? character.plugins : []),
    ] as any,
  };

  // Initialize database
  console.log('💾 Initializing database...');

  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const dataDir = process.env.PGLITE_DATA_DIR || path.join(__dirname, '../../../data/pglite');

  // Ensure data directory exists if using PGlite
  if (!postgresUrl && !fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!postgresUrl) {
    console.warn('⚠️  POSTGRES_URL not set, using PGlite embedded database for development');
    console.warn('   For production, set POSTGRES_URL=postgresql://user:password@host:5432/database\n');
  } else {
    console.log('📊 Using PostgreSQL database\n');
  }

  // Generate agent ID
  const agentId = crypto.randomUUID();

  // Create database adapter
  const databaseAdapter = createDatabaseAdapter(
    {
      postgresUrl,
      dataDir,
    },
    agentId
  );

  await databaseAdapter.init();
  console.log(`✅ Database initialized${postgresUrl ? ' (PostgreSQL)' : ' (PGlite - development mode)'}\n`);

  // Import AgentRuntime dynamically to avoid circular dependencies
  const { AgentRuntime } = await import('@elizaos/core');

  // Create agent runtime
  console.log('⚙️  Creating agent runtime...');
  const runtime = new AgentRuntime({
    character,
    databaseAdapter,
    token,
    agentId,
  });

  // Initialize character with Babylon-specific setup
  await initCharacter({ runtime, options });

  console.log('✅ Agent runtime created\n');

  // Initialize runtime (starts all services including BabylonTradingService)
  console.log('🚀 Initializing agent runtime...');
  await runtime.initialize();
  console.log('✅ Runtime initialized\n');

  // Start agent
  console.log('🚀 Agent ready!\n');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Agent: ${character.name}`);
  console.log(`  Personality: ${character.bio?.[0] || 'No bio available'}`);
  console.log(`  API: ${options.apiUrl}`);
  console.log(`  Max Trade: $${options.maxTradeSize}`);
  console.log(`  Auto-Trade: ${options.autoTrade ? 'Enabled' : 'Disabled'}`);
  console.log(`  Providers: Market Data, Wallet Status, Positions (active)`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (!options.authToken) {
    if (process.env.BABYLON_AGENT_SECRET) {
      console.log('🔐 Agent authentication: Using BABYLON_AGENT_SECRET from environment');
      console.log('   Agent will authenticate automatically without Privy tokens\n');
    } else {
      console.warn('⚠️  No authentication configured. Agent will not be able to trade.');
      console.warn('   Option 1: Set BABYLON_AGENT_SECRET in .env (recommended)');
      console.warn('   Option 2: Provide token with: --auth-token <your-privy-token>\n');
    }
  } else {
    console.log('🔐 Agent authentication: Using provided auth token\n');
  }

  console.log('💬 Agent active and monitoring');
  console.log('   - Providers inject real-time market/wallet/position data');
  console.log('   - Evaluators analyze markets and portfolio');
  console.log('   - Actions execute trades when triggered');
  if (options.autoTrade) {
    console.log('   - Service monitors markets every 60s, reviews portfolio every 5m\n');
  } else {
    console.log('   - Interactive mode: Send messages to trigger analysis and trading\n');
  }

  // Keep process alive
  await new Promise(() => {});
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down agent...');
  process.exit(0);
});

// Run if called directly
const isMainModule =
  // Bun runtime
  // @ts-ignore - Bun-specific import.meta.main
  (typeof import.meta.main !== 'undefined' && import.meta.main) ||
  // Node/tsx runtime
  (import.meta.url === `file://${process.argv[1]}`);

if (isMainModule) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { main };
