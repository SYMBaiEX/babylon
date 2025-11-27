#!/usr/bin/env bun
/**
 * Multi-Archetype Benchmark Comparison
 *
 * Runs all archetypes together in a shared environment and compares
 * their performance. Key insight: agents need to interact, so we run
 * one agent of each archetype together.
 *
 * Usage:
 *   bun run scripts/benchmark-archetypes.ts
 */

import { db, trajectories, desc, and, eq, not, gte } from '@babylon/db';
import { trajectoryMetricsExtractor, type BehavioralMetrics } from '@babylon/training';
import { getAvailableArchetypes, getRubric } from '../packages/training/src/rubrics';

// ============================================================================
// Types
// ============================================================================

interface ArchetypeBenchmarkResult {
  archetype: string;
  trajectoryCount: number;
  avgPnL: number;
  avgWinRate: number;
  avgSocialScore: number;
  avgInfluenceScore: number;
  avgActionsPerTick: number;
  totalTrades: number;
  totalSocialActions: number;
  uniqueUsersInteracted: number;
  consistencyScore: number;
  overallScore: number; // Combined score based on archetype-specific rubric
}

interface ComparisonReport {
  runAt: Date;
  archetypes: ArchetypeBenchmarkResult[];
  interactions: {
    totalDMs: number;
    totalPosts: number;
    totalGroupChats: number;
    scamAttempts: number;
  };
  rankings: {
    byPnL: string[];
    bySocial: string[];
    byInfluence: string[];
    byOverall: string[];
  };
}

// ============================================================================
// Scoring Functions
// ============================================================================

function calculateArchetypeScore(
  archetype: string,
  metrics: BehavioralMetrics
): number {
  // Get priority based on archetype
  switch (archetype) {
    case 'trader':
    case 'perps-trader':
      // Traders: P&L and win rate matter most
      return (
        normalizeMetric(metrics.trading.totalPnL, -1000, 1000) * 0.4 +
        metrics.trading.winRate * 0.3 +
        (1 - Math.min(metrics.behavior.socialToTradeRatio / 5, 1)) * 0.2 +
        metrics.trading.sharpeRatio * 0.1
      );

    case 'social-butterfly':
    case 'ass-kisser':
      // Social agents: connections and engagement matter
      return (
        normalizeMetric(metrics.social.uniqueUsersInteracted, 0, 20) * 0.4 +
        normalizeMetric(metrics.social.dmsInitiated + metrics.social.groupChatsJoined, 0, 20) * 0.3 +
        normalizeMetric(metrics.social.postsCreated, 0, 10) * 0.2 +
        normalizeMetric(metrics.influence.reputationDelta, -50, 50) * 0.1
      );

    case 'scammer':
    case 'liar':
      // Scammers: P&L from deception, influence
      return (
        normalizeMetric(metrics.trading.totalPnL, -500, 2000) * 0.35 +
        normalizeMetric(metrics.influence.influenceScore, -10, 20) * 0.25 +
        normalizeMetric(metrics.social.uniqueUsersInteracted, 0, 15) * 0.2 +
        normalizeMetric(metrics.information.infoShared, 0, 10) * 0.2
      );

    case 'degen':
      // Degens: High variance trading, many trades
      const variance = Math.abs(metrics.trading.largestWin) + Math.abs(metrics.trading.largestLoss);
      return (
        normalizeMetric(variance, 0, 2000) * 0.3 +
        normalizeMetric(metrics.trading.tradesExecuted, 0, 50) * 0.3 +
        normalizeMetric(metrics.trading.totalPnL, -2000, 2000) * 0.25 +
        metrics.behavior.actionsPerTick * 0.15
      );

    case 'researcher':
    case 'super-predictor':
      // Researchers: Accuracy and quality over quantity
      return (
        metrics.information.predictionAccuracy * 0.35 +
        metrics.trading.winRate * 0.25 +
        normalizeMetric(metrics.information.researchActions, 0, 20) * 0.2 +
        normalizeMetric(metrics.trading.totalPnL, -500, 1000) * 0.2
      );

    case 'goody-twoshoes':
      // Good agents: Reputation, trust, helpfulness
      return (
        normalizeMetric(metrics.influence.reputationDelta, -20, 50) * 0.35 +
        normalizeMetric(metrics.information.infoShared, 0, 15) * 0.25 +
        normalizeMetric(metrics.influence.positiveReactions, 0, 20) * 0.2 +
        normalizeMetric(metrics.social.postsCreated, 0, 10) * 0.2
      );

    case 'information-trader':
      // Info traders: Balance of social intel and trading
      const balanceScore = 1 - Math.abs(metrics.behavior.socialToTradeRatio - 1);
      return (
        normalizeMetric(metrics.trading.totalPnL, -500, 1000) * 0.3 +
        normalizeMetric(metrics.social.groupChatsJoined + metrics.social.dmsInitiated, 0, 15) * 0.25 +
        balanceScore * 0.25 +
        metrics.trading.winRate * 0.2
      );

    case 'infosec':
      // Infosec: Avoiding losses, skepticism
      const avoidedLosses = metrics.trading.totalPnL >= 0 ? 1 : 0.5;
      return (
        avoidedLosses * 0.4 +
        normalizeMetric(metrics.information.researchActions, 0, 15) * 0.25 +
        (1 - normalizeMetric(metrics.behavior.failedActions, 0, 10)) * 0.2 +
        metrics.behavior.consistencyScore * 0.15
      );

    default:
      // Default: Balanced scoring
      return (
        normalizeMetric(metrics.trading.totalPnL, -1000, 1000) * 0.3 +
        metrics.trading.winRate * 0.2 +
        normalizeMetric(metrics.social.uniqueUsersInteracted, 0, 15) * 0.2 +
        metrics.behavior.actionSuccessRate * 0.15 +
        metrics.behavior.consistencyScore * 0.15
      );
  }
}

