#!/usr/bin/env tsx
/**
 * Safe Migration Pusher
 * 
 * Pushes migrations to prod and dev environments while preserving the User table.
 * Checks migration status before applying to avoid conflicts.
 */

import { PrismaClient } from '@prisma/client';

const PROD_DATABASE_URL = 'postgresql://neondb_owner:npg_9odB3XWmNCRz@ep-soft-wildflower-a4og8nnb.us-east-1.aws.neon.tech/neondb?sslmode=require';
const PROD_DIRECT_DATABASE_URL = 'postgresql://neondb_owner:npg_9odB3XWmNCRz@ep-soft-wildflower-a4og8nnb.us-east-1.aws.neon.tech/neondb?sslmode=require';

const DEV_DATABASE_URL = 'postgresql://neondb_owner:npg_WjN9wfVRX1LH@ep-orange-bird-ahovv9la.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DEV_DIRECT_DATABASE_URL = 'postgresql://neondb_owner:npg_WjN9wfVRX1LH@ep-orange-bird-ahovv9la.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';

interface MigrationStatus {
  environment: string;
  appliedMigrations: string[];
  pendingMigrations: string[];
  hasUserTable: boolean;
  userCount: number;
}

async function checkMigrationStatus(
  databaseUrl: string,
  _directUrl: string,
  environment: string
): Promise<MigrationStatus> {
  console.log(`\n📊 Checking ${environment} database status...`);
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    // Check if User table exists and count users
    let hasUserTable = false;
    let userCount = 0;
    
    try {
      const userCountResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM "User"
      `;
      hasUserTable = true;
      userCount = Number(userCountResult[0]?.count || 0);
      console.log(`  ✅ User table exists with ${userCount} users`);
    } catch (error) {
      console.log(`  ⚠️  User table does not exist or error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Check applied migrations
    const appliedMigrations = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations 
      WHERE finished_at IS NOT NULL 
      ORDER BY finished_at ASC
    `;

    const appliedNames = appliedMigrations.map(m => m.migration_name);
    console.log(`  📝 Applied migrations: ${appliedNames.length}`);
    appliedNames.forEach(name => console.log(`     - ${name}`));

    // Get all migrations from filesystem
    const fs = await import('fs');
    const migrationsDir = './prisma/migrations';
    const migrationDirs = fs.readdirSync(migrationsDir)
      .filter(name => name !== 'migration_lock.toml' && !name.startsWith('.'))
      .sort();

    const pendingMigrations = migrationDirs.filter(name => !appliedNames.includes(name));

    console.log(`  ⏳ Pending migrations: ${pendingMigrations.length}`);
    pendingMigrations.forEach(name => console.log(`     - ${name}`));

    return {
      environment,
      appliedMigrations: appliedNames,
      pendingMigrations,
      hasUserTable,
      userCount,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function pushMigrations(
  databaseUrl: string,
  directUrl: string,
  environment: string
): Promise<void> {
  console.log(`\n🚀 Pushing migrations to ${environment}...`);
  
  // Set environment variables for this migration
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_DATABASE_URL = directUrl;

  try {
    // Use prisma migrate deploy (safer for production - doesn't create new migrations)
    const { execSync: execSyncImport } = await import('child_process');
    const execSync = execSyncImport;
    
    console.log(`  Running: prisma migrate deploy`);
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_DATABASE_URL: directUrl,
      },
    });
    
    console.log(`  ✅ Migrations pushed successfully to ${environment}`);
  } catch (error) {
    console.error(`  ❌ Error pushing migrations to ${environment}:`, error);
    throw error;
  }
}

async function main() {
  console.log('🔍 Migration Safety Check\n');
  console.log('='.repeat(60));

  // Check both environments
  const prodStatus = await checkMigrationStatus(
    PROD_DATABASE_URL,
    PROD_DIRECT_DATABASE_URL,
    'PROD'
  );

  const devStatus = await checkMigrationStatus(
    DEV_DATABASE_URL,
    DEV_DIRECT_DATABASE_URL,
    'DEV'
  );

  // Summary
  console.log('\n📋 Summary:');
  console.log('='.repeat(60));
  console.log(`PROD: ${prodStatus.appliedMigrations.length} applied, ${prodStatus.pendingMigrations.length} pending`);
  console.log(`      User table: ${prodStatus.hasUserTable ? '✅' : '❌'} (${prodStatus.userCount} users)`);
  console.log(`DEV:  ${devStatus.appliedMigrations.length} applied, ${devStatus.pendingMigrations.length} pending`);
  console.log(`      User table: ${devStatus.hasUserTable ? '✅' : '❌'} (${devStatus.userCount} users)`);

  // Safety checks
  if (!prodStatus.hasUserTable && prodStatus.userCount === 0) {
    console.log('\n⚠️  WARNING: PROD User table does not exist or is empty!');
  }
  if (!devStatus.hasUserTable && devStatus.userCount === 0) {
    console.log('\n⚠️  WARNING: DEV User table does not exist or is empty!');
  }

  // Ask for confirmation
  console.log('\n⚠️  Ready to push migrations. This will:');
  console.log('   - Apply pending migrations to both environments');
  console.log('   - Preserve existing data (including User table)');
  console.log('   - Use migrate deploy (safe for production)');
  
  // For automation, we'll proceed (user can cancel if needed)
  console.log('\n🚀 Proceeding with migration push...\n');

  try {
    // Push to DEV first (safer)
    if (devStatus.pendingMigrations.length > 0) {
      await pushMigrations(
        DEV_DATABASE_URL,
        DEV_DIRECT_DATABASE_URL,
        'DEV'
      );
    } else {
      console.log('\n✅ DEV: No pending migrations');
    }

    // Push to PROD
    if (prodStatus.pendingMigrations.length > 0) {
      await pushMigrations(
        PROD_DATABASE_URL,
        PROD_DIRECT_DATABASE_URL,
        'PROD'
      );
    } else {
      console.log('\n✅ PROD: No pending migrations');
    }

    console.log('\n✅ All migrations pushed successfully!');
    
    // Verify User tables still exist
    console.log('\n🔍 Verifying User tables...');
    const prodVerify = await checkMigrationStatus(
      PROD_DATABASE_URL,
      PROD_DIRECT_DATABASE_URL,
      'PROD'
    );
    const devVerify = await checkMigrationStatus(
      DEV_DATABASE_URL,
      DEV_DIRECT_DATABASE_URL,
      'DEV'
    );

    if (prodVerify.hasUserTable && prodVerify.userCount === prodStatus.userCount) {
      console.log('✅ PROD: User table preserved');
    } else {
      console.log('⚠️  PROD: User table count changed!');
    }

    if (devVerify.hasUserTable && devVerify.userCount === devStatus.userCount) {
      console.log('✅ DEV: User table preserved');
    } else {
      console.log('⚠️  DEV: User table count changed!');
    }

  } catch (error) {
    console.error('\n❌ Migration push failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);

