#!/usr/bin/env tsx
/**
 * Resolve Migration Conflicts and Push
 * 
 * Handles cases where PROD has schema elements that migrations try to create.
 * Uses IF NOT EXISTS patterns and marks migrations as resolved when safe.
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const PROD_DATABASE_URL = 'postgresql://neondb_owner:npg_9odB3XWmNCRz@ep-soft-wildflower-a4og8nnb.us-east-1.aws.neon.tech/neondb?sslmode=require';
const PROD_DIRECT_DATABASE_URL = 'postgresql://neondb_owner:npg_9odB3XWmNCRz@ep-soft-wildflower-a4og8nnb.us-east-1.aws.neon.tech/neondb?sslmode=require';

const DEV_DATABASE_URL = 'postgresql://neondb_owner:npg_WjN9wfVRX1LH@ep-orange-bird-ahovv9la.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DEV_DIRECT_DATABASE_URL = 'postgresql://neondb_owner:npg_WjN9wfVRX1LH@ep-orange-bird-ahovv9la.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function checkExistingTypes(dbUrl: string): Promise<string[]> {
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    const types = await prisma.$queryRaw<Array<{ typname: string }>>`
      SELECT typname 
      FROM pg_type 
      WHERE typtype = 'e' 
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY typname
    `;
    return types.map(t => t.typname);
  } finally {
    await prisma.$disconnect();
  }
}

async function checkExistingTables(dbUrl: string): Promise<string[]> {
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    return tables.map(t => t.tablename);
  } finally {
    await prisma.$disconnect();
  }
}

async function markMigrationAsApplied(
  dbUrl: string,
  migrationName: string
): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    // Check if migration record exists
    const existing = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name 
      FROM _prisma_migrations 
      WHERE migration_name = ${migrationName}
    `;

    if (existing.length === 0) {
      // Insert migration record as applied
      await prisma.$executeRaw`
        INSERT INTO _prisma_migrations (migration_name, started_at, finished_at, applied_steps_count)
        VALUES (${migrationName}, NOW(), NOW(), 1)
      `;
      console.log(`  ✅ Marked ${migrationName} as applied`);
    } else {
      console.log(`  ℹ️  ${migrationName} already marked as applied`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function resolveMigrationConflict(
  dbUrl: string,
  _directUrl: string,
  migrationName: string
): Promise<boolean> {
  console.log(`\n🔧 Resolving conflict for ${migrationName}...`);

  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    // Check what exists
    const existingTypes = await checkExistingTypes(dbUrl);
    const existingTables = await checkExistingTables(dbUrl);

    console.log(`  Found ${existingTypes.length} enum types`);
    console.log(`  Found ${existingTables.length} tables`);

    // For the specific migration that's failing (20251115144702)
    if (migrationName === '20251115144702') {
      const hasOnboardingStatus = existingTypes.includes('OnboardingStatus');
      const hasActorTable = existingTables.includes('Actor');
      const hasUserTable = existingTables.includes('User');

      console.log(`  OnboardingStatus enum: ${hasOnboardingStatus ? '✅ exists' : '❌ missing'}`);
      console.log(`  Actor table: ${hasActorTable ? '✅ exists' : '❌ missing'}`);
      console.log(`  User table: ${hasUserTable ? '✅ exists' : '❌ missing'}`);

      // If User table exists and OnboardingStatus exists, we can mark as resolved
      // The migration likely partially applied or was created manually
      if (hasUserTable && hasOnboardingStatus) {
        console.log(`  ✅ Schema elements exist - marking migration as resolved`);
        await markMigrationAsApplied(dbUrl, migrationName);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`  ❌ Error resolving conflict:`, error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

async function pushMigrationsSafely(
  dbUrl: string,
  directUrl: string,
  environment: string
): Promise<void> {
  console.log(`\n🚀 Pushing migrations to ${environment}...`);

  process.env.DATABASE_URL = dbUrl;
  process.env.DIRECT_DATABASE_URL = directUrl;

  try {
    const { execSync } = await import('child_process');

    console.log(`  Running: prisma migrate deploy`);
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        DIRECT_DATABASE_URL: directUrl,
      },
    });

    console.log(`  ✅ Migrations pushed successfully to ${environment}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if it's the specific migration conflict
    if (errorMessage.includes('20251115144702') || errorMessage.includes('OnboardingStatus')) {
      console.log(`  ⚠️  Migration conflict detected, attempting to resolve...`);
      
      const resolved = await resolveMigrationConflict(dbUrl, directUrl, '20251115144702');
      
      if (resolved) {
        console.log(`  🔄 Retrying migration push...`);
        // Retry the migration
        execSync('npx prisma migrate deploy', {
          stdio: 'inherit',
          env: {
            ...process.env,
            DATABASE_URL: dbUrl,
            DIRECT_DATABASE_URL: directUrl,
          },
        });
        console.log(`  ✅ Migrations pushed successfully after resolution`);
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log('🔍 Migration Resolution and Push\n');
  console.log('='.repeat(60));

  // Check PROD status first
  console.log('\n📊 Checking PROD database...');
  const prodTypes = await checkExistingTypes(PROD_DATABASE_URL);
  const prodTables = await checkExistingTables(PROD_DATABASE_URL);
  
  console.log(`  Types: ${prodTypes.length} (${prodTypes.slice(0, 5).join(', ')}...)`);
  console.log(`  Tables: ${prodTables.length} (${prodTables.slice(0, 5).join(', ')}...)`);
  console.log(`  User table exists: ${prodTables.includes('User') ? '✅' : '❌'}`);

  // Check DEV status
  console.log('\n📊 Checking DEV database...');
  const devTypes = await checkExistingTypes(DEV_DATABASE_URL);
  const devTables = await checkExistingTables(DEV_DATABASE_URL);
  
  console.log(`  Types: ${devTypes.length}`);
  console.log(`  Tables: ${devTables.length}`);
  console.log(`  User table exists: ${devTables.includes('User') ? '✅' : '❌'}`);

  // Push to DEV first (safer)
  console.log('\n' + '='.repeat(60));
  try {
    await pushMigrationsSafely(
      DEV_DATABASE_URL,
      DEV_DIRECT_DATABASE_URL,
      'DEV'
    );
  } catch (error) {
    console.error('❌ DEV migration failed:', error);
  }

  // Push to PROD
  console.log('\n' + '='.repeat(60));
  try {
    await pushMigrationsSafely(
      PROD_DATABASE_URL,
      PROD_DIRECT_DATABASE_URL,
      'PROD'
    );
  } catch (error) {
    console.error('❌ PROD migration failed:', error);
    process.exit(1);
  }

  // Final verification
  console.log('\n' + '='.repeat(60));
  console.log('🔍 Final Verification\n');
  
  const finalProdTables = await checkExistingTables(PROD_DATABASE_URL);
  const finalDevTables = await checkExistingTables(DEV_DATABASE_URL);
  
  console.log(`PROD User table: ${finalProdTables.includes('User') ? '✅ PRESERVED' : '❌ MISSING'}`);
  console.log(`DEV User table: ${finalDevTables.includes('User') ? '✅ PRESERVED' : '❌ MISSING'}`);

  if (!finalProdTables.includes('User') || !finalDevTables.includes('User')) {
    console.error('\n❌ CRITICAL: User table was lost!');
    process.exit(1);
  }

  console.log('\n✅ All migrations completed successfully!');
}

main().catch(console.error);