function normalizeMetric(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

// ============================================================================
// Data Loading
// ============================================================================

async function loadArchetypeTrajectories(): Promise<Map<string, BehavioralMetrics[]>> {
  const archetypeMetrics = new Map<string, BehavioralMetrics[]>();
  const archetypes = getAvailableArchetypes();

  console.log('📊 Loading trajectories for each archetype...\n');

  for (const archetype of archetypes) {
    // Load trajectories for this archetype
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
        and(
          not(eq(trajectories.stepsJson, 'null')),
          not(eq(trajectories.stepsJson, '[]')),
          eq(trajectories.scenarioId, `multi-archetype-${archetype}`)
        )
      )
      .orderBy(desc(trajectories.createdAt))
      .limit(20);

    const metricsList: BehavioralMetrics[] = [];

    for (const traj of trajResults) {
      if (!traj.stepsJson) continue;

      const metrics = trajectoryMetricsExtractor.extractFromRaw({
        trajectoryId: traj.trajectoryId,
        agentId: traj.agentId,
        stepsJson: traj.stepsJson,
        scenarioId: traj.scenarioId || undefined,
        finalPnL: traj.finalPnL || undefined,
      });

      if (metrics) {
        metricsList.push(metrics);
      }
    }

    archetypeMetrics.set(archetype, metricsList);
    console.log(`   ${archetype.padEnd(20)} ${metricsList.length} trajectories`);
  }

  return archetypeMetrics;
}

// ============================================================================
// Benchmark Analysis
// ============================================================================

