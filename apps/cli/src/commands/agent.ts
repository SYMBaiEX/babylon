#!/usr/bin/env bun

/**
 * Agent Management Commands
 *
 * Commands:
 *   spawn   - Create test agents
 *   list    - List agents
 *   enable  - Enable autonomous features for an agent
 *   disable - Disable autonomous features for an agent
 */

import { db, closeDatabase } from '@babylon/db';
import { createTestAgent } from '@babylon/agents';
import { parseArgs, wantsHelp, getOption, getFlag } from '../lib/args.js';
import { logger } from '../lib/logger.js';

function printHelp(): void {
  console.log(`
Agent Management

USAGE:
  babylon agent <command> [options]

COMMANDS:
  spawn     Create test agents for simulation/training
  list      List agents in the system
  enable    Enable autonomous features for an agent
  disable   Disable autonomous features for an agent

OPTIONS (spawn):
  -c, --count=N          Number of agents to create (default: 5)
  -p, --prefix=NAME      Prefix for agent usernames (default: test-agent)
  --trading              Enable autonomous trading
  --posting              Enable autonomous posting
  --all                  Enable all autonomous features

OPTIONS (list):
  --active               Only show agents with active features
  --limit=N              Limit results (default: 20)

OPTIONS (enable/disable):
  --id=ID                Agent ID (required)
  --trading              Toggle trading
  --posting              Toggle posting
  --commenting           Toggle commenting
  --dms                  Toggle DMs
  --groups               Toggle group chats
  --all                  Toggle all features

EXAMPLES:
  babylon agent spawn --count=10 --trading --posting
  babylon agent spawn -c 5 -p scammer --all
  babylon agent list --active
  babylon agent enable --id=abc123 --trading
  babylon agent disable --id=abc123 --all
`);
}

async function spawnAgents(args: ReturnType<typeof parseArgs>): Promise<void> {
  const count = parseInt(getOption(args, 'count', 'c') || '5', 10);
  const prefix = getOption(args, 'prefix', 'p') || 'test-agent';
  const enableTrading = getFlag(args, 'trading');
  const enablePosting = getFlag(args, 'posting');
  const enableAll = getFlag(args, 'all');

  logger.header('Spawn Test Agents');

  console.log(`Creating ${count} agents with prefix "${prefix}"...`);

  const createdAgents: Array<{ username: string; id: string }> = [];

  for (let i = 0; i < count; i++) {
    try {
      const result = await createTestAgent(`${prefix}-${i}`, {
        autonomousTrading: enableTrading || enableAll,
        autonomousPosting: enablePosting || enableAll,
        autonomousCommenting: enableAll,
        autonomousDMs: enableAll,
        autonomousGroupChats: enableAll,
      });

      createdAgents.push({
        username: result.agent.username,
        id: result.agent.id,
      });
      console.log(`  ✅ Created: ${result.agent.username} (${result.agent.id})`);
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  logger.header('Summary');
  console.log(`Created: ${createdAgents.length}/${count} agents`);

  if (createdAgents.length > 0) {
    console.log('\nAgents created:');
    for (const agent of createdAgents) {
      console.log(`  - ${agent.username} (${agent.id})`);
    }
  }
}

async function listAgents(args: ReturnType<typeof parseArgs>): Promise<void> {
  const activeOnly = getFlag(args, 'active');
  const limit = parseInt(getOption(args, 'limit') || '20', 10);

  logger.header('Agents');

  interface AgentWhereClause {
    isAgent: boolean;
    OR?: Array<Record<string, boolean>>;
  }

  const whereClause: AgentWhereClause = { isAgent: true };

  if (activeOnly) {
    whereClause.OR = [
      { autonomousTrading: true },
      { autonomousPosting: true },
      { autonomousCommenting: true },
      { autonomousDMs: true },
      { autonomousGroupChats: true },
    ];
  }

  const agents = await db.user.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      username: true,
      displayName: true,
      agentPointsBalance: true,
      autonomousTrading: true,
      autonomousPosting: true,
      autonomousCommenting: true,
      autonomousDMs: true,
      autonomousGroupChats: true,
      createdAt: true,
    },
  });

  if (agents.length === 0) {
    console.log('No agents found.');
    console.log('\nCreate agents with: babylon agent spawn');
    return;
  }

  console.log(`Found ${agents.length} agent(s):\n`);

  for (const agent of agents) {
    const features = [];
    if (agent.autonomousTrading) features.push('trading');
    if (agent.autonomousPosting) features.push('posting');
    if (agent.autonomousCommenting) features.push('commenting');
    if (agent.autonomousDMs) features.push('dms');
    if (agent.autonomousGroupChats) features.push('groups');

    console.log(`${'─'.repeat(60)}`);
    console.log(`Username:   ${agent.username || 'N/A'}`);
    console.log(`ID:         ${agent.id}`);
    console.log(`Points:     ${agent.agentPointsBalance || 0}`);
    console.log(`Features:   ${features.length > 0 ? features.join(', ') : 'none'}`);
    console.log(`Created:    ${agent.createdAt.toISOString()}`);
  }
  console.log(`${'─'.repeat(60)}`);
}

