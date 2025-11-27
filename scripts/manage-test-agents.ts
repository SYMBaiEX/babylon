#!/usr/bin/env bun
/**
 * Test Agent Management
 *
 * Script to manage test agents:
 * - Verify status and health
 * - Top up points
 * - Resume paused agents
 * - Run agents manually
 *
 * Usage:
 *   bun run scripts/manage-test-agents.ts status     # Show agent status
 *   bun run scripts/manage-test-agents.ts topup      # Top up agent points
 *   bun run scripts/manage-test-agents.ts run        # Run all test agents once
 *   bun run scripts/manage-test-agents.ts resume     # Resume paused agents
 */

import { db, eq, sql, users } from '@/db';
import { autonomousCoordinator } from '@/lib/agents/autonomous';
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager';
import { logger } from '@/lib/logger';

async function showStatus(): Promise<void> {
  console.log('\n🔍 Test Agent Status\n');
  console.log('═'.repeat(60));

  const agents = await db.user.findMany({
    where: {
      isTest: true,
      isAgent: true,
    },
    select: {
      id: true,
      displayName: true,
      username: true,
      agentStatus: true,
      agentPointsBalance: true,
      agentLastTickAt: true,
      virtualBalance: true,
      autonomousTrading: true,
      autonomousPosting: true,
      autonomousCommenting: true,
      autonomousDMs: true,
      autonomousGroupChats: true,
    },
    orderBy: {
      displayName: 'asc',
    },
  });

  console.log(`Found ${agents.length} test agents\n`);

  let running = 0;
  let paused = 0;
  let lowBalance = 0;
  let totalActions = 0;

  for (const agent of agents) {
    const [postCount, commentCount, tradeCount, messageCount] =
      await Promise.all([
        db.post.count({ where: { authorId: agent.id } }),
        db.comment.count({ where: { authorId: agent.id } }),
        db.agentTrade.count({ where: { agentUserId: agent.id } }),
        db.message.count({ where: { senderId: agent.id } }),
      ]);

    const actions = postCount + commentCount + tradeCount + messageCount;
    totalActions += actions;

    const statusIcon =
      agent.agentStatus === 'running'
        ? '▶️ '
        : agent.agentStatus === 'paused'
          ? '⏸️ '
          : '⏹️ ';
    const pointsIcon = agent.agentPointsBalance < 10 ? '⚠️ ' : '✓';

    let tickStatus = 'Never ran';
    if (agent.agentLastTickAt) {
      const msSinceLastTick =
        Date.now() - new Date(agent.agentLastTickAt).getTime();
      const minutesSince = Math.floor(msSinceLastTick / 60000);
      tickStatus =
        minutesSince === 0
          ? 'Just now'
          : minutesSince < 60
            ? `${minutesSince}m ago`
            : `${Math.floor(minutesSince / 60)}h ago`;
    }

    const features = [];
    if (agent.autonomousTrading) features.push('Trading');
    if (agent.autonomousPosting) features.push('Posting');
    if (agent.autonomousCommenting) features.push('Commenting');
    if (agent.autonomousDMs) features.push('DMs');
    if (agent.autonomousGroupChats) features.push('Groups');

    console.log(
      `${statusIcon}${pointsIcon} ${agent.displayName} (@${agent.username})`
    );
    console.log(
      `   Status: ${agent.agentStatus} | Points: ${agent.agentPointsBalance} | Balance: $${agent.virtualBalance}`
    );
    console.log(`   Last Tick: ${tickStatus}`);
    console.log(`   Features: ${features.join(', ')}`);
    console.log(
      `   Actions: ${postCount} posts, ${commentCount} comments, ${tradeCount} trades, ${messageCount} messages\n`
    );

    if (agent.agentStatus === 'running') running++;
    if (agent.agentStatus === 'paused') paused++;
    if (agent.agentPointsBalance < 10) lowBalance++;
  }

  console.log('━'.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   Total Agents: ${agents.length}`);
  console.log(`   Running: ${running}`);
  console.log(`   Paused: ${paused}`);
  console.log(`   Low Balance: ${lowBalance}`);
  console.log(`   Total Actions: ${totalActions}\n`);
}

async function topUpAgents(): Promise<void> {
  console.log('\n💰 Topping Up Test Agents\n');
  console.log('═'.repeat(60));

  const testAgents = await db.user.findMany({
    where: {
      isTest: true,
      isAgent: true,
    },
    select: {
      id: true,
      displayName: true,
      agentPointsBalance: true,
      agentStatus: true,
    },
  });

  let toppedUp = 0;
  let resumed = 0;

  for (const agent of testAgents) {
    const actions = [];

    if (agent.agentPointsBalance < 50) {
      // Use Drizzle SQL for atomic increment
      await db
        .update(users)
        .set({ agentPointsBalance: sql`${users.agentPointsBalance} + 500` })
        .where(eq(users.id, agent.id));
      actions.push(`+500 points (was ${agent.agentPointsBalance})`);
      toppedUp++;
    }

    if (agent.agentStatus === 'paused') {
      await db.user.update({
        where: { id: agent.id },
        data: { agentStatus: 'running' },
      });
      actions.push('resumed');
      resumed++;
    }

    if (actions.length > 0) {
      console.log(`✅ ${agent.displayName}: ${actions.join(', ')}`);
    } else {
      console.log(
        `✓ ${agent.displayName}: OK (${agent.agentPointsBalance} points)`
      );
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Topped up: ${toppedUp} agents`);
  console.log(`   Resumed: ${resumed} agents\n`);
}

