#!/usr/bin/env bun

/**
 * Extreme Stress Test - 100k CCU
 *
 * Simulates 100,000 concurrent users to identify scaling bottlenecks
 * and architectural limitations.
 *
 * WARNING: This will generate massive load. Only run against:
 * - Local environment with understanding of system impact
 * - Never against production without approval
 * - Staging only with explicit permission
 *
 * Usage:
 *   bun run scripts/load-test/extreme-stress-test.ts [environment]
 */

import { logger } from '@/lib/logger';
import { performanceMonitor } from '@/lib/monitoring/performance-monitor';
import {
  type EnhancedLoadTestConfig,
  EnhancedLoadTestSimulator,
} from '@/lib/testing/enhanced-load-test-simulator';

// Parse arguments
const args = process.argv.slice(2);
const environment = args[0] || 'local';

const ENVIRONMENT_URLS: Record<string, string> = {
  local: 'http://localhost:3000',
  staging: process.env.STAGING_URL || 'https://staging.babylon.market',
};

const baseUrlRaw = ENVIRONMENT_URLS[environment];
if (!baseUrlRaw) {
  console.error(`Invalid environment: ${environment}`);
  process.exit(1);
}
const baseUrl: string = baseUrlRaw;

// 100k CCU test configuration
// SAFE: Gradual waves with resource protection to prevent system crashes
const TEST_WAVES = [
  { name: 'Wave 1: 1k CCU', users: 1000, duration: 30 },
  { name: 'Wave 2: 2.5k CCU', users: 2500, duration: 30 },
  { name: 'Wave 3: 5k CCU', users: 5000, duration: 30 },
  { name: 'Wave 4: 10k CCU', users: 10000, duration: 60 },
  { name: 'Wave 5: 25k CCU', users: 25000, duration: 60 },
  { name: 'Wave 6: 50k CCU', users: 50000, duration: 60 },
  { name: 'Wave 7: 100k CCU', users: 100000, duration: 120 },
];

// Realistic endpoint distribution for high traffic
const REALISTIC_ENDPOINTS: EnhancedLoadTestConfig['endpoints'] = [
  // Read-heavy endpoints (80% of traffic)
  { path: '/api/posts', method: 'GET', weight: 0.25 },
  { path: '/api/leaderboard', method: 'GET', weight: 0.15 },
  { path: '/api/feed/widgets/trending-posts', method: 'GET', weight: 0.12 },
  { path: '/api/feed/widgets/markets', method: 'GET', weight: 0.1 },
  { path: '/api/actors', method: 'GET', weight: 0.08 },
  { path: '/api/agents', method: 'GET', weight: 0.1 },

  // Write operations (20% of traffic)
  { path: '/api/notifications', method: 'GET', weight: 0.08 },
  { path: '/api/users/me', method: 'GET', weight: 0.07 },
  { path: '/api/chats', method: 'GET', weight: 0.05 },
];

interface WaveResult {
  wave: string;
  users: number;
  totalRequests: number;
  successRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number;
  errors: number;
  bottlenecks: number;
  criticalIssues: number;
  systemBreakdown: boolean;
}