async function toggleAgentFeatures(
  args: ReturnType<typeof parseArgs>,
  enable: boolean
): Promise<void> {
  const agentId = getOption(args, 'id');

  if (!agentId) {
    logger.fail('--id is required');
    printHelp();
    process.exit(1);
  }

  const agent = await db.user.findUnique({
    where: { id: agentId },
  });

  if (!agent) {
    logger.fail(`Agent not found: ${agentId}`);
    process.exit(1);
  }

  if (!agent.isAgent) {
    logger.fail('User is not an agent');
    process.exit(1);
  }

  const updates: Record<string, boolean> = {};

  if (getFlag(args, 'trading')) updates.autonomousTrading = enable;
  if (getFlag(args, 'posting')) updates.autonomousPosting = enable;
  if (getFlag(args, 'commenting')) updates.autonomousCommenting = enable;
  if (getFlag(args, 'dms')) updates.autonomousDMs = enable;
  if (getFlag(args, 'groups')) updates.autonomousGroupChats = enable;

  if (getFlag(args, 'all')) {
    updates.autonomousTrading = enable;
    updates.autonomousPosting = enable;
    updates.autonomousCommenting = enable;
    updates.autonomousDMs = enable;
    updates.autonomousGroupChats = enable;
  }

  if (Object.keys(updates).length === 0) {
    logger.fail('No features specified');
    console.log('\nSpecify features to toggle:');
    console.log('  --trading, --posting, --commenting, --dms, --groups, --all');
    process.exit(1);
  }

  await db.user.update({
    where: { id: agentId },
    data: updates,
  });

  const action = enable ? 'Enabled' : 'Disabled';
  logger.success(`${action} features for ${agent.username || agentId}`);

  console.log('\nUpdated features:');
  for (const [key, value] of Object.entries(updates)) {
    const featureName = key.replace('autonomous', '').toLowerCase();
    console.log(`  ${featureName}: ${value ? '✅' : '❌'}`);
  }
}

export async function runAgentCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (wantsHelp(parsed)) {
    printHelp();
    return;
  }

  try {
    switch (parsed.command) {
      case 'spawn':
        await spawnAgents(parsed);
        break;

      case 'list':
        await listAgents(parsed);
        break;

      case 'enable':
        await toggleAgentFeatures(parsed, true);
        break;

      case 'disable':
        await toggleAgentFeatures(parsed, false);
        break;

      default:
        if (parsed.command) {
          logger.fail(`Unknown command: ${parsed.command}`);
        }
        printHelp();
        process.exit(parsed.command ? 1 : 0);
    }
  } finally {
    await closeDatabase();
  }
}
