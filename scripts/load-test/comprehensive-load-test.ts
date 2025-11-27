#!/usr/bin/env bun

/**
 * Comprehensive Load Testing Suite
 *
 * Runs multiple test scenarios:
 * 1. Single-route DDOS tests (one route at a time)
 * 2. All-routes DDOS test
 * 3. Mixed realistic traffic
 * 4. Cache effectiveness tests
 * 5. Database performance tests
 * 6. Storage performance tests
 *
 * Usage:
 *   bun run scripts/load-test/comprehensive-load-test.ts [environment]
 *
 * Environments: local, staging, production
 */

import { logger, performanceMonitor } from '@babylon/shared';
import type { EnhancedLoadTestResult } from '@babylon/testing/load-test';
import {
  ENHANCED_TEST_SCENARIOS,
  EnhancedLoadTestSimulator,
  generateAllRoutesScenario,
} from '@babylon/testing/load-test';

// Parse command line arguments
const args = process.argv.slice(2);
const environment = args[0] || 'local';

// Environment URLs
const ENVIRONMENT_URLS: Record<string, string> = {
  local: 'http://localhost:3000',
  staging: process.env.STAGING_URL || 'https://staging.babylon.market',
  production: process.env.PRODUCTION_URL || 'https://babylon.market',
};

// Get base URL for environment
const baseUrl = ENVIRONMENT_URLS[environment];
if (!baseUrl) {
  console.error(`Invalid environment: ${environment}`);
  console.error(
    `Valid environments: ${Object.keys(ENVIRONMENT_URLS).join(', ')}`
  );
  process.exit(1);
}

// Critical routes to test individually
const CRITICAL_ROUTES = [
  '/api/posts',
  '/api/leaderboard',
  '/api/users/me',
  '/api/notifications',
  '/api/feed/widgets/trending-posts',
  '/api/feed/widgets/markets',
  '/api/chats',
  '/api/agents',
  '/api/a2a',
];

