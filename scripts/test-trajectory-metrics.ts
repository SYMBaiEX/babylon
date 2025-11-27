#!/usr/bin/env bun
/**
 * Test Trajectory Metrics
 *
 * Tests the metrics extractor against real trajectories from the database.
 * Validates that no metrics are null, undefined, NaN, or weird values.
 */

import { db, trajectories, desc, not, eq } from '@babylon/db';
import { trajectoryMetricsExtractor, type BehavioralMetrics } from '@babylon/training';

interface ValidationResult {
  trajectoryId: string;
  valid: boolean;
  issues: string[];
  metrics?: BehavioralMetrics;
}

/**
 * Validate a single metric value
 */
function validateMetric(
  name: string,
  value: unknown,
  constraints: {
    type?: 'number' | 'string' | 'array';
    min?: number;
    max?: number;
    finite?: boolean;
    nonNegative?: boolean;
  } = {}
): string | null {
  const { type = 'number', min, max, finite = true, nonNegative = false } = constraints;

  if (value === null || value === undefined) {
    return `${name} is ${value}`;
  }

  if (type === 'number') {
    if (typeof value !== 'number') {
      return `${name} is not a number (got ${typeof value})`;
    }
    if (finite && !Number.isFinite(value)) {
      return `${name} is not finite (got ${value})`;
    }
    if (Number.isNaN(value)) {
      return `${name} is NaN`;
    }
    if (min !== undefined && value < min) {
      return `${name} is below min (${value} < ${min})`;
    }
    if (max !== undefined && value > max) {
      return `${name} is above max (${value} > ${max})`;
    }
    if (nonNegative && value < 0) {
      return `${name} is negative (${value})`;
    }
  }

  if (type === 'string' && typeof value !== 'string') {
    return `${name} is not a string (got ${typeof value})`;
  }

  if (type === 'array' && !Array.isArray(value)) {
    return `${name} is not an array (got ${typeof value})`;
  }

  return null;
}

/**
 * Validate all metrics in a BehavioralMetrics object
 */
