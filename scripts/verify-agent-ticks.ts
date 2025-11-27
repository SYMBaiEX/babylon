/**
 * Agent Tick Verification Script
 *
 * Verifies that agents are actually running in production:
 * - Checks if agent-tick cron is configured in vercel.json
 * - Queries agents with autonomous features enabled
 * - Checks agentLastTickAt timestamps
 * - Queries agent logs for recent activity
 * - Reports active vs inactive agents
 * - Checks agent points balances
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '@babylon/db';
import { logger } from '@babylon/engine';

interface AgentStatus {
  id: string;
  displayName: string | null;
  username: string | null;
  agentLastTickAt: Date | null;
  agentPointsBalance: number;
  autonomousFeatures: string[];
  hasRecentLogs: boolean;
  lastLogTime: Date | null;
  status: 'active' | 'inactive' | 'no_points' | 'no_features';
}

async function checkCronConfig(): Promise<boolean> {
  try {
    const vercelJsonPath = join(process.cwd(), 'vercel.json');
    const vercelJson = JSON.parse(readFileSync(vercelJsonPath, 'utf-8'));

    const agentTickCron = vercelJson.crons?.find(
      (cron: { path: string }) => cron.path === '/api/cron/agent-tick'
    );

    if (agentTickCron) {
      logger.info(
        'Agent tick cron configured',
        { schedule: agentTickCron.schedule },
        'AgentTickVerification'
      );
      console.log(`✅ Agent tick cron configured: ${agentTickCron.schedule}`);
      return true;
    }
    logger.warn(
      'Agent tick cron NOT configured in vercel.json',
      undefined,
      'AgentTickVerification'
    );
    console.log('❌ Agent tick cron NOT configured in vercel.json');
    return false;
  } catch (error) {
    logger.error('Could not read vercel.json', error, 'AgentTickVerification');
    console.log(
      `⚠️  Could not read vercel.json: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

async function getAgentStatuses(): Promise<AgentStatus[]> {
  const agents = await db.user.findMany({
    where: {
      isAgent: true,
      OR: [
        { autonomousTrading: true },
        { autonomousPosting: true },
        { autonomousCommenting: true },
        { autonomousDMs: true },
        { autonomousGroupChats: true },
      ],
    },
    select: {
      id: true,
      displayName: true,
      username: true,
      agentLastTickAt: true,
      agentPointsBalance: true,
      autonomousTrading: true,
      autonomousPosting: true,
      autonomousCommenting: true,
      autonomousDMs: true,
      autonomousGroupChats: true,
    },
    orderBy: {
      agentLastTickAt: 'desc',
    },
  });

  const statuses: AgentStatus[] = [];

  for (const agent of agents) {
    const autonomousFeatures: string[] = [];
    if (agent.autonomousTrading) autonomousFeatures.push('trading');
    if (agent.autonomousPosting) autonomousFeatures.push('posting');
    if (agent.autonomousCommenting) autonomousFeatures.push('commenting');
    if (agent.autonomousDMs) autonomousFeatures.push('DMs');
    if (agent.autonomousGroupChats) autonomousFeatures.push('group chats');

    // Check for recent logs (last 24 hours)
    const recentLogs = await db.agentLog.findMany({
      where: {
        agentUserId: agent.id,
        type: 'tick',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 1,
    });

    const hasRecentLogs = recentLogs.length > 0;
    const lastLogTime = recentLogs[0]?.createdAt || null;

    // Determine status
    let status: AgentStatus['status'] = 'active';
    if (agent.agentPointsBalance < 1) {
      status = 'no_points';
    } else if (autonomousFeatures.length === 0) {
      status = 'no_features';
    } else if (!agent.agentLastTickAt) {
      status = 'inactive';
    } else {
      // Check if last tick was more than 10 minutes ago (cron runs every 5 minutes)
      const minutesSinceLastTick =
        (Date.now() - agent.agentLastTickAt.getTime()) / (1000 * 60);
      if (minutesSinceLastTick > 10) {
        status = 'inactive';
      }
    }

    statuses.push({
      id: agent.id,
      displayName: agent.displayName,
      username: agent.username,
      agentLastTickAt: agent.agentLastTickAt,
      agentPointsBalance: agent.agentPointsBalance,
      autonomousFeatures,
      hasRecentLogs,
      lastLogTime,
      status,
    });
  }

  return statuses;
}

function formatTimeAgo(date: Date | null): string {
  if (!date) return 'Never';

  const minutesAgo = (Date.now() - date.getTime()) / (1000 * 60);
  if (minutesAgo < 1) return 'Just now';
  if (minutesAgo < 60) return `${Math.floor(minutesAgo)} minutes ago`;

  const hoursAgo = minutesAgo / 60;
  if (hoursAgo < 24) return `${Math.floor(hoursAgo)} hours ago`;

  const daysAgo = hoursAgo / 24;
  return `${Math.floor(daysAgo)} days ago`;
}

function printAgentStatus(status: AgentStatus): void {
  const statusIcon = {
    active: '✅',
    inactive: '⚠️',
    no_points: '🔴',
    no_features: '⚪',
  }[status.status];

  console.log(
    `\n${statusIcon} ${status.displayName || status.username || status.id}`
  );
  console.log(`   Username: ${status.username || 'N/A'}`);
  console.log(`   Status: ${status.status.toUpperCase()}`);
  console.log(`   Features: ${status.autonomousFeatures.join(', ') || 'None'}`);
  console.log(`   Points: ${status.agentPointsBalance}`);
  console.log(`   Last Tick: ${formatTimeAgo(status.agentLastTickAt)}`);
  console.log(`   Recent Logs: ${status.hasRecentLogs ? 'Yes' : 'No'}`);
  if (status.lastLogTime) {
    console.log(`   Last Log: ${formatTimeAgo(status.lastLogTime)}`);
  }
}

async function main(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 AGENT TICK VERIFICATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check cron configuration
  console.log('1. Checking Cron Configuration');
  console.log('─────────────────────────────');
  const cronConfigured = await checkCronConfig();
  console.log('');

  // Get agent statuses
  console.log('2. Checking Agent Status');
  console.log('─────────────────────────────');
  const statuses = await getAgentStatuses();

  logger.info(
    'Agent status check complete',
    { agentCount: statuses.length },
    'AgentTickVerification'
  );

  if (statuses.length === 0) {
    logger.warn(
      'No agents found with autonomous features enabled',
      undefined,
      'AgentTickVerification'
    );
    console.log('⚠️  No agents found with autonomous features enabled');
    console.log('');
    console.log('   Agents need:');
    console.log('   - isAgent: true');
    console.log('   - agentPointsBalance >= 1');
    console.log('   - At least one autonomous feature enabled');
    console.log('');
    await db.$disconnect();
    process.exit(0);
  }

  console.log(`Found ${statuses.length} agents with autonomous features\n`);

  // Categorize agents
  const activeAgents = statuses.filter((s) => s.status === 'active');
  const inactiveAgents = statuses.filter((s) => s.status === 'inactive');
  const noPointsAgents = statuses.filter((s) => s.status === 'no_points');
  const noFeaturesAgents = statuses.filter((s) => s.status === 'no_features');

  // Log summary for structured logging
  logger.info(
    'Agent status summary',
    {
      total: statuses.length,
      active: activeAgents.length,
      inactive: inactiveAgents.length,
      noPoints: noPointsAgents.length,
      noFeatures: noFeaturesAgents.length,
    },
    'AgentTickVerification'
  );

  // Print summary
  console.log('3. Summary');
  console.log('─────────────────────────────');
  console.log(`Total Agents: ${statuses.length}`);
  console.log(`✅ Active: ${activeAgents.length}`);
  console.log(`⚠️  Inactive: ${inactiveAgents.length}`);
  console.log(`🔴 No Points: ${noPointsAgents.length}`);
  console.log(`⚪ No Features: ${noFeaturesAgents.length}`);
  console.log('');

  // Print detailed status
  console.log('4. Detailed Agent Status');
  console.log('─────────────────────────────');

  if (activeAgents.length > 0) {
    console.log('\n✅ ACTIVE AGENTS:');
    activeAgents.forEach(printAgentStatus);
  }

  if (inactiveAgents.length > 0) {
    console.log('\n⚠️  INACTIVE AGENTS (no recent ticks):');
    inactiveAgents.forEach(printAgentStatus);
  }

  if (noPointsAgents.length > 0) {
    console.log('\n🔴 AGENTS WITH NO POINTS:');
    noPointsAgents.forEach(printAgentStatus);
  }

  if (noFeaturesAgents.length > 0) {
    console.log('\n⚪ AGENTS WITH NO FEATURES:');
    noFeaturesAgents.forEach(printAgentStatus);
  }

  // Final assessment
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 ASSESSMENT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!cronConfigured) {
    logger.error(
      'CRITICAL: Agent tick cron is NOT configured',
      {
        impact: 'Agents will not run automatically in production',
      },
      'AgentTickVerification'
    );
    console.log('❌ CRITICAL: Agent tick cron is NOT configured!');
    console.log('   Agents will not run automatically in production.');
    console.log(
      '   Add to vercel.json: {"path": "/api/cron/agent-tick", "schedule": "*/5 * * * *"}'
    );
    console.log('');
  }

  if (activeAgents.length === 0 && statuses.length > 0) {
    logger.warn(
      'No active agents found',
      {
        totalAgents: statuses.length,
        possibleReasons: [
          'Cron job not running',
          'Agents ran out of points',
          'Agents not configured correctly',
        ],
      },
      'AgentTickVerification'
    );
    console.log('⚠️  WARNING: No active agents found!');
    console.log('   This could indicate:');
    console.log('   - Cron job is not running');
    console.log('   - Agents ran out of points');
    console.log('   - Agents are not configured correctly');
    console.log('');
  } else if (activeAgents.length > 0) {
    logger.info(
      'Active agents found',
      { count: activeAgents.length },
      'AgentTickVerification'
    );
    console.log(`✅ GOOD: ${activeAgents.length} agent(s) are active`);
    console.log('');
  }

  if (inactiveAgents.length > 0) {
    logger.warn(
      'Inactive agents detected',
      {
        count: inactiveAgents.length,
        agentIds: inactiveAgents.map((a) => a.id),
      },
      'AgentTickVerification'
    );
    console.log(
      `⚠️  WARNING: ${inactiveAgents.length} agent(s) appear inactive`
    );
    console.log(
      '   Check agentLastTickAt timestamps - should update every 5 minutes'
    );
    console.log('');
  }

  if (noPointsAgents.length > 0) {
    logger.warn(
      'Agents with no points detected',
      {
        count: noPointsAgents.length,
        agentIds: noPointsAgents.map((a) => a.id),
      },
      'AgentTickVerification'
    );
    console.log(`🔴 WARNING: ${noPointsAgents.length} agent(s) have no points`);
    console.log('   Agents need agentPointsBalance >= 1 to run');
    console.log('');
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  logger.error(
    'Agent tick verification script failed',
    error,
    'AgentTickVerification'
  );
  console.error(
    '\n❌ ERROR:',
    error instanceof Error ? error.message : String(error)
  );
  console.error(error instanceof Error ? error.stack : '');
  process.exit(1);
});
