#!/usr/bin/env bun
/**
 * Fix Prisma type errors by:
 * 1. Adding missing 'id' fields to .create() calls
 * 2. Adding missing 'updatedAt' or 'lastUpdated' fields
 * 3. Fixing relation names in include/select blocks
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Get all TypeScript errors from build
console.log('🔍 Running build to find TypeScript errors...\n');

let buildOutput: string;
try {
  execSync('bun run build 2>&1', { cwd: process.cwd(), encoding: 'utf-8', stdio: 'pipe' });
  console.log('✅ Build succeeded! No errors to fix.');
  process.exit(0);
} catch (error: unknown) {
  if (error && typeof error === 'object' && 'stdout' in error) {
    buildOutput = String(error.stdout);
  } else {
    console.error('Failed to run build');
    process.exit(1);
  }
}

// Parse errors
const errorPattern = /\.\/([^\s]+):(\d+):(\d+)\nType error: (.+?)(?=\n\n|\n\[0m)/gs;
const errors: Array<{ file: string; line: number; message: string }> = [];

let match;
while ((match = errorPattern.exec(buildOutput)) !== null) {
  errors.push({
    file: match[1],
    line: parseInt(match[2]),
    message: match[4],
  });
}

console.log(`Found ${errors.length} TypeScript errors\n`);

if (errors.length === 0) {
  console.log('✅ No errors found!');
  process.exit(0);
}

// Group errors by file
const errorsByFile = new Map<string, Array<{ line: number; message: string }>>();
for (const error of errors) {
  if (!errorsByFile.has(error.file)) {
    errorsByFile.set(error.file, []);
  }
  errorsByFile.get(error.file)!.push({ line: error.line, message: error.message });
}

// Fix each file
let fixedFiles = 0;

for (const [file, fileErrors] of errorsByFile) {
  console.log(`📝 Fixing ${file}...`);
  
  try {
    let content = readFileSync(file, 'utf-8');
    let modified = false;

    // Add generateSnowflakeId import if needed
    const needsSnowflakeImport = fileErrors.some(e => 
      e.message.includes("Property 'id' is missing")
    );
    
    if (needsSnowflakeImport && !content.includes('generateSnowflakeId')) {
      // Find last import
      const importLines = content.split('\n').filter(line => line.trim().startsWith('import '));
      if (importLines.length > 0) {
        const lastImport = importLines[importLines.length - 1];
        content = content.replace(
          lastImport,
          lastImport + "\nimport { generateSnowflakeId } from '@/lib/snowflake';"
        );
        modified = true;
      }
    }

    // Fix each error
    for (const error of fileErrors) {
      const lines = content.split('\n');
      const errorLine = lines[error.line - 1];

      // Fix missing 'id' property
      if (error.message.includes("Property 'id' is missing")) {
        // Find the data: { line and add id as first property
        for (let i = error.line - 1; i < Math.min(lines.length, error.line + 20); i++) {
          if (lines[i].includes('data: {')) {
            // Check if next line already has id
            if (!lines[i + 1]?.includes('id:')) {
              const indent = lines[i + 1]?.match(/^\s*/)?.[0] || '          ';
              lines.splice(i + 1, 0, `${indent}id: generateSnowflakeId(),`);
              modified = true;
              break;
            }
          }
        }
      }

      // Fix missing 'updatedAt' property
      if (error.message.includes("Property 'updatedAt' is missing")) {
        // Find the closing brace of data object
        for (let i = error.line - 1; i < Math.min(lines.length, error.line + 30); i++) {
          if (lines[i].match(/^\s+\},?\s*$/)) {
            // Check if previous line has updatedAt
            if (!lines[i - 1]?.includes('updatedAt:')) {
              const indent = lines[i].match(/^\s*/)?.[0] || '          ';
              lines.splice(i, 0, `${indent}updatedAt: new Date(),`);
              modified = true;
              break;
            }
          }
        }
      }

      // Fix missing 'lastUpdated' property
      if (error.message.includes("Property 'lastUpdated' is missing")) {
        // Find the closing brace of data object
        for (let i = error.line - 1; i < Math.min(lines.length, error.line + 30); i++) {
          if (lines[i].match(/^\s+\},?\s*$/)) {
            // Check if previous line has lastUpdated
            if (!lines[i - 1]?.includes('lastUpdated:')) {
              const indent = lines[i].match(/^\s*/)?.[0] || '          ';
              lines.splice(i, 0, `${indent}lastUpdated: new Date(),`);
              modified = true;
              break;
            }
          }
        }
      }

      // Fix incorrect relation names
      for (const [oldName, newName] of Object.entries(RELATION_FIXES)) {
        if (error.message.includes(`'${oldName}' does not exist`) || 
            error.message.includes(`Did you mean to write '${newName}'`)) {
          // Fix in include blocks
          content = content.replace(
            new RegExp(`(include:\\s*\\{\\s*)${oldName}(\\s*:)`, 'g'),
            `$1${newName}$2`
          );
          // Fix in _count.select blocks
          content = content.replace(
            new RegExp(`(_count:\\s*\\{\\s*select:\\s*\\{\\s*)${oldName}(\\s*:)`, 'g'),
            `$1${newName}$2`
          );
          modified = true;
        }
      }

      if (modified) {
        content = lines.join('\n');
      }
    }

    // Fix property access (e.g., pool.npcActor -> pool.Actor)
    for (const [oldName, newName] of Object.entries(RELATION_FIXES)) {
      const accessRegex = new RegExp(`\\.${oldName}\\.`, 'g');
      if (accessRegex.test(content)) {
        content = content.replace(accessRegex, `.${newName}.`);
        modified = true;
      }
      
      // Also fix: item.oldName? -> item.newName?
      const optionalAccessRegex = new RegExp(`\\.${oldName}\\?`, 'g');
      if (optionalAccessRegex.test(content)) {
        content = content.replace(optionalAccessRegex, `.${newName}?`);
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(file, content, 'utf-8');
      console.log(`  ✓ Fixed ${fileErrors.length} error(s)`);
      fixedFiles++;
    }
  } catch (err) {
    console.error(`  ✗ Error fixing ${file}:`, err);
  }
}

console.log(`\n✅ Fixed ${fixedFiles} file(s)\n`);
console.log('🏗️  Running build again to verify...\n');

// Run build again
try {
  execSync('bun run build', { cwd: process.cwd(), stdio: 'inherit' });
  console.log('\n🎉 Build succeeded!');
} catch {
  console.log('\n⚠️  Build still has errors. Manual fixes may be needed.');
  process.exit(1);
}

