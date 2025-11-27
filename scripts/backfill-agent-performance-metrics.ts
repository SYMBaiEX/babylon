#!/usr/bin/env bun

/**
 * Backfill AgentPerformanceMetrics for users/agents missing entries.
 *
 * Usage: bun run scripts/backfill-agent-performance-metrics.ts [--dry-run]
 */

import { agentPerformanceMetrics, db, eq, isNull, users } from '@/db';
import { generateSnowflakeId } from '../src/lib/snowflake';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // Find users who don't have AgentPerformanceMetrics records
  // Use a left join and check for NULL
  const usersMissingMetrics = await db
    .select({
      id: users.id,
      username: users.username,
      isAgent: users.isAgent,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(
      agentPerformanceMetrics,
      eq(users.id, agentPerformanceMetrics.userId)
    )
    .where(isNull(agentPerformanceMetrics.id));

  if (usersMissingMetrics.length === 0) {
    console.log('✅ All users already have AgentPerformanceMetrics records.');
    return;
  }

  console.log(`Found ${usersMissingMetrics.length} user(s) without metrics.`);
  if (dryRun) {
    usersMissingMetrics.forEach((user) => {
      console.log(`• ${user.username ?? user.id} (agent=${user.isAgent})`);
    });
    console.log('Dry run mode - no records created.');
    return;
  }

  for (const user of usersMissingMetrics) {
    await db.insert(agentPerformanceMetrics).values({
      id: await generateSnowflakeId(),
      userId: user.id,
      updatedAt: new Date(),
    });
    console.log(`Created metrics for ${user.username ?? user.id}`);
  }

  console.log('✅ Backfill complete.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
