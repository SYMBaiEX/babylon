#!/usr/bin/env ts-node
/**
 * Audit Script: Find potential RLS security issues
 * 
 * This script scans the codebase for:
 * 1. Uses of asUser() with optionalAuth()
 * 2. Uses of asSystem() that should be audited
 * 3. Missing authentication checks
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface Issue {
  file: string;
  line: number;
  type: 'asUser-with-optionalAuth' | 'asSystem-usage' | 'potential-issue';
  message: string;
  snippet: string;
}

async function auditFile(filePath: string): Promise<Issue[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues: Issue[] = [];

  let hasOptionalAuth = false;
  let hasAsUser = false;
  let hasAsSystem = false;

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Check for optionalAuth
    if (line.includes('optionalAuth')) {
      hasOptionalAuth = true;
    }

    // Check for asUser with null/undefined check
    if (line.includes('asUser(authUser') || line.includes('asUser(user')) {
      hasAsUser = true;
      
      // Check if there's a null check nearby
      const context = lines.slice(Math.max(0, index - 5), Math.min(lines.length, index + 5)).join('\n');
      if (!context.includes('if (') && !context.includes('? await') && !context.includes('authUser ?')) {
        issues.push({
          file: filePath,
          line: lineNum,
          type: 'potential-issue',
          message: 'asUser() called without visible null check - may need asPublic()',
          snippet: line.trim(),
        });
      }
    }

    // Check for asSystem usage
    if (line.includes('asSystem(')) {
      hasAsSystem = true;
      issues.push({
        file: filePath,
        line: lineNum,
        type: 'asSystem-usage',
        message: 'Review: asSystem() bypasses all RLS - ensure this is intentional',
        snippet: line.trim(),
      });
    }

    // Check for direct prisma usage (bypassing context)
    if (line.includes('prisma.') && !line.includes('from @/lib/prisma')) {
      issues.push({
        file: filePath,
        line: lineNum,
        type: 'potential-issue',
        message: 'Direct prisma usage detected - should use asUser/asPublic/asSystem',
        snippet: line.trim(),
      });
    }
  });

  // If file has both optionalAuth and asUser, flag it
  if (hasOptionalAuth && hasAsUser) {
    issues.push({
      file: filePath,
      line: 0,
      type: 'asUser-with-optionalAuth',
      message: 'File uses optionalAuth with asUser - verify asPublic() is used when authUser is null',
      snippet: '',
    });
  }

  return issues;
}

async function main() {
  console.log('🔍 Auditing RLS usage...\n');

  // Find all API route files
  const files = await glob('src/app/api/**/*.ts', {
    cwd: process.cwd(),
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  const allIssues: Issue[] = [];

  for (const file of files) {
    const issues = await auditFile(file);
    allIssues.push(...issues);
  }

  // Group issues by type
  const byType = allIssues.reduce((acc, issue) => {
    if (!acc[issue.type]) {
      acc[issue.type] = [];
    }
    acc[issue.type].push(issue);
    return acc;
  }, {} as Record<string, Issue[]>);

  // Print results
  console.log('📊 Audit Results:\n');
  console.log(`Total issues found: ${allIssues.length}\n`);

  Object.entries(byType).forEach(([type, issues]) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${type.toUpperCase()} (${issues.length} issues)`);
    console.log('='.repeat(80));

    issues.forEach(issue => {
      console.log(`\n📁 ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
      console.log(`   ${issue.message}`);
      if (issue.snippet) {
        console.log(`   ${issue.snippet}`);
      }
    });
  });

  console.log('\n\n✅ Audit complete!\n');
  
  process.exit(allIssues.filter(i => i.type !== 'asSystem-usage').length);
}

main().catch(error => {
  console.error('Error running audit:', error);
  process.exit(1);
});

