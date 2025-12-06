#!/usr/bin/env bun
/**
 * Check exported training data
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const dataDir = './training-data/trader';

  // Find JSONL files
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.jsonl'));
  console.log(`Found ${files.length} JSONL files in ${dataDir}`);

  for (const file of files) {
    const path = join(dataDir, file);
    const content = readFileSync(path, 'utf-8');
    const lines = content
      .trim()
      .split('\n')
      .filter((l) => l.length > 0);

    console.log(`\nFile: ${file}`);
    console.log(`  Lines: ${lines.length}`);
    console.log(`  Size: ${(content.length / 1024).toFixed(1)} KB`);

    // Parse first line
    const first = JSON.parse(lines[0]);
    console.log('\n  First entry structure:');
    console.log(`    trajectory_id: ${first.trajectory_id}`);
    console.log(`    agent_id: ${first.agent_id}`);
    console.log(`    archetype: ${first.archetype}`);
    console.log(`    score: ${first.score}`);
    console.log(`    reasoning: ${first.reasoning?.substring(0, 60)}...`);
    console.log(`    steps: ${first.steps?.length || 0} steps`);
    console.log(`    final_pnl: ${first.final_pnl}`);
    console.log(
      `    metrics keys: ${Object.keys(first.metrics || {}).join(', ')}`
    );

    // Check for required fields (using snake_case as exported)
    const required = [
      'trajectory_id',
      'archetype',
      'score',
      'steps',
      'metrics',
    ];
    const hasAll = required.every((k) => k in first);
    console.log(`\n  Has all required fields: ${hasAll ? '✅' : '❌'}`);

    if (!hasAll) {
      console.log(
        `  Missing: ${required.filter((k) => !(k in first)).join(', ')}`
      );
    }
  }

  process.exit(0);
}

main().catch(console.error);