async function main() {
  console.log(
    '╔═══════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║         EXTREME STRESS TEST - 100k CCU                       ║'
  );
  console.log(
    '║                   ⚠️  CAUTION ⚠️                              ║'
  );
  console.log(
    '╚═══════════════════════════════════════════════════════════════╝'
  );
  console.log(`\nEnvironment: ${environment}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Start Time: ${new Date().toISOString()}`);
  console.log(`Total Waves: ${TEST_WAVES.length}`);
  console.log('Max Concurrent Users: 100,000\n');

  // Confirm before proceeding
  if (environment === 'staging' || environment === 'production') {
    console.log(
      '⚠️  WARNING: This will generate EXTREME load on a remote server!'
    );
    console.log('   This test should only be run with explicit approval.\n');
    console.log(
      '   Press Ctrl+C to cancel or wait 10 seconds to continue...\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  // Check server
  console.log('🔍 Checking server availability...');
  try {
    const response = await fetch(baseUrl);
    console.log(`✅ Server responding (status: ${response.status})\n`);
  } catch (error) {
    console.error('❌ Could not connect to server');
    console.error(`   Make sure the server is running at ${baseUrl}`);
    process.exit(1);
  }

  const waveResults: WaveResult[] = [];
  const simulator = new EnhancedLoadTestSimulator(baseUrl);
  let systemBroke = false;

  // Run test waves
  for (const wave of TEST_WAVES) {
    if (systemBroke) {
      console.log(`\n⚠️  Skipping ${wave.name} - system breakdown detected\n`);
      continue;
    }

    console.log(
      '\n═══════════════════════════════════════════════════════════════'
    );
    console.log(`  ${wave.name.toUpperCase()}`);
    console.log(
      '═══════════════════════════════════════════════════════════════\n'
    );
    console.log(`Concurrent Users: ${wave.users.toLocaleString()}`);
    console.log(`Duration: ${wave.duration}s`);
    console.log(
      `Expected Peak RPS: ~${Math.floor(wave.users / 2).toLocaleString()}\n`
    );

    const config: EnhancedLoadTestConfig = {
      testType: 'mixed',
      concurrentUsers: wave.users,
      durationSeconds: wave.duration,
      rampUpSeconds: Math.min(30, wave.duration / 4),
      thinkTimeMs: 100, // Fast think time for high load
      endpoints: REALISTIC_ENDPOINTS,
      enableMonitoring: true,
      resourceLimits: {
        maxMemoryMB: 2048, // 2GB hard limit
        maxMemoryPercent: 80, // 80% max
        maxConcurrentRequests: Math.min(wave.users, 10000), // Cap at 10k
      },
    };

    try {
      console.log('🚀 Starting wave...\n');
      const startTime = Date.now();

      const result = await simulator.runTest(config);
      const duration = (Date.now() - startTime) / 1000;

      const criticalBottlenecks =
        result.bottlenecks?.filter((b) => b.severity === 'critical').length ||
        0;
      const breakdown =
        result.throughput.successRate < 0.5 || result.responseTime.p95 > 10000;

      const waveResult: WaveResult = {
        wave: wave.name,
        users: wave.users,
        totalRequests: result.totalRequests,
        successRate: result.throughput.successRate,
        avgResponseTime: result.responseTime.mean,
        p95ResponseTime: result.responseTime.p95,
        p99ResponseTime: result.responseTime.p99,
        throughput: result.throughput.requestsPerSecond,
        errors: result.failedRequests,
        bottlenecks: result.bottlenecks?.length || 0,
        criticalIssues: criticalBottlenecks,
        systemBreakdown: breakdown,
      };

      waveResults.push(waveResult);

      console.log(`\n✓ Wave completed in ${duration.toFixed(2)}s:`);
      console.log(
        `  Total Requests:    ${result.totalRequests.toLocaleString()}`
      );
      console.log(
        `  Success Rate:      ${(result.throughput.successRate * 100).toFixed(2)}%`
      );
      console.log(
        `  Failed Requests:   ${result.failedRequests.toLocaleString()}`
      );
      console.log(
        `  Avg Response:      ${result.responseTime.mean.toFixed(2)}ms`
      );
      console.log(
        `  P95 Response:      ${result.responseTime.p95.toFixed(2)}ms`
      );
      console.log(
        `  P99 Response:      ${result.responseTime.p99.toFixed(2)}ms`
      );
      console.log(
        `  Throughput:        ${result.throughput.requestsPerSecond.toFixed(2)} req/s`
      );
      console.log(`  Critical Issues:   ${criticalBottlenecks}`);

      if (result.performanceMetrics) {
        console.log('\n  Performance Metrics:');
        console.log(
          `    Peak Memory:       ${result.performanceMetrics.system.peakMemoryMB.toFixed(2)} MB`
        );
        console.log(
          `    Cache Hit Rate:    ${(result.performanceMetrics.cache.hitRate * 100).toFixed(2)}%`
        );
        console.log(
          `    Slow Query Rate:   ${(result.performanceMetrics.database.slowQueryRate * 100).toFixed(2)}%`
        );
      }

      if (breakdown) {
        console.log('\n  ⚠️  SYSTEM BREAKDOWN DETECTED');
        console.log(
          `      Success rate: ${(result.throughput.successRate * 100).toFixed(2)}%`
        );
        console.log(
          `      P95 latency: ${result.responseTime.p95.toFixed(2)}ms`
        );
        systemBroke = true;
      }

      // Cool down between waves
      if (!systemBroke && wave.users < 100000) {
        console.log('\n  💤 Cooling down for 15 seconds...');
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    } catch (error) {
      console.error('\n❌ Wave failed:', error);
      logger.error(`Wave ${wave.name} failed`, error, 'ExtremeStressTest');
      systemBroke = true;

      waveResults.push({
        wave: wave.name,
        users: wave.users,
        totalRequests: 0,
        successRate: 0,
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        throughput: 0,
        errors: 0,
        bottlenecks: 0,
        criticalIssues: 1,
        systemBreakdown: true,
      });
    }
  }

  // Final Analysis
  console.log(
    '\n\n╔═══════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║         EXTREME STRESS TEST - FINAL ANALYSIS                 ║'
  );
  console.log(
    '╚═══════════════════════════════════════════════════════════════╝\n'
  );

  console.log('Wave Results Summary:\n');
  console.log(
    'Wave                 | Users    | Success Rate | P95 Latency | Throughput  | Critical Issues'
  );
  console.log(
    '─────────────────────┼──────────┼──────────────┼─────────────┼─────────────┼────────────────'
  );

  for (const result of waveResults) {
    const users = result.users.toLocaleString().padEnd(8);
    const success = `${(result.successRate * 100).toFixed(1)}%`.padEnd(12);
    const p95 = `${result.p95ResponseTime.toFixed(0)}ms`.padEnd(11);
    const throughput = `${result.throughput.toFixed(0)} req/s`.padEnd(11);
    const issues = result.criticalIssues.toString().padEnd(15);
    const breakdown = result.systemBreakdown ? ' ⚠️  BREAKDOWN' : '';

    console.log(
      `${result.wave.padEnd(20)} | ${users} | ${success} | ${p95} | ${throughput} | ${issues}${breakdown}`
    );
  }

  // Find breaking point
  const successfulWaves = waveResults.filter(
    (w) => !w.systemBreakdown && w.successRate > 0.9
  );
  const maxSuccessfulCCU =
    successfulWaves.length > 0
      ? Math.max(...successfulWaves.map((w) => w.users))
      : 0;

  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('  CAPACITY ANALYSIS');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  console.log(`Maximum Stable CCU:  ${maxSuccessfulCCU.toLocaleString()}`);
  console.log('Target CCU:          100,000');
  console.log(
    `Gap:                 ${(100000 - maxSuccessfulCCU).toLocaleString()} users (${(((100000 - maxSuccessfulCCU) / 100000) * 100).toFixed(1)}%)\n`
  );

  if (maxSuccessfulCCU < 100000) {
    console.log('⚠️  SYSTEM CANNOT HANDLE 100k CCU IN CURRENT STATE\n');
  } else {
    console.log('✅ SYSTEM HANDLED 100k CCU SUCCESSFULLY\n');
  }

  // Identify bottlenecks
  console.log(
    '═══════════════════════════════════════════════════════════════'
  );
  console.log('  IDENTIFIED BOTTLENECKS');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  const bottlenecks = [];

  // Check for response time degradation
  const responseTimeTrend = waveResults.map((w) => w.p95ResponseTime);
  const lastResponseTime = responseTimeTrend[responseTimeTrend.length - 1];
  const firstResponseTime = responseTimeTrend[0];
  const responseDegradation =
    responseTimeTrend.length > 1 &&
    lastResponseTime !== undefined &&
    firstResponseTime !== undefined &&
    lastResponseTime > firstResponseTime * 5;

  if (
    responseDegradation &&
    lastResponseTime !== undefined &&
    firstResponseTime !== undefined
  ) {
    bottlenecks.push({
      type: 'Response Time Degradation',
      severity: 'CRITICAL',
      description: `P95 latency increased ${(lastResponseTime / firstResponseTime).toFixed(1)}x under load`,
      impact: 'System cannot scale to high CCU',
    });
  }

  // Check for error rate increase
  const errorRates = waveResults.map((w) => 1 - w.successRate);
  const highErrorRate = errorRates.some((rate) => rate > 0.1);

  if (highErrorRate) {
    bottlenecks.push({
      type: 'High Error Rate',
      severity: 'CRITICAL',
      description: 'Error rate exceeded 10% under high load',
      impact: 'User experience severely degraded',
    });
  }

  // Check throughput scaling
  const throughputPerUser = waveResults.map((w) => w.throughput / w.users);
  const lastThroughput = throughputPerUser[throughputPerUser.length - 1];
  const firstThroughput = throughputPerUser[0];
  const throughputDegradation =
    throughputPerUser.length > 1 &&
    lastThroughput !== undefined &&
    firstThroughput !== undefined &&
    lastThroughput < firstThroughput * 0.5;

  if (throughputDegradation) {
    bottlenecks.push({
      type: 'Throughput Bottleneck',
      severity: 'CRITICAL',
      description: 'Throughput per user decreased >50% at scale',
      impact: 'System cannot efficiently serve concurrent users',
    });
  }

  if (bottlenecks.length === 0) {
    console.log('✅ No major bottlenecks detected\n');
  } else {
    for (const bottleneck of bottlenecks) {
      console.log(`❌ [${bottleneck.severity}] ${bottleneck.type}`);
      console.log(`   Description: ${bottleneck.description}`);
      console.log(`   Impact: ${bottleneck.impact}\n`);
    }
  }

  // Save results
  const timestamp = Date.now();
  const resultsFile = `extreme-stress-test-100k-ccu-${environment}-${timestamp}.json`;
  await Bun.write(
    resultsFile,
    JSON.stringify(
      {
        environment,
        timestamp: new Date().toISOString(),
        targetCCU: 100000,
        maxStableCCU: maxSuccessfulCCU,
        waves: waveResults,
        bottlenecks,
      },
      null,
      2
    )
  );

  console.log(`\n📊 Results saved to: ${resultsFile}\n`);

  performanceMonitor.logSummary();

  console.log(
    '\n╔═══════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║         Test Complete                                         ║'
  );
  console.log(
    '╚═══════════════════════════════════════════════════════════════╝\n'
  );
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test interrupted by user');
  process.exit(0);
});

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  logger.error('Extreme stress test failed', error, 'ExtremeStressTest');
  process.exit(1);
});