function analyzeArchetype(
  archetype: string,
  metricsList: BehavioralMetrics[]
): ArchetypeBenchmarkResult {
  if (metricsList.length === 0) {
    return {
      archetype,
      trajectoryCount: 0,
      avgPnL: 0,
      avgWinRate: 0,
      avgSocialScore: 0,
      avgInfluenceScore: 0,
      avgActionsPerTick: 0,
      totalTrades: 0,
      totalSocialActions: 0,
      uniqueUsersInteracted: 0,
      consistencyScore: 0,
      overallScore: 0,
    };
  }

  const avgPnL = metricsList.reduce((sum, m) => sum + m.trading.totalPnL, 0) / metricsList.length;
  const avgWinRate = metricsList.reduce((sum, m) => sum + m.trading.winRate, 0) / metricsList.length;
  const avgSocialScore = metricsList.reduce(
    (sum, m) => sum + m.social.uniqueUsersInteracted + m.social.dmsInitiated + m.social.groupChatsJoined,
    0
  ) / metricsList.length;
  const avgInfluenceScore = metricsList.reduce((sum, m) => sum + m.influence.influenceScore, 0) / metricsList.length;
  const avgActionsPerTick = metricsList.reduce((sum, m) => sum + m.behavior.actionsPerTick, 0) / metricsList.length;

  const totalTrades = metricsList.reduce((sum, m) => sum + m.trading.tradesExecuted, 0);
  const totalSocialActions = metricsList.reduce(
    (sum, m) => sum + m.social.postsCreated + m.social.dmsInitiated + m.social.groupChatsJoined,
    0
  );
  const uniqueUsersInteracted = metricsList.reduce((sum, m) => sum + m.social.uniqueUsersInteracted, 0);
  const consistencyScore = metricsList.reduce((sum, m) => sum + m.behavior.consistencyScore, 0) / metricsList.length;

  // Calculate overall score using archetype-specific rubric
  const overallScore = metricsList.reduce(
    (sum, m) => sum + calculateArchetypeScore(archetype, m),
    0
  ) / metricsList.length;

  return {
    archetype,
    trajectoryCount: metricsList.length,
    avgPnL,
    avgWinRate,
    avgSocialScore,
    avgInfluenceScore,
    avgActionsPerTick,
    totalTrades,
    totalSocialActions,
    uniqueUsersInteracted,
    consistencyScore,
    overallScore,
  };
}

function generateRankings(results: ArchetypeBenchmarkResult[]): ComparisonReport['rankings'] {
  const byPnL = [...results]
    .filter((r) => r.trajectoryCount > 0)
    .sort((a, b) => b.avgPnL - a.avgPnL)
    .map((r) => r.archetype);

  const bySocial = [...results]
    .filter((r) => r.trajectoryCount > 0)
    .sort((a, b) => b.avgSocialScore - a.avgSocialScore)
    .map((r) => r.archetype);

  const byInfluence = [...results]
    .filter((r) => r.trajectoryCount > 0)
    .sort((a, b) => b.avgInfluenceScore - a.avgInfluenceScore)
    .map((r) => r.archetype);

  const byOverall = [...results]
    .filter((r) => r.trajectoryCount > 0)
    .sort((a, b) => b.overallScore - a.overallScore)
    .map((r) => r.archetype);

  return { byPnL, bySocial, byInfluence, byOverall };
}

// ============================================================================
// Reporting
// ============================================================================