interface TestSuiteResults {
  environment: string;
  timestamp: Date;
  singleRouteTests: Array<{
    route: string;
    result: EnhancedLoadTestResult;
  }>;
  allRoutesTest: EnhancedLoadTestResult;
  mixedTrafficTest: EnhancedLoadTestResult;
  summary: {
    totalRequests: number;
    totalErrors: number;
    overallSuccessRate: number;
    criticalBottlenecks: number;
    totalRecommendations: number;
  };
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         Babylon Comprehensive Load Test Suite            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\nEnvironment: ${environment}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Start Time: ${new Date().toISOString()}\n`);

  // Check if server is running
  console.log('🔍 Checking server availability...');
  try {
    const response = await fetch(`${baseUrl}/api/docs`);
    if (!response.ok && response.status !== 404) {
      console.error(`❌ Server returned status ${response.status}`);
      process.exit(1);
    }
    console.log('✅ Server is responding\n');
  } catch (_error) {
    console.error('❌ Could not connect to server');
    console.error(`   Make sure the server is running at ${baseUrl}`);
    process.exit(1);
  }

  const simulator = new EnhancedLoadTestSimulator(baseUrl);
  const suiteResults: TestSuiteResults = {
    environment,
    timestamp: new Date(),
    singleRouteTests: [],
    allRoutesTest: {} as EnhancedLoadTestResult,
    mixedTrafficTest: {} as EnhancedLoadTestResult,
    summary: {
      totalRequests: 0,
      totalErrors: 0,
      overallSuccessRate: 0,
      criticalBottlenecks: 0,
      totalRecommendations: 0,
    },
  };

  // =================================================================
  // PHASE 1: Single-Route DDOS Tests
  // =================================================================
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  PHASE 1: Single-Route DDOS Tests                        ║');
  console.log(
    '╚═══════════════════════════════════════════════════════════╝\n'
  );
  console.log('Testing each critical route individually under high load...\n');

  for (const route of CRITICAL_ROUTES) {
    console.log(`\n📍 Testing route: ${route}`);
    console.log('─'.repeat(60));

    const config = ENHANCED_TEST_SCENARIOS.SINGLE_ROUTE_DDOS(route);

    // Adjust for environment
    if (environment === 'production') {
      config.concurrentUsers = 500;
      config.maxRps = 2000;
    } else if (environment === 'staging') {
      config.concurrentUsers = 750;
      config.maxRps = 5000;
    }

    try {
      const result = await simulator.runTest(config);
      suiteResults.singleRouteTests.push({ route, result });

      console.log('\n✓ Test completed:');
      console.log(`  Requests: ${result.totalRequests.toLocaleString()}`);
      console.log(
        `  Success Rate: ${(result.throughput.successRate * 100).toFixed(2)}%`
      );
      console.log(`  Avg Response: ${result.responseTime.mean.toFixed(2)}ms`);
      console.log(`  P95 Response: ${result.responseTime.p95.toFixed(2)}ms`);
      console.log(`  P99 Response: ${result.responseTime.p99.toFixed(2)}ms`);
      console.log(
        `  Throughput: ${result.throughput.requestsPerSecond.toFixed(2)} req/s`
      );

      if (result.performanceMetrics) {
        console.log(
          `\n  Cache Hit Rate: ${(result.performanceMetrics.cache.hitRate * 100).toFixed(2)}%`
        );
        console.log(
          `  DB Slow Query Rate: ${(result.performanceMetrics.database.slowQueryRate * 100).toFixed(2)}%`
        );
        console.log(
          `  Peak Memory: ${result.performanceMetrics.system.peakMemoryMB.toFixed(2)} MB`
        );
      }

      if (result.bottlenecks && result.bottlenecks.length > 0) {
        const critical = result.bottlenecks.filter(
          (b) => b.severity === 'critical'
        );
        if (critical.length > 0) {
          console.log(`\n  ⚠️  Critical bottlenecks found: ${critical.length}`);
          critical.forEach((b) => console.log(`     - ${b.description}`));
        }
      }

      // Wait between tests
      console.log('\n  💤 Cooling down for 10 seconds...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    } catch (error) {
      console.error(`\n❌ Test failed for ${route}:`, error);
      logger.error(
        `Single-route test failed for ${route}`,
        error,
        'ComprehensiveLoadTest'
      );
    }
  }

  // =================================================================
  // PHASE 2: All-Routes DDOS Test
  // =================================================================
  console.log(
    '\n\n╔═══════════════════════════════════════════════════════════╗'
  );
  console.log('║  PHASE 2: All-Routes DDOS Test                           ║');
  console.log(
    '╚═══════════════════════════════════════════════════════════╝\n'
  );
  console.log('Testing all routes simultaneously under heavy load...\n');

  try {
    const allEndpoints = await generateAllRoutesScenario(baseUrl);
    const config = ENHANCED_TEST_SCENARIOS.ALL_ROUTES_DDOS(allEndpoints);

    // Adjust for environment
    if (environment === 'production') {
      config.concurrentUsers = 1000;
      config.maxRps = 3000;
    } else if (environment === 'staging') {
      config.concurrentUsers = 1500;
      config.maxRps = 4000;
    }

    console.log(`Testing ${allEndpoints.length} routes...`);
    console.log(`Concurrent Users: ${config.concurrentUsers}`);
    console.log(`Duration: ${config.durationSeconds}s`);
    console.log(`Max RPS: ${config.maxRps}\n`);

    const result = await simulator.runTest(config);
    suiteResults.allRoutesTest = result;

    console.log('\n✓ All-routes test completed:');
    console.log(`  Requests: ${result.totalRequests.toLocaleString()}`);
    console.log(
      `  Success Rate: ${(result.throughput.successRate * 100).toFixed(2)}%`
    );
    console.log(`  Avg Response: ${result.responseTime.mean.toFixed(2)}ms`);
    console.log(`  P95 Response: ${result.responseTime.p95.toFixed(2)}ms`);
    console.log(`  P99 Response: ${result.responseTime.p99.toFixed(2)}ms`);
    console.log(
      `  Throughput: ${result.throughput.requestsPerSecond.toFixed(2)} req/s`
    );

    if (result.performanceMetrics) {
      console.log('\n  Performance Metrics:');
      console.log(
        `    Cache Hit Rate: ${(result.performanceMetrics.cache.hitRate * 100).toFixed(2)}%`
      );
      console.log(
        `    DB Slow Query Rate: ${(result.performanceMetrics.database.slowQueryRate * 100).toFixed(2)}%`
      );
      console.log(
        `    Peak Memory: ${result.performanceMetrics.system.peakMemoryMB.toFixed(2)} MB`
      );
      console.log(
        `    Peak Active Requests: ${result.performanceMetrics.system.peakActiveRequests}`
      );
      console.log(
        `    Avg RPS: ${result.performanceMetrics.system.avgRequestsPerSecond.toFixed(2)}`
      );
    }

    // Wait before next test
    console.log('\n  💤 Cooling down for 30 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  } catch (error) {
    console.error('\n❌ All-routes test failed:', error);
    logger.error('All-routes test failed', error, 'ComprehensiveLoadTest');
  }

  // =================================================================
  // PHASE 3: Realistic Mixed Traffic Test
  // =================================================================
  console.log(
    '\n\n╔═══════════════════════════════════════════════════════════╗'
  );
  console.log('║  PHASE 3: Realistic Mixed Traffic Test                   ║');
  console.log(
    '╚═══════════════════════════════════════════════════════════╝\n'
  );
  console.log('Testing with realistic user behavior patterns...\n');

  try {
    const endpoints = await generateAllRoutesScenario(baseUrl);
    const config = ENHANCED_TEST_SCENARIOS.REALISTIC_LOAD(endpoints);

    // Adjust for environment
    if (environment === 'production') {
      config.concurrentUsers = 300;
      config.maxRps = 1000;
      config.durationSeconds = 180;
    }

    console.log(`Concurrent Users: ${config.concurrentUsers}`);
    console.log(`Duration: ${config.durationSeconds}s`);
    console.log(`Think Time: ${config.thinkTimeMs}ms\n`);

    const result = await simulator.runTest(config);
    suiteResults.mixedTrafficTest = result;

    console.log('\n✓ Mixed traffic test completed:');
    console.log(`  Requests: ${result.totalRequests.toLocaleString()}`);
    console.log(
      `  Success Rate: ${(result.throughput.successRate * 100).toFixed(2)}%`
    );
    console.log(`  Avg Response: ${result.responseTime.mean.toFixed(2)}ms`);
    console.log(`  P95 Response: ${result.responseTime.p95.toFixed(2)}ms`);
    console.log(
      `  Throughput: ${result.throughput.requestsPerSecond.toFixed(2)} req/s`
    );
  } catch (error) {
    console.error('\n❌ Mixed traffic test failed:', error);
    logger.error('Mixed traffic test failed', error, 'ComprehensiveLoadTest');
  }

  // =================================================================
  // FINAL ANALYSIS AND RECOMMENDATIONS
  // =================================================================
  console.log(
    '\n\n╔═══════════════════════════════════════════════════════════╗'
  );
  console.log('║  FINAL ANALYSIS AND RECOMMENDATIONS                      ║');
  console.log(
    '╚═══════════════════════════════════════════════════════════╝\n'
  );

  // Aggregate results
  const allResults = [
    ...suiteResults.singleRouteTests.map((t) => t.result),
    suiteResults.allRoutesTest,
    suiteResults.mixedTrafficTest,
  ];

  let totalRequests = 0;
  let totalErrors = 0;
  const allBottlenecks: Array<{
    type: string;
    severity: string;
    description: string;
    route?: string;
  }> = [];
  const allRecommendations: string[] = [];

  for (const result of allResults) {
    if (result && result.totalRequests) {
      totalRequests += result.totalRequests;
      totalErrors += result.failedRequests;

      if (result.bottlenecks) {
        allBottlenecks.push(...result.bottlenecks);
      }

      if (result.recommendations) {
        allRecommendations.push(...result.recommendations);
      }
    }
  }

  const overallSuccessRate =
    totalRequests > 0 ? (totalRequests - totalErrors) / totalRequests : 0;
  const criticalBottlenecks = allBottlenecks.filter(
    (b) => b.severity === 'critical'
  ).length;

  suiteResults.summary = {
    totalRequests,
    totalErrors,
    overallSuccessRate,
    criticalBottlenecks,
    totalRecommendations: allRecommendations.length,
  };

  console.log('Summary Statistics:');
  console.log('─'.repeat(60));
  console.log(`  Total Requests: ${totalRequests.toLocaleString()}`);
  console.log(`  Total Errors: ${totalErrors.toLocaleString()}`);
  console.log(
    `  Overall Success Rate: ${(overallSuccessRate * 100).toFixed(2)}%`
  );
  console.log(`  Critical Bottlenecks: ${criticalBottlenecks}`);
  console.log(`  Total Recommendations: ${allRecommendations.length}`);

  // Find slowest routes
  console.log('\n\nSlowest Routes (by P95 response time):');
  console.log('─'.repeat(60));
  const routePerformance = suiteResults.singleRouteTests
    .map((t) => ({
      route: t.route,
      p95: t.result.responseTime.p95,
      successRate: t.result.throughput.successRate,
    }))
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, 5);

  for (const route of routePerformance) {
    console.log(`  ${route.route}`);
    console.log(`    P95: ${route.p95.toFixed(2)}ms`);
    console.log(`    Success: ${(route.successRate * 100).toFixed(2)}%`);
  }

  // Critical bottlenecks
  if (criticalBottlenecks > 0) {
    console.log('\n\n⚠️  CRITICAL BOTTLENECKS:');
    console.log('─'.repeat(60));
    const criticalIssues = allBottlenecks.filter(
      (b) => b.severity === 'critical'
    );
    for (const issue of criticalIssues) {
      console.log(`  [${issue.type.toUpperCase()}] ${issue.description}`);
    }
  }

  // Top recommendations
  if (allRecommendations.length > 0) {
    console.log('\n\nTop Recommendations:');
    console.log('─'.repeat(60));
    // Deduplicate recommendations
    const uniqueRecs = [...new Set(allRecommendations)].slice(0, 10);
    for (const rec of uniqueRecs) {
      console.log(`  • ${rec}`);
    }
  }

  // Overall assessment
  console.log('\n\nOverall Assessment:');
  console.log('─'.repeat(60));
  if (overallSuccessRate >= 0.99 && criticalBottlenecks === 0) {
    console.log('  ✅ EXCELLENT - System is performing well under load');
    console.log('     Ready for production traffic');
  } else if (overallSuccessRate >= 0.95 && criticalBottlenecks < 3) {
    console.log('  ⚠️  GOOD - System is generally stable');
    console.log('     Some optimizations recommended before high traffic');
  } else if (overallSuccessRate >= 0.9) {
    console.log('  ⚠️  FAIR - System needs optimization');
    console.log('     Address bottlenecks before production deployment');
  } else {
    console.log('  ❌ POOR - Critical issues detected');
    console.log('     DO NOT deploy to production');
    console.log('     Address critical issues immediately');
  }

  // Save results to file
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const resultsFile = `load-test-results-comprehensive-${environment}-${timestamp}.json`;
  await Bun.write(resultsFile, JSON.stringify(suiteResults, null, 2));
  console.log(`\n\n📊 Full results saved to: ${resultsFile}`);

  // Generate performance report
  performanceMonitor.logSummary();

  console.log(
    '\n╔═══════════════════════════════════════════════════════════╗'
  );
  console.log('║  Test Suite Complete                                      ║');
  console.log(
    '╚═══════════════════════════════════════════════════════════╝\n'
  );
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test interrupted by user');
  process.exit(0);
});

main().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  logger.error(
    'Comprehensive load test suite failed',
    error,
    'ComprehensiveLoadTest'
  );
  process.exit(1);
});
