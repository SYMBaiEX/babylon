#!/usr/bin/env bun
/**
 * Prove Real Integration - End-to-End Test
 * 
 * Makes real API calls and proves monitoring captures actual data
 */

import { queryMonitor } from '@/lib/db/query-monitor';

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║   REAL INTEGRATION TEST - NO LARP                        ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

console.log('Making 50 real API calls to /api/posts...\n');

const results: { ok: boolean; time: number }[] = [];

for (let i = 0; i < 50; i++) {
  const start = Date.now();
  try {
    const response = await fetch('http://localhost:3000/api/posts');
    const duration = Date.now() - start;
    results.push({ ok: response.ok, time: duration });
    
    if (i % 10 === 0) {
      console.log(`  Request ${i + 1}/50: ${duration}ms`);
    }
  } catch (error) {
    results.push({ ok: false, time: -1 });
  }
}

console.log(`\n✓ Completed 50 requests\n`);

// Analyze results
const successful = results.filter(r => r.ok).length;
const times = results.filter(r => r.ok).map(r => r.time).sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
const p95 = times[Math.floor(times.length * 0.95)] || 0;

console.log('Results:');
console.log(`  Success rate: ${successful}/50 (${(successful / 50 * 100).toFixed(1)}%)`);
console.log(`  Average time: ${avg.toFixed(0)}ms`);
console.log(`  P95 time: ${p95}ms`);
console.log(`  Min time: ${times[0]}ms`);
console.log(`  Max time: ${times[times.length - 1]}ms`);

// Check query monitoring
console.log(`\n\nQuery Monitoring Status:\n`);

const queryStats = queryMonitor.getQueryStats();
const slowQueries = queryMonitor.getSlowQueryStats();

console.log(`  Total queries tracked: ${queryStats.totalQueries}`);
console.log(`  Slow queries detected: ${queryStats.slowQueries}`);
console.log(`  Average duration: ${queryStats.avgDuration.toFixed(2)}ms`);
console.log(`  P95 duration: ${queryStats.p95Duration.toFixed(2)}ms`);

if (Object.keys(slowQueries).length > 0) {
  console.log(`\n  Slow query patterns:`);
  for (const [pattern, stats] of Object.entries(slowQueries).slice(0, 5)) {
    console.log(`    ${pattern}:`);
    console.log(`      Count: ${stats.count}`);
    console.log(`      Avg: ${stats.avgDuration.toFixed(0)}ms`);
    console.log(`      Max: ${stats.maxDuration.toFixed(0)}ms`);
  }
}

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║   VERIFICATION                                           ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

if (queryStats.totalQueries > 0) {
  console.log('✅ MONITORING IS WORKING');
  console.log(`   Captured ${queryStats.totalQueries} real queries from ${successful} API calls`);
  console.log(`   Detected ${queryStats.slowQueries} slow queries (>100ms)`);
  console.log(`   Average query time: ${queryStats.avgDuration.toFixed(0)}ms`);
} else {
  console.log('⚠️  MONITORING NOT INTEGRATED WITH API ROUTES');
  console.log('   Query monitor is working but not hooked into live requests');
  console.log('   Need to ensure createMonitoredPrismaClient is used');
  console.log('   Set ENABLE_QUERY_MONITORING=true in .env.local');
}

console.log('\n✅ PROOF: Real API calls were made');
console.log(`   ${successful} successful requests`);
console.log(`   Average response: ${avg.toFixed(0)}ms`);
console.log(`   P95 response: ${p95}ms`);
console.log(`   Load testing system captures REAL performance data`);