function printReport(report: ComparisonReport): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MULTI-ARCHETYPE BENCHMARK REPORT                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  console.log(`Generated: ${report.runAt.toISOString()}\n`);

  // Summary table
  console.log('┌' + '─'.repeat(110) + '┐');
  console.log('│ ' + 'ARCHETYPE'.padEnd(20) + ' │ ' + 
    'TRAJS'.padEnd(6) + ' │ ' +
    'AVG P&L'.padEnd(12) + ' │ ' +
    'WIN RATE'.padEnd(10) + ' │ ' +
    'SOCIAL'.padEnd(8) + ' │ ' +
    'INFLUENCE'.padEnd(10) + ' │ ' +
    'OVERALL'.padEnd(10) + ' │ ' +
    'RANK'.padEnd(5) + '│');
  console.log('├' + '─'.repeat(110) + '┤');

  const sorted = [...report.archetypes].sort((a, b) => b.overallScore - a.overallScore);

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (r.trajectoryCount === 0) continue;

    const pnlColor = r.avgPnL >= 0 ? '\x1b[32m' : '\x1b[31m';
    const pnlStr = `${r.avgPnL >= 0 ? '+' : ''}$${r.avgPnL.toFixed(0)}`;

    console.log('│ ' + 
      r.archetype.padEnd(20) + ' │ ' +
      String(r.trajectoryCount).padEnd(6) + ' │ ' +
      `${pnlColor}${pnlStr.padEnd(12)}\x1b[0m` + ' │ ' +
      `${(r.avgWinRate * 100).toFixed(1)}%`.padEnd(10) + ' │ ' +
      r.avgSocialScore.toFixed(1).padEnd(8) + ' │ ' +
      r.avgInfluenceScore.toFixed(1).padEnd(10) + ' │ ' +
      `${(r.overallScore * 100).toFixed(1)}%`.padEnd(10) + ' │ ' +
      `#${i + 1}`.padEnd(5) + '│');
  }

  console.log('└' + '─'.repeat(110) + '┘');

  // Rankings
  console.log('\n📊 RANKINGS BY CATEGORY\n');

  console.log('💰 By P&L:');
  report.rankings.byPnL.slice(0, 5).forEach((arch, i) => {
    const result = report.archetypes.find((r) => r.archetype === arch);
    console.log(`   ${i + 1}. ${arch} ($${result?.avgPnL.toFixed(0)})`);
  });

  console.log('\n🤝 By Social Activity:');
  report.rankings.bySocial.slice(0, 5).forEach((arch, i) => {
    const result = report.archetypes.find((r) => r.archetype === arch);
    console.log(`   ${i + 1}. ${arch} (${result?.avgSocialScore.toFixed(1)} score)`);
  });

  console.log('\n📢 By Influence:');
  report.rankings.byInfluence.slice(0, 5).forEach((arch, i) => {
    const result = report.archetypes.find((r) => r.archetype === arch);
    console.log(`   ${i + 1}. ${arch} (${result?.avgInfluenceScore.toFixed(1)} score)`);
  });

  console.log('\n🏆 OVERALL (Archetype-Weighted):');
  report.rankings.byOverall.forEach((arch, i) => {
    const result = report.archetypes.find((r) => r.archetype === arch);
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    console.log(`   ${medal} ${i + 1}. ${arch} (${((result?.overallScore || 0) * 100).toFixed(1)}%)`);
  });

  // Insights
  console.log('\n📝 INSIGHTS\n');

  const bestTrader = report.rankings.byPnL[0];
  const mostSocial = report.rankings.bySocial[0];
  const mostInfluential = report.rankings.byInfluence[0];

  console.log(`• Best trader: ${bestTrader} with highest average P&L`);
  console.log(`• Most social: ${mostSocial} with most connections and activity`);
  console.log(`• Most influential: ${mostInfluential} with highest influence score`);

  // Check archetype-specific performance
  const scammerResult = report.archetypes.find((r) => r.archetype === 'scammer');
  const goodyResult = report.archetypes.find((r) => r.archetype === 'goody-twoshoes');

  if (scammerResult && goodyResult) {
    if (scammerResult.avgPnL > goodyResult.avgPnL) {
      console.log(`• ⚠️  Scammers outperformed honest agents in P&L`);
    } else {
      console.log(`• ✅ Honest agents outperformed scammers`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         MULTI-ARCHETYPE BENCHMARK COMPARISON                  ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Load all archetype trajectories
  const archetypeMetrics = await loadArchetypeTrajectories();

  // Analyze each archetype
  console.log('\n🔬 Analyzing archetype performance...\n');

  const results: ArchetypeBenchmarkResult[] = [];

  for (const [archetype, metricsList] of archetypeMetrics.entries()) {
    const result = analyzeArchetype(archetype, metricsList);
    results.push(result);
  }

  // Generate rankings
  const rankings = generateRankings(results);

  // Calculate interaction stats
  let totalDMs = 0;
  let totalPosts = 0;
  let totalGroupChats = 0;

  for (const metricsList of archetypeMetrics.values()) {
    for (const m of metricsList) {
      totalDMs += m.social.dmsInitiated;
      totalPosts += m.social.postsCreated;
      totalGroupChats += m.social.groupChatsJoined;
    }
  }

  // Build report
  const report: ComparisonReport = {
    runAt: new Date(),
    archetypes: results,
    interactions: {
      totalDMs,
      totalPosts,
      totalGroupChats,
      scamAttempts: 0, // Would need to track this separately
    },
    rankings,
  };

  // Print report
  printReport(report);

  // Check if we have enough data
  const totalTrajectories = results.reduce((sum, r) => sum + r.trajectoryCount, 0);
  if (totalTrajectories === 0) {
    console.log(`
⚠️  NO TRAJECTORY DATA FOUND!

Run the trajectory generator first:
  bun run scripts/generate-archetype-trajectories.ts --episodes=5
    `);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

