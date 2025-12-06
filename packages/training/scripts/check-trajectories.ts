#!/usr/bin/env bun
/**
 * Check recent trajectories in database
 */

import { count, db, desc, trajectories } from '@babylon/db';

async function main() {
  console.log('Checking trajectories in database...\n');

  // Count total trajectories
  const totalResult = await db.select({ count: count() }).from(trajectories);
  console.log(`Total trajectories in database: ${totalResult[0]?.count || 0}`);

  // Get recent trajectories
  const recent = await db
    .select({
      id: trajectories.id,
      agentId: trajectories.agentId,
      totalReward: trajectories.totalReward,
      episodeLength: trajectories.episodeLength,
      finalPnL: trajectories.finalPnL,
      finalBalance: trajectories.finalBalance,
      tradesExecuted: trajectories.tradesExecuted,
      scenarioId: trajectories.scenarioId,
      createdAt: trajectories.createdAt,
    })
    .from(trajectories)
    .orderBy(desc(trajectories.createdAt))
    .limit(10);

  console.log(`\nRecent 10 trajectories:`);
  console.log('─'.repeat(100));

  for (const traj of recent) {
    const archetype = traj.agentId.replace('agent-', '').split('-')[0];
    console.log(
      `  ${archetype.padEnd(20)} | PnL: ${String(traj.finalPnL).padStart(10)} | Trades: ${traj.tradesExecuted} | Steps: ${traj.episodeLength} | Reward: ${traj.totalReward?.toFixed(3)}`
    );
  }

  console.log('─'.repeat(100));

  // Check if we have trajectories with actual data
  const withSteps = recent.filter(
    (t) => t.episodeLength && t.episodeLength > 0
  );
  console.log(
    `\nTrajectories with steps: ${withSteps.length}/${recent.length}`
  );

  const withTrades = recent.filter(
    (t) => t.tradesExecuted && t.tradesExecuted > 0
  );
  console.log(
    `Trajectories with trades: ${withTrades.length}/${recent.length}`
  );

  process.exit(0);
}

main().catch(console.error);
