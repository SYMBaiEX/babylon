#!/usr/bin/env tsx
/**
 * Check Schema and Resolve Migration Conflicts
 * 
 * Checks what exists in PROD and marks migrations as applied if schema matches.
 */

import { PrismaClient } from '@prisma/client';

const PROD_DATABASE_URL = 'postgresql://neondb_owner:npg_9odB3XWmNCRz@ep-soft-wildflower-a4og8nnb.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function checkColumnExists(table: string, column: string): Promise<boolean> {
  const prisma = new PrismaClient({
    datasources: { db: { url: PROD_DATABASE_URL } },
  });

  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = ${table}
        AND column_name = ${column}
      ) as exists
    `;
    return result[0]?.exists || false;
  } finally {
    await prisma.$disconnect();
  }
}

async function markMigrationApplied(migrationName: string) {
  const prisma = new PrismaClient({
    datasources: { db: { url: PROD_DATABASE_URL } },
  });

  try {
    const recordExists = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name 
      FROM _prisma_migrations 
      WHERE migration_name = ${migrationName}
    `;

    if (recordExists.length > 0) {
      await prisma.$executeRaw`
        UPDATE _prisma_migrations 
        SET finished_at = NOW(), applied_steps_count = 1
        WHERE migration_name = ${migrationName} AND finished_at IS NULL
      `;
      console.log(`✅ Updated ${migrationName} to applied`);
    } else {
      await prisma.$executeRaw`
        INSERT INTO _prisma_migrations (migration_name, started_at, finished_at, applied_steps_count)
        VALUES (${migrationName}, NOW(), NOW(), 1)
      `;
      console.log(`✅ Inserted ${migrationName} as applied`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log('🔍 Checking PROD schema for migration conflicts...\n');

  // Check 20251117141000_resync_schema - it adds evolutionCount, interactionCount, lastInteraction
  const hasEvolutionCount = await checkColumnExists('ActorRelationship', 'evolutionCount');
  const hasInteractionCount = await checkColumnExists('ActorRelationship', 'interactionCount');
  const hasLastInteraction = await checkColumnExists('ActorRelationship', 'lastInteraction');

  console.log('ActorRelationship columns:');
  console.log(`  evolutionCount: ${hasEvolutionCount ? '✅' : '❌'}`);
  console.log(`  interactionCount: ${hasInteractionCount ? '✅' : '❌'}`);
  console.log(`  lastInteraction: ${hasLastInteraction ? '✅' : '❌'}`);

  // Check other tables from this migration
  const hasChatCreatedBy = await checkColumnExists('Chat', 'createdBy');
  const hasChatDescription = await checkColumnExists('Chat', 'description');
  const hasUserA2aEnabled = await checkColumnExists('User', 'a2aEnabled');

  console.log('\nOther columns:');
  console.log(`  Chat.createdBy: ${hasChatCreatedBy ? '✅' : '❌'}`);
  console.log(`  Chat.description: ${hasChatDescription ? '✅' : '❌'}`);
  console.log(`  User.a2aEnabled: ${hasUserA2aEnabled ? '✅' : '❌'}`);

  // If most columns exist, mark migration as applied
  const columnsExist = hasEvolutionCount && hasInteractionCount && hasLastInteraction;
  
  if (columnsExist) {
    console.log('\n✅ Schema elements exist - marking 20251117141000_resync_schema as applied');
    await markMigrationApplied('20251117141000_resync_schema');
  } else {
    console.log('\n⚠️  Some columns missing - cannot safely mark as applied');
  }

  // Check User table still exists
  const prisma = new PrismaClient({
    datasources: { db: { url: PROD_DATABASE_URL } },
  });
  
  try {
    const userCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "User"
    `;
    console.log(`\n✅ User table preserved: ${Number(userCount[0]?.count || 0)} users`);
  } catch (error) {
    console.error(`\n❌ User table check failed:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);

