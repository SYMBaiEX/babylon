#!/usr/bin/env bun
/**
 * Script to fix Prisma create() calls that are missing required fields
 * 
 * This script:
 * 1. Finds all .create() calls missing 'id' or 'updatedAt'/'lastUpdated' fields
 * 2. Adds generateSnowflakeId() import if needed
 * 3. Adds missing id and timestamp fields to create data objects
 * 4. Fixes incorrect Prisma relation names (lowercase -> PascalCase)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Relation name mappings (lowercase -> PascalCase as per Prisma schema)
const RELATION_FIXES: Record<string, string> = {
  'participants': 'ChatParticipant',
  'messages': 'Message',
  'message': 'Message',
  'tag': 'Tag',
  'tags': 'Tag',
  'organization': 'Organization',
  'market': 'Market',
  'post': 'Post',
  'posts': 'Post',
  'actor': 'Actor',
  'npcActor': 'Actor',
  'deposits': 'PoolDeposit',
  'positions': 'PoolPosition',
  'trades': 'NPCTrade',
  'pool': 'Pool',
  'reactions': 'Reaction',
  'replies': 'other_Comment',
  'author': 'User',
  'fromUser': 'User_Feedback_fromUserIdToUser',
  'toUser': 'User_Feedback_toUserIdToUser',
};

// Models that require 'id' field
const MODELS_NEEDING_ID = [
  'chat', 'chatParticipant', 'message', 'comment', 'reaction',
  'feedback', 'game', 'balanceTransaction', 'perpPosition',
  'position', 'poolDeposit', 'pointsTransaction', 'notification',
  'follow', 'favorite', 'share', 'post', 'postTag', 'referral',
];

// Models that require 'updatedAt' field
const MODELS_NEEDING_UPDATED_AT = [
  'chat', 'comment', 'feedback', 'game', 'market', 'position',
  'onboardingIntent', 'pool', 'tag', 'user',
];

// Models that require 'lastUpdated' field
const MODELS_NEEDING_LAST_UPDATED = [
  'perpPosition', 'poolPosition',
];

function walkDir(dir: string, callback: (filePath: string) => void) {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.startsWith('.')) {
        walkDir(filePath, callback);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      callback(filePath);
    }
  }
}

function fixFile(filePath: string): boolean {
  let content = readFileSync(filePath, 'utf-8');
  let modified = false;

  // Skip if already has generateSnowflakeId import
  const hasSnowflakeImport = content.includes('generateSnowflakeId');
  
  // Check if file has .create() calls
  const hasCreateCalls = /\.(create|upsert)\(\{/.test(content);
  
  if (!hasCreateCalls) {
    return false;
  }

  // Add generateSnowflakeId import if needed and not present
  if (!hasSnowflakeImport && hasCreateCalls) {
    // Find the last import statement
    const importRegex = /^import .+ from .+;?$/gm;
    const imports = content.match(importRegex);
    
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      
      if (lastImportIndex !== -1) {
        const insertPosition = lastImportIndex + lastImport.length;
        content = content.slice(0, insertPosition) + 
                 "\nimport { generateSnowflakeId } from '@/lib/snowflake';" +
                 content.slice(insertPosition);
        modified = true;
      }
    }
  }

  // Fix .create() calls missing id field
  for (const model of MODELS_NEEDING_ID) {
    // Match pattern: db.model.create({ data: { ... } })
    const createRegex = new RegExp(
      `(\\w+\\.${model}\\.create\\(\\{\\s*data:\\s*\\{)([^}]+?)(\\}\\s*\\})`,
      'gs'
    );
    
    content = content.replace(createRegex, (match, prefix, dataContent, suffix) => {
      // Check if 'id:' already exists in the data object
      if (/\bid:\s*/.test(dataContent)) {
        return match; // Already has id
      }
      
      // Add id as first field
      const newData = `\n          id: generateSnowflakeId(),${dataContent}`;
      modified = true;
      return prefix + newData + suffix;
    });
  }

  // Fix .create() calls missing updatedAt field
  for (const model of MODELS_NEEDING_UPDATED_AT) {
    const createRegex = new RegExp(
      `(\\w+\\.${model}\\.create\\(\\{\\s*data:\\s*\\{[^}]+?)(\\}\\s*\\})`,
      'gs'
    );
    
    content = content.replace(createRegex, (match, dataContent, suffix) => {
      // Check if 'updatedAt:' already exists
      if (/\bupdatedAt:\s*/.test(dataContent)) {
        return match;
      }
      
      // Add updatedAt before closing brace
      const newData = dataContent + ',\n          updatedAt: new Date()';
      modified = true;
      return newData + suffix;
    });
  }

  // Fix .create() calls missing lastUpdated field
  for (const model of MODELS_NEEDING_LAST_UPDATED) {
    const createRegex = new RegExp(
      `(\\w+\\.${model}\\.create\\(\\{\\s*data:\\s*\\{[^}]+?)(\\}\\s*\\})`,
      'gs'
    );
    
    content = content.replace(createRegex, (match, dataContent, suffix) => {
      // Check if 'lastUpdated:' already exists
      if (/\blastUpdated:\s*/.test(dataContent)) {
        return match;
      }
      
      // Add lastUpdated before closing brace
      const newData = dataContent + ',\n          lastUpdated: new Date()';
      modified = true;
      return newData + suffix;
    });
  }

  // Fix .upsert() calls missing updatedAt in create block
  for (const model of MODELS_NEEDING_UPDATED_AT) {
    const upsertRegex = new RegExp(
      `(\\w+\\.${model}\\.upsert\\(\\{[^}]*?create:\\s*\\{[^}]+?)(\\}\\s*,\\s*update:)`,
      'gs'
    );
    
    content = content.replace(upsertRegex, (match, createBlock, updatePart) => {
      // Check if 'updatedAt:' already exists in create block
      if (/\bupdatedAt:\s*/.test(createBlock)) {
        return match;
      }
      
      // Add updatedAt before closing brace of create block
      const newCreate = createBlock + ',\n          updatedAt: new Date()';
      modified = true;
      return newCreate + updatePart;
    });
  }

  // Fix incorrect relation names in include blocks
  for (const [oldName, newName] of Object.entries(RELATION_FIXES)) {
    // Match: include: { oldName: { or include: { oldName: true,
    const includeRegex = new RegExp(
      `(include:\\s*\\{\\s*)${oldName}(\\s*:\\s*(?:true|\\{))`,
      'g'
    );
    
    if (includeRegex.test(content)) {
      content = content.replace(includeRegex, `$1${newName}$2`);
      modified = true;
    }
  }

  // Fix property access for renamed relations (e.g., item.tag.id -> item.Tag.id)
  for (const [oldName, newName] of Object.entries(RELATION_FIXES)) {
    // Match: object.oldName. (but not in include blocks)
    const accessRegex = new RegExp(
      `([a-zA-Z_][a-zA-Z0-9_]*)\\.${oldName}\\.`,
      'g'
    );
    
    // Only replace if not in an include block context
    const lines = content.split('\n');
    let inIncludeBlock = false;
    let braceDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Track if we're in an include block
      if (/include:\s*\{/.test(line)) {
        inIncludeBlock = true;
        braceDepth = 1;
      } else if (inIncludeBlock) {
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;
        if (braceDepth <= 0) {
          inIncludeBlock = false;
        }
      }
      
      // Only replace property access outside include blocks
      if (!inIncludeBlock && line.includes(`.${oldName}.`)) {
        lines[i] = line.replace(accessRegex, `$1.${newName}.`);
        modified = true;
      }
    }
    
    if (modified) {
      content = lines.join('\n');
    }
  }

  if (modified) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Fixed: ${filePath}`);
    return true;
  }
  
  return false;
}

// Main execution
const srcDir = join(process.cwd(), 'src');
let fixedCount = 0;

console.log('🔍 Scanning for Prisma type errors...\n');

walkDir(srcDir, (filePath) => {
  if (fixFile(filePath)) {
    fixedCount++;
  }
});

console.log(`\n✅ Fixed ${fixedCount} files`);
console.log('\n🏗️  Running build to verify...\n');

// Run build to verify
const { spawnSync } = require('child_process');
const result = spawnSync('bun', ['run', 'build'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

process.exit(result.status || 0);