async function resumeAgents(): Promise<void> {
  console.log('\n▶️  Resuming Paused Agents\n');
  console.log('═'.repeat(60));

  const result = await db.user.updateMany({
    where: {
      isTest: true,
      isAgent: true,
      agentStatus: 'paused',
    },
    data: {
      agentStatus: 'running',
    },
  });

  console.log(`✅ Resumed ${result.count} agents\n`);
}

async function runAgents(): Promise<void> {
  console.log('\n🤖 Running All Test Agents\n');
  console.log('═'.repeat(60));

  const testAgents = await db.user.findMany({
    where: {
      isAgent: true,
      username: { startsWith: 'test-' },
      isTest: true,
    },
  });

  if (testAgents.length === 0) {
    console.log(
      'No test agents found. Run: bun run scripts/seed-test-data.ts a2a\n'
    );
    return;
  }

  console.log(`Found ${testAgents.length} test agents\n`);

  for (const agent of testAgents) {
    const startTime = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${agent.displayName} (@${agent.username})`);
    console.log(`${'='.repeat(60)}`);

    try {
      const runtime = await agentRuntimeManager.getRuntime(agent.id);
      const result = await autonomousCoordinator.executeAutonomousTick(
        agent.id,
        runtime
      );

      const duration = Date.now() - startTime;

      console.log('\n📊 Results:');
      console.log(`  Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`  Method: ${result.method}`);
      console.log(`  Duration: ${duration}ms`);
      console.log('  Actions:');
      console.log(`    - Trades: ${result.actionsExecuted.trades}`);
      console.log(`    - Posts: ${result.actionsExecuted.posts}`);
      console.log(`    - Comments: ${result.actionsExecuted.comments}`);
      console.log(`    - Messages: ${result.actionsExecuted.messages}`);
      console.log(
        `    - Group Messages: ${result.actionsExecuted.groupMessages}`
      );
      console.log(`    - Engagements: ${result.actionsExecuted.engagements}`);
    } catch (error) {
      console.error(`\n❌ Error running ${agent.displayName}:`, error);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Test run complete\n');
}

async function main(): Promise<void> {
  const command = process.argv[2] || 'status';

  switch (command) {
    case 'status':
      await showStatus();
      break;

    case 'topup':
      await topUpAgents();
      break;

    case 'run':
      await runAgents();
      break;

    case 'resume':
      await resumeAgents();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('\nUsage:');
      console.log(
        '  bun run scripts/manage-test-agents.ts status     # Show agent status'
      );
      console.log(
        '  bun run scripts/manage-test-agents.ts topup      # Top up agent points'
      );
      console.log(
        '  bun run scripts/manage-test-agents.ts run        # Run all test agents once'
      );
      console.log(
        '  bun run scripts/manage-test-agents.ts resume     # Resume paused agents'
      );
      process.exit(1);
  }

  await db.$disconnect();
}

if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Fatal error', { error }, 'SeedTestData');
      process.exit(1);
    });
}

export { showStatus, topUpAgents, runAgents, resumeAgents };
