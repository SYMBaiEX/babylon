#!/usr/bin/env bun
/**
 * Cleanup Excess Active Markets
 *
 * Marks excess active markets as inactive, keeping only the most recent
 * markets per timeframe slot according to MARKET_STRUCTURE configuration.
 *
 * This script is a remediation tool for the bug where markets-tick was
 * creating hundreds of markets instead of maintaining exactly 10.
 *
 * Usage:
 *   bun run scripts/cleanup-excess-markets.ts           # Show current state
 *   bun run scripts/cleanup-excess-markets.ts --fix     # Fix excess markets
 *   bun run scripts/cleanup-excess-markets.ts --dry-run # Show what would be fixed
 */

import {
  and,
  closeDatabase,
  db,
  desc,
  eq,
  isNotNull,
  isNull,
  questions,
  timeframedMarkets,
} from '@babylon/db';
import { logger } from '@babylon/shared';

// Market structure configuration - must match markets-tick/route.ts
const MARKET_STRUCTURE: Record<string, { count: number; label: string }> = {
  '3d': { count: 1, label: '3-day' },
  '2d': { count: 1, label: '2-day' },
  '1d': { count: 1, label: '1-day' },
  '12h': { count: 1, label: '12-hour' },
  '6h': { count: 1, label: '6-hour' },
  '1h': { count: 1, label: '1-hour' },
  '30m': { count: 2, label: '30-minute' },
  '15m': { count: 2, label: '15-minute' },
};

// Sub-market configuration - max 10 sub-markets
const MAX_SUB_MARKETS = 10;

const EXPECTED_TOTAL = Object.values(MARKET_STRUCTURE).reduce(
  (sum, config) => sum + config.count,
  0
);

const EXPECTED_TOTAL_WITH_SUBS = EXPECTED_TOTAL + MAX_SUB_MARKETS;

interface MarketInfo {
  id: string;
  questionId: string | null;
  timeframe: string;
  startTime: Date;
  endTime: Date;
  parentMarketId: string | null;
}

/**
 * Get active MAIN markets (no parentMarketId) grouped by timeframe
 */
async function getActiveMainMarketsByTimeframe(): Promise<
  Record<string, MarketInfo[]>
> {
  const activeMarkets = await db
    .select({
      id: timeframedMarkets.id,
      questionId: timeframedMarkets.questionId,
      timeframe: timeframedMarkets.timeframe,
      startTime: timeframedMarkets.startTime,
      endTime: timeframedMarkets.endTime,
      parentMarketId: timeframedMarkets.parentMarketId,
    })
    .from(timeframedMarkets)
    .where(
      and(
        eq(timeframedMarkets.isActive, true),
        isNull(timeframedMarkets.parentMarketId)
      )
    )
    .orderBy(desc(timeframedMarkets.startTime));

  const grouped: Record<string, MarketInfo[]> = {};

  for (const m of activeMarkets) {
    const tf = m.timeframe;
    if (!grouped[tf]) {
      grouped[tf] = [];
    }
    grouped[tf]!.push(m);
  }

  return grouped;
}

/**
 * Get active SUB-markets (have parentMarketId)
 */
async function getActiveSubMarkets(): Promise<MarketInfo[]> {
  return db
    .select({
      id: timeframedMarkets.id,
      questionId: timeframedMarkets.questionId,
      timeframe: timeframedMarkets.timeframe,
      startTime: timeframedMarkets.startTime,
      endTime: timeframedMarkets.endTime,
      parentMarketId: timeframedMarkets.parentMarketId,
    })
    .from(timeframedMarkets)
    .where(
      and(
        eq(timeframedMarkets.isActive, true),
        isNotNull(timeframedMarkets.parentMarketId)
      )
    )
    .orderBy(desc(timeframedMarkets.startTime));
}


