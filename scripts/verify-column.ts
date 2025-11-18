#!/usr/bin/env bun
/**
 * Verify column exists in database
 */

const DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL or DIRECT_DATABASE_URL required');
  process.exit(1);
}

async function verifyColumn() {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'User' 
      AND column_name = 'pointsAwardedForReferralBonus'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Column exists:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    } else {
      console.log('❌ Column does NOT exist!');
      console.log('   Run: bunx prisma migrate deploy');
    }

    // Also check all User table columns for reference
    const allColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'User'
      ORDER BY ordinal_position
    `);
    
    console.log(`\n📋 All User table columns (${allColumns.rows.length} total):`);
    allColumns.rows.forEach((col: { column_name: string; data_type: string }) => {
      const marker = col.column_name === 'pointsAwardedForReferralBonus' ? ' ✅' : '';
      console.log(`   - ${col.column_name} (${col.data_type})${marker}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verifyColumn();

