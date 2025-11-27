#!/usr/bin/env bun

/**
 * @fileoverview Babylon CLI
 *
 * Unified command-line interface for Babylon operations.
 *
 * Usage:
 *   babylon <domain> <command> [options]
 *
 * Domains:
 *   db      - Database management
 *   admin   - Admin user management
 *   status  - System status
 *   train   - Training operations
 *   model   - Model management
 *   game    - Game generation and simulation
 *   agent   - Agent management
 *
 * Examples:
 *   babylon db start
 *   babylon admin grant alice
 *   babylon status game
 *   babylon train archetype --archetype scammer
 *   babylon model upload --model v1 --hf-name babylonlabs/agent
 *   babylon game generate --verbose
 *   babylon agent spawn --count 5
 */

// Load environment variables from project root before any other imports
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local') });

import { runDbCommand } from './commands/db.js';
import { runAdminCommand } from './commands/admin.js';
import { runStatusCommand } from './commands/status.js';
import { runTrainCommand } from './commands/train.js';
import { runModelCommand } from './commands/model.js';
import { runGameCommand } from './commands/game.js';
import { runAgentCommand } from './commands/agent.js';

const VERSION = '0.2.0';

function printHelp(): void {
  console.log(`
Babylon CLI v${VERSION}

USAGE:
  babylon <domain> <command> [options]

DOMAINS:
  db        Database management (start, stop, status, migrate, reset)
  admin     Admin user management (check, grant, revoke, list)
  status    System status (game, wallet, agent0, all)
  train     Training operations (list, pipeline, archetype, collect)
  model     Model management (list, upload)
  game      Game control (start, pause, status, generate, simulate)
  agent     Agent management (spawn, list, enable, disable)

EXAMPLES:
  babylon db start                 Start PostgreSQL container
  babylon db migrate               Run database migrations
  babylon admin grant alice        Grant admin to user 'alice'
  babylon status                   Show all system status
  babylon game start               Start the continuous game
  babylon game status              Check game runtime status
  babylon train list               List available archetypes
  babylon train pipeline -a trader Train trader archetype
  babylon agent spawn --count 5    Spawn 5 test agents

OPTIONS:
  -h, --help      Show help for any command
  -v, --version   Show version number

Run 'babylon <domain> --help' for domain-specific help.
`);
}

function printVersion(): void {
  console.log(`babylon v${VERSION}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const domain = args[0];
  const commandArgs = args.slice(1);

  // Handle global flags
  if (!domain || domain === '-h' || domain === '--help') {
    printHelp();
    process.exit(0);
  }

  if (domain === '-v' || domain === '--version') {
    printVersion();
    process.exit(0);
  }

  // Route to domain handler
  try {
    switch (domain) {
      case 'db':
        await runDbCommand(commandArgs);
        break;

      case 'admin':
        await runAdminCommand(commandArgs);
        break;

      case 'status':
        await runStatusCommand(commandArgs);
        break;

      case 'train':
        await runTrainCommand(commandArgs);
        break;

      case 'model':
        await runModelCommand(commandArgs);
        break;

      case 'game':
        await runGameCommand(commandArgs);
        break;

      case 'agent':
        await runAgentCommand(commandArgs);
        break;

      default:
        console.error(`Unknown domain: ${domain}`);
        console.log("\nRun 'babylon --help' for usage information.");
        process.exit(1);
    }
    // Ensure clean exit after successful command
    process.exit(0);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ Error: ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    } else {
      console.error('\n❌ An unexpected error occurred');
    }
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main();
}

export { main };