async function displayCurrentState(): Promise<{
  total: number;
  excess: number;
  subMarketExcess: number;
  byTimeframe: Record<string, { current: number; expected: number }>;
}> {
  const activeMainMarkets = await getActiveMainMarketsByTimeframe();
  const activeSubMarkets = await getActiveSubMarkets();

  console.log('\n📊 Current Active MAIN Market Distribution');
  console.log('='.repeat(60));

  let total = 0;
  let excess = 0;
  const byTimeframe: Record<string, { current: number; expected: number }> = {};

  for (const [timeframe, config] of Object.entries(MARKET_STRUCTURE)) {
    const current = activeMainMarkets[timeframe]?.length || 0;
    const expected = config.count;
    const diff = current - expected;
    total += current;

    byTimeframe[timeframe] = { current, expected };

    const status =
      diff > 0 ? `⚠️  +${diff} excess` : diff < 0 ? `⚠️  ${diff} missing` : '✅';
    console.log(
      `  ${config.label.padEnd(12)} (${timeframe}): ${current}/${expected} ${status}`
    );

    if (diff > 0) {
      excess += diff;
    }
  }

  // Check for orphaned timeframes not in MARKET_STRUCTURE
  for (const [timeframe, markets] of Object.entries(activeMainMarkets)) {
    if (!MARKET_STRUCTURE[timeframe]) {
      console.log(
        `  Unknown     (${timeframe}): ${markets.length}/0 ⚠️  +${markets.length} orphaned`
      );
      excess += markets.length;
      total += markets.length;
    }
  }

  console.log('-'.repeat(60));
  console.log(`  Main Markets Total: ${total}/${EXPECTED_TOTAL}`);

  // Display sub-markets
  console.log('\n📊 Current Active SUB-MARKETS');
  console.log('='.repeat(60));
  const subMarketCount = activeSubMarkets.length;
  const subMarketExcess = Math.max(0, subMarketCount - MAX_SUB_MARKETS);
  const subStatus = subMarketExcess > 0 ? `⚠️  +${subMarketExcess} excess` : '✅';
  console.log(`  Sub-markets: ${subMarketCount}/${MAX_SUB_MARKETS} ${subStatus}`);

  console.log('-'.repeat(60));
  const grandTotal = total + subMarketCount;
  console.log(`  Grand Total: ${grandTotal}/${EXPECTED_TOTAL_WITH_SUBS}`);

  const totalExcess = excess + subMarketExcess;

  if (totalExcess > 0) {
    console.log(`\n⚠️  Found ${totalExcess} excess markets that should be deactivated`);
    if (excess > 0) console.log(`    - ${excess} excess main markets`);
    if (subMarketExcess > 0) console.log(`    - ${subMarketExcess} excess sub-markets`);
  } else if (total < EXPECTED_TOTAL) {
    console.log(
      `\n⚠️  Missing ${EXPECTED_TOTAL - total} main markets - run markets-tick to create them`
    );
  } else {
    console.log('\n✅ Market count is correct!');
  }

  return { total, excess, subMarketExcess, byTimeframe };
}

