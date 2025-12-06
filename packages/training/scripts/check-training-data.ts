#!/usr/bin/env bun
/**
 * Check isTrainingData flag on trajectories
 */

import { count, db, desc, eq, trajectories } from '@babylon/db';

async function main() {
  console.log('Checking isTrainingData flag...\n');

  // Count total and training data
  const totalResult = await db.select({ count: count() }).from(trajectories);
  const trainingResult = await db
    .select({ count: count() })
    .from(trajectories)
    .where(eq(trajectories.isTrainingData, true));

  console.log(`Total trajectories: ${totalResult[0]?.count || 0}`);
  console.log(`isTrainingData=true: ${trainingResult[0]?.count || 0}`);

  // Sample check
  const sample = await db
    .select({
      id: trajectories.id,
      agentId: trajectories.agentId,
      isTrainingData: trajectories.isTrainingData,
      stepsJson: trajectories.stepsJson,
    })
    .from(trajectories)
    .limit(3);

  console.log('\nSample:');
  for (const t of sample) {
    const stepsPreview =
      typeof t.stepsJson === 'string'
        ? t.stepsJson.substring(0, 50)
        : JSON.stringify(t.stepsJson).substring(0, 50);
    console.log(
      `  ${t.agentId} | isTrainingData: ${t.isTrainingData} | steps: ${stepsPreview}...`
    );
  }

  process.exit(0);
}

main().catch(console.error);
