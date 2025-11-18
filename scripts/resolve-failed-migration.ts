#!/usr/bin/env tsx
/**
 * Resolve Failed Migration
 * 
 * Marks a failed migration as rolled back so we can retry or skip it.
 */

import { PrismaClient } from '@prisma/client';

const PROD_DATABASE_URL = 'postgresql://neondb_owner:npg_9odB3XWmNCRz@ep-soft-wildflower-a4og8nnb.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function resolveFailedMigration() {
  const prisma = new PrismaClient({
    datasources: { db: { url: PROD_DATABASE_URL } },
  });

  try {
    console.log('🔍 Checking failed migrations...');
    
    // Check for failed migrations
    const failed = await prisma.$queryRaw<Array<{
      migration_name: string;
      started_at: Date;
      finished_at: Date | null;
    }>>`
      SELECT migration_name, started_at, finished_at
      FROM _prisma_migrations
      WHERE finished_at IS NULL OR started_at > finished_at
      ORDER BY started_at DESC
    `;

    console.log(`Found ${failed.length} failed migrations:`);
    failed.forEach(m => {
      console.log(`  - ${m.migration_name} (started: ${m.started_at}, finished: ${m.finished_at || 'NULL'})`);
    });

    if (failed.length === 0) {
      console.log('✅ No failed migrations found');
      return;
    }

    // Check if the schema actually matches what the migration would create
    const hasOnboardingStatus = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_type 
        WHERE typname = 'OnboardingStatus' 
        AND typtype = 'e'
      ) as exists
    `;

    const hasActorTable = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'Actor'
      ) as exists
    `;

    const hasUserTable = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'User'
      ) as exists
    `;

    console.log('\n📊 Schema status:');
    console.log(`  OnboardingStatus enum: ${hasOnboardingStatus[0]?.exists ? '✅' : '❌'}`);
    console.log(`  Actor table: ${hasActorTable[0]?.exists ? '✅' : '❌'}`);
    console.log(`  User table: ${hasUserTable[0]?.exists ? '✅' : '❌'}`);

    // If the migration is 20251115144702 and the schema elements exist, mark as rolled back
    const targetMigration = '20251115144702';
    const targetFailed = failed.find(m => m.migration_name === targetMigration);

    if (targetFailed) {
      if (hasOnboardingStatus[0]?.exists && hasActorTable[0]?.exists && hasUserTable[0]?.exists) {
        console.log(`\n✅ Schema elements exist - marking ${targetMigration} as rolled back`);
        
        // Delete the failed migration record
        await prisma.$executeRaw`
          DELETE FROM _prisma_migrations 
          WHERE migration_name = ${targetMigration}
        `;

        console.log(`✅ Removed failed migration record for ${targetMigration}`);
        console.log(`\n⚠️  Note: You may need to manually mark this migration as applied if the schema matches.`);
        console.log(`   Run: INSERT INTO _prisma_migrations (migration_name, started_at, finished_at, applied_steps_count)`);
        console.log(`        VALUES ('${targetMigration}', NOW(), NOW(), 1);`);
      } else {
        console.log(`\n⚠️  Schema elements missing - cannot safely resolve`);
        console.log(`   You may need to manually fix the schema or rollback the migration`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

resolveFailedMigration().catch(console.error);

