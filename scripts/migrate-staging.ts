#!/usr/bin/env bun
/**
 * Migrate Staging Database
 * 
 * Run migrations on staging database
 * Usage: STAGING_DATABASE_URL="..." bun run scripts/migrate-staging.ts
 */

const DATABASE_URL = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
const DIRECT_DATABASE_URL = process.env.STAGING_DIRECT_DATABASE_URL || process.env.DIRECT_DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ STAGING_DATABASE_URL or DATABASE_URL environment variable required');
  process.exit(1);
}

async function migrateStaging() {
  // DATABASE_URL is guaranteed to be defined here due to check above
  const dbUrl: string = DATABASE_URL!;
  
  // Set environment variables for Prisma
  process.env.DATABASE_URL = dbUrl;
  if (DIRECT_DATABASE_URL) {
    process.env.DIRECT_DATABASE_URL = DIRECT_DATABASE_URL;
  }

  console.log('🔄 Running migrations on staging database...');
  console.log(`   Database: ${dbUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}\n`);

  const { execSync } = await import('child_process');
  
  try {
    execSync('bunx prisma migrate deploy', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        DIRECT_DATABASE_URL: DIRECT_DATABASE_URL || dbUrl,
      },
    });
    console.log('\n✅ Migrations applied successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateStaging();

