#!/usr/bin/env bun
/**
 * Non-interactive database push
 * Automatically selects "No" to add constraints without truncating
 */

import { $ } from 'bun';

// Run drizzle-kit push and automatically answer the prompt
const proc = Bun.spawn(['bunx', 'drizzle-kit', 'push'], {
  stdin: 'pipe',
  stdout: 'inherit',
  stderr: 'inherit',
});

// Wait a moment for the prompt to appear, then send Enter (selects "No")
await new Promise((resolve) => setTimeout(resolve, 2000));
proc.stdin.write('\n');
proc.stdin.end();

await proc.exited;
process.exit(proc.exitCode || 0);

