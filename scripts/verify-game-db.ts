#!/usr/bin/env bun
/**
 * Verify Game State in Database
 *
 * Connects directly to the database and checks the actual game state
 * to debug why cron might not be seeing isRunning = true
 */

const DATABASE_URL =
  process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    '❌ DATABASE_URL or DIRECT_DATABASE_URL environment variable required'
  );
  process.exit(1);
}

async function verifyGameState() {
  // Use Drizzle client
  const { db } = await import('@babylon/db');

  try {
    console.log('🔍 Checking game state in database...\n');

    // Get all games
    const allGames = await db.game.findMany({
      orderBy: { createdAt: 'desc' },
    });

    console.log(`Found ${allGames.length} total game(s)\n`);

    if (allGames.length === 0) {
      console.log('⚠️  No games found in database!');
      await db.$disconnect();
      return;
    }

    // Show all games
    console.log('═'.repeat(80));
    console.log('ALL GAMES:');
    console.log('═'.repeat(80));
    for (const game of allGames) {
      console.log(`\nGame ID: ${game.id}`);
      console.log(
        `  isRunning: ${game.isRunning} (type: ${typeof game.isRunning})`
      );
      console.log(
        `  isContinuous: ${game.isContinuous} (type: ${typeof game.isContinuous})`
      );
      console.log(`  currentDay: ${game.currentDay}`);
      console.log(`  startedAt: ${game.startedAt?.toISOString() || 'null'}`);
      console.log(`  pausedAt: ${game.pausedAt?.toISOString() || 'null'}`);
      console.log(`  lastTickAt: ${game.lastTickAt?.toISOString() || 'null'}`);
      console.log(`  updatedAt: ${game.updatedAt.toISOString()}`);
      console.log(`  createdAt: ${game.createdAt.toISOString()}`);
    }

    // Check for continuous games specifically
    const continuousGames = await db.game.findMany({
      where: { isContinuous: true },
    });

    console.log('\n' + '═'.repeat(80));
    console.log(
      `CONTINUOUS GAMES (isContinuous = true): ${continuousGames.length}`
    );
    console.log('═'.repeat(80));

    if (continuousGames.length === 0) {
      console.log(
        '\n⚠️  No continuous games found! This is why cron is skipping.'
      );
      console.log('   The cron query looks for: WHERE isContinuous = true');
    } else if (continuousGames.length > 1) {
      console.log(`\n⚠️  Found ${continuousGames.length} continuous games!`);
      console.log('   Cron uses findFirst() which returns the first match.');
      console.log('   This might be returning the wrong game.');
    } else {
      const game = continuousGames[0];
      if (!game) {
        console.log('\n⚠️  Unexpected: array length is 1 but game is undefined');
        return;
      }

      console.log('\n✅ Found 1 continuous game:');
      console.log(`   ID: ${game.id}`);
      console.log(`   isRunning: ${game.isRunning} (${typeof game.isRunning})`);
      console.log(
        `   isContinuous: ${game.isContinuous} (${typeof game.isContinuous})`
      );

      // Check if isRunning is actually true
      if (game.isRunning === true) {
        console.log('\n✅ isRunning is TRUE - cron should proceed');
        console.log('   If cron is still skipping, check:');
        console.log('   1. Is cron connecting to the same database?');
        console.log('   2. Are there any database connection pool issues?');
        console.log(
          '   3. Check the cron logs for the detailed game state query result'
        );
      } else if (game.isRunning === false) {
        console.log('\n❌ isRunning is FALSE - this is why cron is skipping');
        console.log(
          '   Run: UPDATE "Game" SET "isRunning" = true WHERE id = \'' +
            game.id +
            "'"
        );
      } else {
        console.log(
          `\n⚠️  isRunning has unexpected value: ${game.isRunning} (${typeof game.isRunning})`
        );
        console.log(
          '   This might be a type issue. Expected boolean true/false.'
        );
      }
    }

    // Check what findFirst would return (same query as cron)
    const cronQueryResult = await db.game.findFirst({
      where: { isContinuous: true },
    });

    console.log('\n' + '═'.repeat(80));
    console.log('CRON QUERY RESULT (findFirst where isContinuous = true):');
    console.log('═'.repeat(80));
    if (cronQueryResult) {
      console.log(`✅ Found game: ${cronQueryResult.id}`);
      console.log(
        `   isRunning: ${cronQueryResult.isRunning} (${typeof cronQueryResult.isRunning})`
      );
      console.log(
        `   Will cron proceed? ${cronQueryResult.isRunning === true ? 'YES ✅' : 'NO ❌'}`
      );
    } else {
      console.log('❌ No game found - cron will skip');
    }
  } catch (error) {
    console.error('❌ Error querying database:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
  } finally {
    await db.$disconnect();
  }
}

verifyGameState();
