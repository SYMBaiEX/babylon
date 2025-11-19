#!/usr/bin/env bun

/**
 * Backfill AgentPerformanceMetrics for users/agents missing entries.
 *
 * Usage: bun run scripts/backfill-agent-performance-metrics.ts [--dry-run]
 */

import { prisma } from '../src/lib/prisma';
import { generateSnowflakeId } from '../src/lib/snowflake';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const usersMissingMetrics = await prisma.user.findMany({
    where: {
      AgentPerformanceMetrics: null,
    },
    select: {
      id: true,
      username: true,
      isAgent: true,
      createdAt: true,
    },
  });

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
    await prisma.agentPerformanceMetrics.create({
      data: {
        id: await generateSnowflakeId(),
        userId: user.id,
        updatedAt: new Date(),
      },
    });
    console.log(`Created metrics for ${user.username ?? user.id}`);
  }

  console.log('Backfill complete.');
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
