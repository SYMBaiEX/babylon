#!/usr/bin/env bun
/**
 * Clean synthetic/fake data from the database
 */

import { db, like, or, sql, trajectories } from '@babylon/db';

async function main() {
  console.log('Cleaning synthetic data from database...\n');

  // Count synthetic trajectories
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM trajectories 
    WHERE scenario_id LIKE 'multi-archetype%' 
       OR agent_id LIKE 'agent-%-%'
  `);

  const syntheticCount = (countResult.rows[0] as { count: string })?.count || 0;
  console.log(`Found ${syntheticCount} synthetic trajectories`);

  if (Number(syntheticCount) === 0) {
    console.log('No synthetic data to clean!');
    process.exit(0);
  }

  // Confirm deletion
  console.log('\n⚠️  This will permanently delete synthetic trajectories.');
  console.log('   These are trajectories created by "babylon train generate"');
  console.log('   which use fake data and Math.random() decisions.\n');

  // Delete synthetic data
  const deleteResult = await db.execute(sql`
    DELETE FROM trajectories 
    WHERE scenario_id LIKE 'multi-archetype%' 
       OR agent_id LIKE 'agent-%-%'
  `);

  console.log(`✅ Deleted ${syntheticCount} synthetic trajectories`);

  // Verify
  const remainingResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM trajectories
  `);
  const remaining = (remainingResult.rows[0] as { count: string })?.count || 0;
  console.log(`\nRemaining trajectories: ${remaining}`);

  if (Number(remaining) === 0) {
    console.log('\n⚠️  Database is now empty.');
    console.log('   To generate REAL data:');
    console.log('   1. Start server: bun run dev');
    console.log(
      '   2. Run: babylon train parallel --archetypes trader --num-agents 2 --ticks 10'
    );
  }

  process.exit(0);
}

main().catch(console.error);