async function fixExcessMarkets(dryRun: boolean): Promise<void> {
  const activeMainMarkets = await getActiveMainMarketsByTimeframe();
  const activeSubMarkets = await getActiveSubMarkets();

  console.log(
    `\n${dryRun ? '🔍 DRY RUN - ' : '🔧 '}Fixing excess markets...`
  );
  console.log('='.repeat(60));

  let totalDeactivated = 0;

  // Fix excess main markets
  console.log('\n  MAIN MARKETS:');

  for (const [timeframe, config] of Object.entries(MARKET_STRUCTURE)) {
    const markets = activeMainMarkets[timeframe] || [];
    const expected = config.count;
    const excess = markets.length - expected;

    if (excess <= 0) continue;

    // Markets are already sorted by startTime DESC, so we keep the newest ones
    const marketsToDeactivate = markets.slice(expected);

    console.log(
      `\n  ${config.label} (${timeframe}): Deactivating ${marketsToDeactivate.length} excess markets`
    );

    for (const market of marketsToDeactivate) {
      console.log(
        `    - ${market.id} (started: ${market.startTime.toISOString()})`
      );

      if (!dryRun) {
        // Deactivate the timeframed market
        await db
          .update(timeframedMarkets)
          .set({
            isActive: false,
            isResolved: true,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(timeframedMarkets.id, market.id));

        // Also update the associated question status if exists
        if (market.questionId) {
          await db
            .update(questions)
            .set({
              status: 'resolved',
              updatedAt: new Date(),
            })
            .where(eq(questions.id, market.questionId));
        }
      }

      totalDeactivated++;
    }
  }

  // Handle orphaned timeframes (main markets with unknown timeframes)
  for (const [timeframe, markets] of Object.entries(activeMainMarkets)) {
    if (MARKET_STRUCTURE[timeframe]) continue;

    console.log(
      `\n  Unknown (${timeframe}): Deactivating all ${markets.length} orphaned markets`
    );

    for (const market of markets) {
      console.log(
        `    - ${market.id} (started: ${market.startTime.toISOString()})`
      );

      if (!dryRun) {
        await db
          .update(timeframedMarkets)
          .set({
            isActive: false,
            isResolved: true,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(timeframedMarkets.id, market.id));

        if (market.questionId) {
          await db
            .update(questions)
            .set({
              status: 'resolved',
              updatedAt: new Date(),
            })
            .where(eq(questions.id, market.questionId));
        }
      }

      totalDeactivated++;
    }
  }

  // Fix excess sub-markets (keep only the 10 most recent)
  console.log('\n  SUB-MARKETS:');
  
  const subMarketExcess = activeSubMarkets.length - MAX_SUB_MARKETS;
  if (subMarketExcess > 0) {
    // Sub-markets are already sorted by startTime DESC, so we keep the newest ones
    const subMarketsToDeactivate = activeSubMarkets.slice(MAX_SUB_MARKETS);

    console.log(
      `\n  Deactivating ${subMarketsToDeactivate.length} excess sub-markets (keeping ${MAX_SUB_MARKETS} most recent)`
    );

    for (const market of subMarketsToDeactivate) {
      console.log(
        `    - ${market.id} (started: ${market.startTime.toISOString()}, parent: ${market.parentMarketId})`
      );

      if (!dryRun) {
        await db
          .update(timeframedMarkets)
          .set({
            isActive: false,
            isResolved: true,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(timeframedMarkets.id, market.id));

        if (market.questionId) {
          await db
            .update(questions)
            .set({
              status: 'resolved',
              updatedAt: new Date(),
            })
            .where(eq(questions.id, market.questionId));
        }
      }

      totalDeactivated++;
    }
  } else {
    console.log(`\n  No excess sub-markets (${activeSubMarkets.length}/${MAX_SUB_MARKETS})`);
  }

  console.log('\n' + '-'.repeat(60));
  if (dryRun) {
    console.log(`  Would deactivate: ${totalDeactivated} markets`);
    console.log('\n  Run with --fix to apply changes');
  } else {
    console.log(`  Deactivated: ${totalDeactivated} markets`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const dryRun = args.includes('--dry-run');

  console.log('\n🧹 Cleanup Excess Active Markets');
  console.log('='.repeat(60));
  console.log(`  Expected main markets: ${EXPECTED_TOTAL}`);
  console.log(`  Expected sub-markets: ${MAX_SUB_MARKETS}`);
  console.log(`  Expected total: ${EXPECTED_TOTAL_WITH_SUBS}`);
  console.log('  Market structure:');
  for (const [tf, config] of Object.entries(MARKET_STRUCTURE)) {
    console.log(`    ${config.label.padEnd(12)} (${tf}): ${config.count}`);
  }

  try {
    const state = await displayCurrentState();
    const totalExcess = state.excess + state.subMarketExcess;

    if (shouldFix || dryRun) {
      if (totalExcess > 0) {
        await fixExcessMarkets(dryRun);
      } else {
        console.log('\n✅ No excess markets to fix');
      }
    } else if (totalExcess > 0) {
      console.log('\n💡 To fix, run with --dry-run to preview or --fix to apply');
    }

    // Show final state if we made changes
    if (shouldFix && totalExcess > 0) {
      console.log('\n📊 Final State:');
      await displayCurrentState();
    }
  } catch (error) {
    logger.error(
      'Script failed',
      { error: error instanceof Error ? error.message : String(error) },
      'CleanupMarkets'
    );
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main().catch(console.error);
