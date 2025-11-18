#!/usr/bin/env bun
/**
 * Check Migration Status for All Databases
 * 
 * Checks migration status for dev and local databases
 */

const DEV_DATABASE_URL = 'postgresql://neondb_owner:npg_WjN9wfVRX1LH@ep-orange-bird-ahovv9la.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';
const LOCAL_DATABASE_URL = 'postgresql://babylon:babylon_dev_password@localhost:5433/babylon';

async function checkDatabase(name: string, url: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 ${name.toUpperCase()} DATABASE`);
  console.log('═'.repeat(60));
  
  try {
    const { execSync } = await import('child_process');
    
    // Check migration status
    try {
      execSync(`bunx prisma migrate status`, {
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_URL: url,
          DIRECT_DATABASE_URL: url,
        },
        cwd: process.cwd(),
      });
      console.log('✅ Migrations: Up to date');
    } catch (error: unknown) {
      const output = error instanceof Error ? error.message : String(error);
      if (output.includes('pending')) {
        console.log('⚠️  Migrations: Pending migrations found');
        console.log('   Run: DATABASE_URL="..." bunx prisma migrate deploy');
      } else if (output.includes("Can't reach database")) {
        console.log('❌ Database: Not running or not accessible');
        console.log(`   URL: ${url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
      } else {
        console.log('❌ Error checking migrations:', output);
      }
    }

    // Check if column exists
    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: url });
      await client.connect();
      
      const result = await client.query(`
        SELECT column_name 
        FROM information_schema.columns
        WHERE table_name = 'User' 
        AND column_name = 'pointsAwardedForReferralBonus'
      `);
      
      if (result.rows.length > 0) {
        console.log('✅ Column pointsAwardedForReferralBonus: EXISTS');
      } else {
        console.log('❌ Column pointsAwardedForReferralBonus: MISSING');
        console.log('   Run migrations to add this column');
      }
      
      await client.end();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("Can't reach database") || errorMsg.includes('ECONNREFUSED')) {
        console.log('⚠️  Column check: Skipped (database not accessible)');
      } else {
        console.log('❌ Error checking column:', errorMsg);
      }
    }
    
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  console.log('🔍 Checking Migration Status for All Databases\n');
  
  await checkDatabase('DEV (Neon)', DEV_DATABASE_URL);
  await checkDatabase('LOCAL', LOCAL_DATABASE_URL);
  
  console.log('\n' + '═'.repeat(60));
  console.log('📝 Summary');
  console.log('═'.repeat(60));
  console.log('\nTo migrate a database:');
  console.log('  DATABASE_URL="..." bunx prisma migrate deploy');
  console.log('\nTo start local database:');
  console.log('  docker-compose up -d postgres');
  console.log('  # or');
  console.log('  bun run scripts/pre-dev/pre-dev-local.ts');
}

main();

