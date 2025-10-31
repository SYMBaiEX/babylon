#!/usr/bin/env node

/**
 * Run Eliza Agent - ElizaOS Latest
 *
 * Starts an Eliza agent that interacts with Babylon prediction markets as a real player
 * Following latest ElizaOS best practices and architecture patterns
 */

import {
  logger,
  type Character,
  type IAgentRuntime,
  AgentRuntime,
  stringToUuid,
} from '@elizaos/core';
import { predictionMarketsPlugin } from '../../../plugin-babylon/src';
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
 * This follows latest ElizaOS Service pattern
 *
 * Configuration is passed via character.settings, which BabylonClientService reads
 * during its start() method when the plugin loads
 */
async function initCharacter({ runtime, options }: { runtime: IAgentRuntime; options: CLIOptions }) {
  logger.info('Initializing Babylon trading character');
  logger.info({ name: runtime.character.name }, 'Character:');

  // Note: BabylonClientService.start() automatically reads from character.settings
  // The service was already initialized when plugins loaded during runtime creation

  logger.info('✅ Babylon services initialized via plugin');

  // Enable auto-trading if requested
  if (options.autoTrade) {
    logger.info('📊 Auto-trading enabled via CLI flag');
    const tradingService = runtime.getService('babylon_trading');
    if (tradingService && 'enableAutoTrading' in tradingService) {
      (tradingService as any).enableAutoTrading();
    }
  }
}

async function main() {
  const options = parseArgs();

  console.log('🤖 Starting Eliza Agent for Babylon Game\n');

  // Validate required environment variables
  // API keys are read automatically by ElizaOS from environment
  const hasModelProvider = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!hasModelProvider) {
    console.warn('⚠️  No model provider API key found in environment');
    console.warn('   Set OPENAI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY');
    console.warn('   Agent may not be able to generate responses\n');
  }

  // Load character
  console.log('📖 Loading character...');
  let character = await loadCharacter(options.character);
  console.log(`✅ Loaded character: ${character.name}\n`);

  // Initialize database configuration
  console.log('💾 Configuring database...');

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

  // Add Babylon configuration and database settings to character
  // Latest ElizaOS pattern: plugins (including SQL plugin) are configured in character
  console.log('⚙️  Configuring character with plugins and settings...');

  // Build settings object with only defined optional values
  const characterSettings: Record<string, string | number | boolean | Record<string, any>> = {
    ...(character.settings || {}),
    // Babylon plugin configuration
    babylonApiUrl: options.apiUrl || 'http://localhost:3000',
    babylonMaxTradeSize: options.maxTradeSize || 100,
    babylonMaxPositionSize: 500,
    babylonMinConfidence: 0.6,
    autoTrading: options.autoTrade || false,
    // Database configuration for SQL plugin
    dataDir,
  };

  // Add optional settings only if they're defined
  if (options.authToken) {
    characterSettings.babylonAuthToken = options.authToken;
  }
  if (postgresUrl) {
    characterSettings.postgresUrl = postgresUrl;
  }

  character = {
    ...character,
    settings: characterSettings,
    plugins: [
      '@elizaos/plugin-bootstrap',  // Bootstrap plugin for core ElizaOS functionality
      '@elizaos/plugin-sql',        // SQL plugin provides database adapter
      ...(Array.isArray(character.plugins) ? character.plugins : []),
    ],
  };
  console.log('✅ Character configured with plugins and settings\n');

  // Generate agent ID from character name for stability across restarts
  // Falls back to random UUID if no character name
  const agentId = stringToUuid(character.name || crypto.randomUUID());

  // Create agent runtime
  // Latest ElizaOS: AgentRuntime automatically reads API keys from environment variables
  // API keys should be set: OPENAI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY
  // Plugin objects (not strings) are passed to AgentRuntime constructor
  console.log('⚙️  Creating agent runtime...');
  const runtime = new AgentRuntime({
    character,
    agentId,
    plugins: [predictionMarketsPlugin],  // Pass Plugin objects here, not strings
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

// Export main function for programmatic use
export { main };

// Run main function when executed directly
// This works for both Bun and Node runtimes
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
