#!/usr/bin/env bun

/**
 * Run Eliza Agent
 *
 * Starts an Eliza agent that interacts with Babylon prediction markets as a real player
 */

import { AgentRuntime, Character, ModelProviderName, defaultCharacter, type ICacheManager, type UUID } from '@ai16z/eliza';
import { predictionMarketsPlugin, createBabylonClient } from '../../../plugin-babylon/src';
import type { AgentConfig } from '../../../plugin-babylon/src/types';
import { SqliteDatabaseAdapter } from '@elizaos/adapter-sqlite';
import * as fs from 'fs';
import * as path from 'path';

// Use require for better-sqlite3 due to CommonJS/ESM interop issues
const Database = require('better-sqlite3');

/**
 * Cache manager that uses the database adapter's cache functionality
 * Bridges the ICacheManager interface with the IDatabaseCacheAdapter implementation
 */
class DatabaseCacheManager implements ICacheManager {
  constructor(
    private adapter: SqliteDatabaseAdapter,
    private agentId: UUID
  ) {}

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const value = await this.adapter.getCache({ key, agentId: this.agentId });
    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await this.adapter.setCache({ key, agentId: this.agentId, value: stringValue });
  }

  async delete(key: string): Promise<void> {
    await this.adapter.deleteCache({ key, agentId: this.agentId });
  }
}


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

Usage: bun run src/eliza/agents/run-eliza-agent.ts [options]

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

Examples:
  # Run Alice with automatic authentication (requires .env configuration)
  bun run src/eliza/agents/run-eliza-agent.ts

  # Run with auto-trading enabled
  bun run src/eliza/agents/run-eliza-agent.ts --auto-trade --max-trade 50

  # Run custom character
  bun run src/eliza/agents/run-eliza-agent.ts --character ./src/eliza/characters/bob-analyst.json
  `);
}

async function loadCharacter(characterPath?: string): Promise<Character> {
  if (!characterPath) {
    // Default to Alice trader - path from src/eliza/agents/ to src/eliza/characters/
    characterPath = path.join(__dirname, '../characters/alice-trader.json');
  }

  try {
    const characterData = fs.readFileSync(characterPath, 'utf-8');
    const character = JSON.parse(characterData);

    // Validate required fields
    if (!character.name) {
      throw new Error('Character missing required field: name');
    }

    return {
      ...defaultCharacter,
      ...character,
      modelProvider: ModelProviderName.OPENAI,
    };
  } catch (error) {
    console.error(`Error loading character from ${characterPath}:`, error);
    throw error;
  }
}

async function main() {
  const options = parseArgs();

  console.log('🤖 Starting Eliza Agent for Babylon Game\n');

  // Load character
  console.log('📖 Loading character...');
  const character = await loadCharacter(options.character);
  console.log(`✅ Loaded character: ${character.name}\n`);

  // Configure Babylon plugin (will be created by service on initialization)
  const babylonConfig: AgentConfig = {
    characterId: character.name || 'agent',
    apiBaseUrl: options.apiUrl || 'http://localhost:3000',
    authToken: options.authToken,
    tradingLimits: {
      maxTradeSize: options.maxTradeSize || 100,
      maxPositionSize: 500,
      minConfidence: 0.6,
    },
  };

  // Store config for service initialization
  console.log('📝 Babylon configuration prepared\n');

  // Validate required environment variables
  const token = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
  if (!token) {
    throw new Error('OPENAI_API_KEY or GROQ_API_KEY environment variable is required');
  }

  // Initialize SQLite database
  console.log('💾 Initializing SQLite database...');
  const dbPath = process.env.SQLITE_FILE || path.join(__dirname, '../../../data/babylon-agents.db');

  // Ensure data directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  const databaseAdapter = new SqliteDatabaseAdapter(db);
  await databaseAdapter.init();
  console.log(`✅ Database initialized at ${dbPath}\n`);

  // Generate agent ID from character name
  const agentId = crypto.randomUUID() as UUID;

  // Create cache manager using database adapter
  const cacheManager = new DatabaseCacheManager(databaseAdapter, agentId);

  // Create agent runtime
  console.log('⚙️  Creating agent runtime...');
  const runtime = new AgentRuntime({
    character,
    databaseAdapter,
    cacheManager,
    token,
    serverUrl: undefined,
    modelProvider: character.modelProvider,
    plugins: [predictionMarketsPlugin],
    agentId,
  });

  // Register Babylon client in runtime.clients (used by plugin providers and services)
  console.log('🔌 Creating Babylon API client...');
  const babylonClient = createBabylonClient(babylonConfig);
  runtime.clients.babylonClient = babylonClient;
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
  console.log(`  API: ${babylonConfig.apiBaseUrl}`);
  console.log(`  Max Trade: $${babylonConfig.tradingLimits.maxTradeSize}`);
  console.log(`  Auto-Trade: ${(character.settings as any)?.autoTrading ? 'Enabled' : 'Disabled'}`);
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

  // BabylonTradingService will automatically start if autoTrading is enabled in character settings
  // Override with CLI flag if provided
  if (options.autoTrade && !(character.settings as any)?.autoTrading) {
    console.log('📊 Enabling auto-trading via CLI flag...\n');
    const tradingService = runtime.getService('babylon_trading' as any);
    if (tradingService && 'enableAutoTrading' in tradingService) {
      (tradingService as any).enableAutoTrading(runtime);
    }
  }

  console.log('💬 Agent active and monitoring');
  console.log('   - Providers inject real-time market/wallet/position data');
  console.log('   - Evaluators analyze markets and portfolio');
  console.log('   - Actions execute trades when triggered');
  if ((character.settings as any)?.autoTrading || options.autoTrade) {
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

// Run if called directly (Bun runtime)
// @ts-ignore - Bun-specific import.meta.main
if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { main };
