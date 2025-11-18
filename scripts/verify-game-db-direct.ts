#!/usr/bin/env bun
/**
 * Verify Game State in Database (Direct Connection)
 * 
 * Connects directly to the database using pg client to check game state
 */

const DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || 'postgresql://neondb_owner:npg_WjN9wfVRX1LH@ep-orange-bird-ahovv9la.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function verifyGameState() {
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Get all games
    const allGamesResult = await client.query(`
      SELECT 
        id,
        "isRunning",
        "isContinuous",
        "currentDay",
        "startedAt",
        "pausedAt",
        "lastTickAt",
        "updatedAt",
        "createdAt"
      FROM "Game"
      ORDER BY "createdAt" DESC
    `);

    console.log(`Found ${allGamesResult.rows.length} total game(s)\n`);

    if (allGamesResult.rows.length === 0) {
      console.log('⚠️  No games found in database!');
      await client.end();
      return;
    }

    // Show all games
    console.log('═'.repeat(80));
    console.log('ALL GAMES:');
    console.log('═'.repeat(80));
    for (const game of allGamesResult.rows) {
      console.log(`\nGame ID: ${game.id}`);
      console.log(`  isRunning: ${game.isRunning} (type: ${typeof game.isRunning}, raw: ${JSON.stringify(game.isRunning)})`);
      console.log(`  isContinuous: ${game.isContinuous} (type: ${typeof game.isContinuous}, raw: ${JSON.stringify(game.isContinuous)})`);
      console.log(`  currentDay: ${game.currentDay}`);
      console.log(`  startedAt: ${game.startedAt?.toISOString() || 'null'}`);
      console.log(`  pausedAt: ${game.pausedAt?.toISOString() || 'null'}`);
      console.log(`  lastTickAt: ${game.lastTickAt?.toISOString() || 'null'}`);
      console.log(`  updatedAt: ${game.updatedAt?.toISOString()}`);
      console.log(`  createdAt: ${game.createdAt?.toISOString()}`);
    }

    // Check for continuous games specifically
    const continuousGamesResult = await client.query(`
      SELECT 
        id,
        "isRunning",
        "isContinuous",
        "currentDay",
        "startedAt",
        "pausedAt",
        "lastTickAt",
        "updatedAt"
      FROM "Game"
      WHERE "isContinuous" = true
    `);

    console.log('\n' + '═'.repeat(80));
    console.log(`CONTINUOUS GAMES (isContinuous = true): ${continuousGamesResult.rows.length}`);
    console.log('═'.repeat(80));

    if (continuousGamesResult.rows.length === 0) {
      console.log('\n⚠️  No continuous games found! This is why cron is skipping.');
      console.log('   The cron query looks for: WHERE isContinuous = true');
    } else if (continuousGamesResult.rows.length > 1) {
      console.log(`\n⚠️  Found ${continuousGamesResult.rows.length} continuous games!`);
      console.log('   Cron uses findFirst() which returns the first match.');
      console.log('   This might be returning the wrong game.');
      for (const game of continuousGamesResult.rows) {
        console.log(`\n   Game ${game.id}:`);
        console.log(`     isRunning: ${game.isRunning}`);
      }
    } else {
      const game = continuousGamesResult.rows[0];
      console.log(`\n✅ Found 1 continuous game:`);
      console.log(`   ID: ${game.id}`);
      console.log(`   isRunning: ${game.isRunning} (${typeof game.isRunning})`);
      console.log(`   isContinuous: ${game.isContinuous} (${typeof game.isContinuous})`);
      
      // Check if isRunning is actually true
      if (game.isRunning === true) {
        console.log('\n✅ isRunning is TRUE - cron should proceed');
        console.log('   If cron is still skipping, check:');
        console.log('   1. Is cron connecting to the same database?');
        console.log('   2. Are there any database connection pool issues?');
        console.log('   3. Check the cron logs for the detailed game state query result');
      } else if (game.isRunning === false) {
        console.log('\n❌ isRunning is FALSE - this is why cron is skipping');
        console.log(`   Run: UPDATE "Game" SET "isRunning" = true WHERE id = '${game.id}'`);
      } else {
        console.log(`\n⚠️  isRunning has unexpected value: ${game.isRunning} (${typeof game.isRunning})`);
        console.log('   This might be a type issue. Expected boolean true/false.');
      }
    }

    // Check what findFirst would return (same query as cron)
    const cronQueryResult = await client.query(`
      SELECT 
        id,
        "isRunning",
        "isContinuous",
        "currentDay"
      FROM "Game"
      WHERE "isContinuous" = true
      LIMIT 1
    `);

    console.log('\n' + '═'.repeat(80));
    console.log('CRON QUERY RESULT (findFirst where isContinuous = true):');
    console.log('═'.repeat(80));
    if (cronQueryResult.rows.length > 0) {
      const result = cronQueryResult.rows[0];
      console.log(`✅ Found game: ${result.id}`);
      console.log(`   isRunning: ${result.isRunning} (${typeof result.isRunning})`);
      console.log(`   Will cron proceed? ${result.isRunning === true ? 'YES ✅' : 'NO ❌'}`);
      
      if (result.isRunning !== true) {
        console.log(`\n🔧 To fix, run:`);
        console.log(`   UPDATE "Game" SET "isRunning" = true, "pausedAt" = NULL WHERE id = '${result.id}';`);
      }
    } else {
      console.log('❌ No game found - cron will skip');
    }

  } catch (error) {
    console.error('❌ Error querying database:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
  } finally {
    await client.end();
  }
}

verifyGameState();