function validateMetrics(metrics: BehavioralMetrics): string[] {
  const issues: string[] = [];

  // Root level
  if (!metrics.trajectoryId) issues.push('Missing trajectoryId');
  if (!metrics.agentId) issues.push('Missing agentId');
  if (!(metrics.extractedAt instanceof Date)) issues.push('extractedAt is not a Date');

  // Social metrics
  const socialChecks = [
    validateMetric('social.groupChatsJoined', metrics.social.groupChatsJoined, { nonNegative: true }),
    validateMetric('social.groupChatsCreated', metrics.social.groupChatsCreated, { nonNegative: true }),
    validateMetric('social.groupMessagesSent', metrics.social.groupMessagesSent, { nonNegative: true }),
    validateMetric('social.dmsInitiated', metrics.social.dmsInitiated, { nonNegative: true }),
    validateMetric('social.dmsReceived', metrics.social.dmsReceived, { nonNegative: true }),
    validateMetric('social.dmResponseRate', metrics.social.dmResponseRate, { min: 0, max: 1 }),
    validateMetric('social.uniqueUsersInteracted', metrics.social.uniqueUsersInteracted, { nonNegative: true }),
    validateMetric('social.postsCreated', metrics.social.postsCreated, { nonNegative: true }),
    validateMetric('social.commentsMade', metrics.social.commentsMade, { nonNegative: true }),
    validateMetric('social.mentionsGiven', metrics.social.mentionsGiven, { nonNegative: true }),
    validateMetric('social.mentionsReceived', metrics.social.mentionsReceived, { nonNegative: true }),
    validateMetric('social.invitationsSent', metrics.social.invitationsSent, { nonNegative: true }),
  ];
  issues.push(...socialChecks.filter(Boolean) as string[]);

  // Trading metrics
  const tradingChecks = [
    validateMetric('trading.tradesExecuted', metrics.trading.tradesExecuted, { nonNegative: true }),
    validateMetric('trading.profitableTrades', metrics.trading.profitableTrades, { nonNegative: true }),
    validateMetric('trading.winRate', metrics.trading.winRate, { min: 0, max: 1 }),
    validateMetric('trading.totalPnL', metrics.trading.totalPnL),
    validateMetric('trading.maxDrawdown', metrics.trading.maxDrawdown, { nonNegative: true }),
    validateMetric('trading.sharpeRatio', metrics.trading.sharpeRatio),
    validateMetric('trading.avgPositionSize', metrics.trading.avgPositionSize, { nonNegative: true }),
    validateMetric('trading.avgHoldingPeriod', metrics.trading.avgHoldingPeriod, { nonNegative: true }),
    validateMetric('trading.marketsTraded', metrics.trading.marketsTraded, { nonNegative: true }),
    validateMetric('trading.buyTrades', metrics.trading.buyTrades, { nonNegative: true }),
    validateMetric('trading.sellTrades', metrics.trading.sellTrades, { nonNegative: true }),
    validateMetric('trading.largestWin', metrics.trading.largestWin),
    validateMetric('trading.largestLoss', metrics.trading.largestLoss),
  ];
  issues.push(...tradingChecks.filter(Boolean) as string[]);

  // Influence metrics
  const influenceChecks = [
    validateMetric('influence.followersGained', metrics.influence.followersGained),
    validateMetric('influence.reputationDelta', metrics.influence.reputationDelta),
    validateMetric('influence.trustLevelDelta', metrics.influence.trustLevelDelta),
    validateMetric('influence.influenceScore', metrics.influence.influenceScore),
    validateMetric('influence.informationSpread', metrics.influence.informationSpread, { nonNegative: true }),
    validateMetric('influence.positiveReactions', metrics.influence.positiveReactions, { nonNegative: true }),
    validateMetric('influence.negativeReactions', metrics.influence.negativeReactions, { nonNegative: true }),
  ];
  issues.push(...influenceChecks.filter(Boolean) as string[]);

  // Behavior metrics
  const behaviorChecks = [
    validateMetric('behavior.actionsPerTick', metrics.behavior.actionsPerTick, { nonNegative: true }),
    validateMetric('behavior.socialToTradeRatio', metrics.behavior.socialToTradeRatio, { nonNegative: true }),
    validateMetric('behavior.avgResponseTime', metrics.behavior.avgResponseTime, { nonNegative: true }),
    validateMetric('behavior.consistencyScore', metrics.behavior.consistencyScore, { min: 0, max: 1 }),
    validateMetric('behavior.totalActions', metrics.behavior.totalActions, { nonNegative: true }),
    validateMetric('behavior.failedActions', metrics.behavior.failedActions, { nonNegative: true }),
    validateMetric('behavior.actionSuccessRate', metrics.behavior.actionSuccessRate, { min: 0, max: 1 }),
    validateMetric('behavior.episodeLength', metrics.behavior.episodeLength, { nonNegative: true }),
    validateMetric('behavior.actionTypesUsed', metrics.behavior.actionTypesUsed, { type: 'array' }),
    validateMetric('behavior.dominantActionType', metrics.behavior.dominantActionType, { type: 'string' }),
  ];
  issues.push(...behaviorChecks.filter(Boolean) as string[]);

  // Information metrics
  const infoChecks = [
    validateMetric('information.researchActions', metrics.information.researchActions, { nonNegative: true }),
    validateMetric('information.newsConsumed', metrics.information.newsConsumed, { nonNegative: true }),
    validateMetric('information.marketDataQueries', metrics.information.marketDataQueries, { nonNegative: true }),
    validateMetric('information.infoRequestsSent', metrics.information.infoRequestsSent, { nonNegative: true }),
    validateMetric('information.infoShared', metrics.information.infoShared, { nonNegative: true }),
    validateMetric('information.predictionsMade', metrics.information.predictionsMade, { nonNegative: true }),
    validateMetric('information.correctPredictions', metrics.information.correctPredictions, { nonNegative: true }),
    validateMetric('information.predictionAccuracy', metrics.information.predictionAccuracy, { min: 0, max: 1 }),
  ];
  issues.push(...infoChecks.filter(Boolean) as string[]);

  return issues;
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         TRAJECTORY METRICS VALIDATION TEST                    ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Fetch some trajectories from the database
  console.log('📊 Fetching trajectories from database...');
  
  const trajResults = await db
    .select({
      trajectoryId: trajectories.trajectoryId,
      agentId: trajectories.agentId,
      stepsJson: trajectories.stepsJson,
      scenarioId: trajectories.scenarioId,
      finalPnL: trajectories.finalPnL,
    })
    .from(trajectories)
    .where(
      not(eq(trajectories.stepsJson, 'null'))
    )
    .orderBy(desc(trajectories.createdAt))
    .limit(50);

  if (trajResults.length === 0) {
    console.log('\n⚠️  No trajectories found in database.');
    console.log('   Run some simulations first to generate trajectory data.\n');
    process.exit(0);
  }

  console.log(`   Found ${trajResults.length} trajectories to test\n`);

  const results: ValidationResult[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let nullCount = 0;

  for (const traj of trajResults) {
    // Skip empty/null steps
    if (!traj.stepsJson || traj.stepsJson === '[]' || traj.stepsJson === 'null') {
      nullCount++;
      continue;
    }

    const metrics = trajectoryMetricsExtractor.extractFromRaw({
      trajectoryId: traj.trajectoryId,
      agentId: traj.agentId,
      stepsJson: traj.stepsJson,
      scenarioId: traj.scenarioId || undefined,
      finalPnL: traj.finalPnL || undefined,
    });

    if (!metrics) {
      invalidCount++;
      results.push({
        trajectoryId: traj.trajectoryId,
        valid: false,
        issues: ['Failed to extract metrics (returned null)'],
      });
      continue;
    }

    const issues = validateMetrics(metrics);

    if (issues.length === 0) {
      validCount++;
      results.push({
        trajectoryId: traj.trajectoryId,
        valid: true,
        issues: [],
        metrics,
      });
    } else {
      invalidCount++;
      results.push({
        trajectoryId: traj.trajectoryId,
        valid: false,
        issues,
        metrics,
      });
    }
  }

  // Print results
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                         RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`   ✅ Valid:    ${validCount}`);
  console.log(`   ❌ Invalid:  ${invalidCount}`);
  console.log(`   ⏭️  Skipped:  ${nullCount} (empty/null steps)\n`);

  // Show sample of valid metrics
  const validResults = results.filter((r) => r.valid && r.metrics);
  if (validResults.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                   SAMPLE VALID METRICS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const sample = validResults[0]!;
    if (sample.metrics) {
      console.log(`Trajectory: ${sample.trajectoryId}\n`);
      console.log('Social:');
      console.log(`  - Unique Users Interacted: ${sample.metrics.social.uniqueUsersInteracted}`);
      console.log(`  - Group Chats Joined: ${sample.metrics.social.groupChatsJoined}`);
      console.log(`  - DMs Initiated: ${sample.metrics.social.dmsInitiated}`);
      console.log(`  - Posts Created: ${sample.metrics.social.postsCreated}`);

      console.log('\nTrading:');
      console.log(`  - Trades Executed: ${sample.metrics.trading.tradesExecuted}`);
      console.log(`  - Win Rate: ${(sample.metrics.trading.winRate * 100).toFixed(1)}%`);
      console.log(`  - Total P&L: $${sample.metrics.trading.totalPnL.toFixed(2)}`);
      console.log(`  - Markets Traded: ${sample.metrics.trading.marketsTraded}`);

      console.log('\nBehavior:');
      console.log(`  - Total Actions: ${sample.metrics.behavior.totalActions}`);
      console.log(`  - Action Success Rate: ${(sample.metrics.behavior.actionSuccessRate * 100).toFixed(1)}%`);
      console.log(`  - Social to Trade Ratio: ${sample.metrics.behavior.socialToTradeRatio.toFixed(2)}`);
      console.log(`  - Dominant Action: ${sample.metrics.behavior.dominantActionType || 'none'}`);
      console.log(`  - Action Types Used: ${sample.metrics.behavior.actionTypesUsed.join(', ') || 'none'}`);

      console.log('\nInfluence:');
      console.log(`  - Reputation Delta: ${sample.metrics.influence.reputationDelta}`);
      console.log(`  - Followers Gained: ${sample.metrics.influence.followersGained}`);
      console.log(`  - Influence Score: ${sample.metrics.influence.influenceScore}`);

      console.log('\nInformation:');
      console.log(`  - Predictions Made: ${sample.metrics.information.predictionsMade}`);
      console.log(`  - Prediction Accuracy: ${(sample.metrics.information.predictionAccuracy * 100).toFixed(1)}%`);
    }
  }

  // Show invalid results
  const invalidResults = results.filter((r) => !r.valid);
  if (invalidResults.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                      INVALID METRICS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const result of invalidResults.slice(0, 5)) {
      console.log(`❌ ${result.trajectoryId}`);
      for (const issue of result.issues) {
        console.log(`   - ${issue}`);
      }
      console.log('');
    }

    if (invalidResults.length > 5) {
      console.log(`... and ${invalidResults.length - 5} more invalid trajectories\n`);
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                        SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const successRate = ((validCount / (validCount + invalidCount)) * 100).toFixed(1);
  
  if (invalidCount === 0) {
    console.log('✅ All metrics validated successfully!\n');
    console.log(`   ${validCount} trajectories passed validation`);
    console.log(`   No null, undefined, NaN, or invalid values found\n`);
  } else {
    console.log(`⚠️  ${successRate}% success rate (${validCount}/${validCount + invalidCount})\n`);
    console.log('   Review the invalid metrics above to identify issues.\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

