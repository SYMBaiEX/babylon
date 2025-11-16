#!/usr/bin/env bun
/**
 * Quick Single-Route Load Test
 * 
 * Quickly test a single route to identify performance issues
 * 
 * Usage:
 *   bun run scripts/load-test/quick-route-test.ts [route] [environment]
 *   
 * Example:
 *   bun run scripts/load-test/quick-route-test.ts /api/posts local
 */

import { EnhancedLoadTestSimulator, ENHANCED_TEST_SCENARIOS } from '@/lib/testing/enhanced-load-test-simulator';

// Parse arguments
const args = process.argv.slice(2);
const route = args[0] || '/api/posts';
const environment = args[1] || 'local';

// Environment URLs
const ENVIRONMENT_URLS: Record<string, string> = {
  local: 'http://localhost:3000',
  staging: process.env.STAGING_URL || 'https://staging.babylon.market',
  production: process.env.PRODUCTION_URL || 'https://babylon.market',
};

const baseUrl = ENVIRONMENT_URLS[environment] || ENVIRONMENT_URLS.local;

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         Quick Single-Route Load Test                     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\nRoute: ${route}`);
  console.log(`Environment: ${environment}`);
  console.log(`Base URL: ${baseUrl}\n`);

  // Check server
  console.log('🔍 Checking server...');
  if (!baseUrl) {
    console.error('❌ Invalid base URL');
    process.exit(1);
  }
  try {
    const response = await fetch(baseUrl);
    console.log(`✅ Server responding (status: ${response.status})\n`);
  } catch (error) {
    console.error('❌ Could not connect to server');
    console.error(`   Make sure the server is running at ${baseUrl}`);
    process.exit(1);
  }

  // Run test
  const simulator = new EnhancedLoadTestSimulator(baseUrl);
  const config = ENHANCED_TEST_SCENARIOS.SINGLE_ROUTE_DDOS(route);
  
  // Adjust for quick test
  config.concurrentUsers = 500;
  config.durationSeconds = 30;
  config.rampUpSeconds = 5;
  
  console.log('Starting load test...');
  console.log(`Concurrent Users: ${config.concurrentUsers}`);
  console.log(`Duration: ${config.durationSeconds}s`);
  console.log(`Ramp-up: ${config.rampUpSeconds}s\n`);
  
  const result = await simulator.runTest(config);
  
  // Display results
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\nTotal Requests:      ${result.totalRequests.toLocaleString()}`);
  console.log(`Successful:          ${result.successfulRequests.toLocaleString()} (${(result.throughput.successRate * 100).toFixed(2)}%)`);
  console.log(`Failed:              ${result.failedRequests.toLocaleString()}`);
  console.log(`\nResponse Times:`);
  console.log(`  Min:               ${result.responseTime.min.toFixed(2)}ms`);
  console.log(`  Mean:              ${result.responseTime.mean.toFixed(2)}ms`);
  console.log(`  Median:            ${result.responseTime.median.toFixed(2)}ms`);
  console.log(`  95th Percentile:   ${result.responseTime.p95.toFixed(2)}ms`);
  console.log(`  99th Percentile:   ${result.responseTime.p99.toFixed(2)}ms`);
  console.log(`  Max:               ${result.responseTime.max.toFixed(2)}ms`);
  console.log(`\nThroughput:          ${result.throughput.requestsPerSecond.toFixed(2)} req/s`);
  
  // Performance metrics
  if (result.performanceMetrics) {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  PERFORMANCE METRICS');
    console.log('═══════════════════════════════════════════════════════════');
    
    const pm = result.performanceMetrics;
    
    console.log(`\nCache:`);
    console.log(`  Hit Rate:          ${(pm.cache.hitRate * 100).toFixed(2)}%`);
    console.log(`  Avg Latency:       ${pm.cache.avgLatencyMs.toFixed(2)}ms`);
    console.log(`  Operations:        ${pm.cache.operations.get + pm.cache.operations.set + pm.cache.operations.delete}`);
    
    console.log(`\nDatabase:`);
    console.log(`  Slow Query Rate:   ${(pm.database.slowQueryRate * 100).toFixed(2)}%`);
    console.log(`  CPU-Intensive Ops: ${pm.database.cpuIntensiveOps.length}`);
    
    if (pm.database.slowestOperations.length > 0) {
      console.log(`\n  Slowest Operations:`);
      pm.database.slowestOperations.slice(0, 5).forEach((op, i) => {
        console.log(`    ${i + 1}. ${op.operation}`);
        console.log(`       Avg: ${op.avgDuration.toFixed(2)}ms (${op.count} calls)`);
      });
    }
    
    console.log(`\nStorage:`);
    console.log(`  Uploads:           ${pm.storage.uploads}`);
    console.log(`  Downloads:         ${pm.storage.downloads}`);
    console.log(`  Errors:            ${pm.storage.errors}`);
    
    console.log(`\nSystem:`);
    console.log(`  Peak Memory:       ${pm.system.peakMemoryMB.toFixed(2)} MB`);
    console.log(`  Avg Memory:        ${pm.system.avgMemoryMB.toFixed(2)} MB`);
    console.log(`  Peak Requests:     ${pm.system.peakActiveRequests}`);
    console.log(`  Avg RPS:           ${pm.system.avgRequestsPerSecond.toFixed(2)}`);
  }
  
  // Bottlenecks
  if (result.bottlenecks && result.bottlenecks.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  BOTTLENECKS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const critical = result.bottlenecks.filter(b => b.severity === 'critical');
    const warnings = result.bottlenecks.filter(b => b.severity === 'warning');
    
    if (critical.length > 0) {
      console.log('CRITICAL:');
      critical.forEach(b => console.log(`  ❌ [${b.type}] ${b.description}`));
    }
    
    if (warnings.length > 0) {
      console.log(`${critical.length > 0 ? '\n' : ''}WARNINGS:`);
      warnings.forEach(b => console.log(`  ⚠️  [${b.type}] ${b.description}`));
    }
  }
  
  // Recommendations
  if (result.recommendations && result.recommendations.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    result.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });
  }
  
  // Assessment
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ASSESSMENT');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const successRate = result.throughput.successRate;
  const p95 = result.responseTime.p95;
  const criticalIssues = result.bottlenecks?.filter(b => b.severity === 'critical').length || 0;
  
  if (successRate >= 0.99 && p95 < 200 && criticalIssues === 0) {
    console.log('✅ EXCELLENT');
    console.log('   Route is performing optimally under high load');
  } else if (successRate >= 0.95 && p95 < 500 && criticalIssues === 0) {
    console.log('⚠️  GOOD');
    console.log('   Route is stable but could be optimized');
  } else if (successRate >= 0.90 && p95 < 1000) {
    console.log('⚠️  FAIR');
    console.log('   Route needs optimization before production');
  } else {
    console.log('❌ POOR');
    console.log('   Route has critical issues - do not deploy');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  
  // Save results
  const timestamp = Date.now();
  const filename = `load-test-${route.replace(/\//g, '-')}-${timestamp}.json`;
  await Bun.write(filename, JSON.stringify(result, null, 2));
  console.log(`Results saved to: ${filename}\n`);
}

process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test interrupted');
  process.exit(0);
});

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

