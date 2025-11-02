#!/usr/bin/env bun
/**
 * Bundle Prompts for Vercel Deployment
 * 
 * Reads all prompt markdown files and bundles them into a single JSON file
 * that can be imported at runtime without fs access.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

interface PromptMetadata {
  id: string;
  version: string;
  category: string;
  description: string;
  temperature?: number;
  maxTokens?: number;
}

interface LoadedPrompt {
  metadata: PromptMetadata;
  template: string;
}

interface PromptBundle {
  [path: string]: LoadedPrompt;
}

function parsePromptFile(filePath: string): LoadedPrompt {
  const content = readFileSync(filePath, 'utf-8');
  
  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    throw new Error(`Invalid prompt file format: ${filePath}`);
  }
  
  const frontmatter = frontmatterMatch[1];
  const template = frontmatterMatch[2];
  
  if (!frontmatter || !template) {
    throw new Error(`Invalid prompt file structure: ${filePath}`);
  }
  
  // Parse YAML (simple key: value parser)
  const metadata: Partial<PromptMetadata> = {};
  frontmatter.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      const value = valueParts.join(':').trim();
      const camelKey = key.trim().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      (metadata as Record<string, string | number>)[camelKey] =
        !isNaN(Number(value)) ? Number(value) : value;
    }
  });
  
  return {
    metadata: metadata as PromptMetadata,
    template: template.trim()
  };
}

function walkDirectory(dir: string, baseDir: string, bundle: PromptBundle): void {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      walkDirectory(fullPath, baseDir, bundle);
    } else if (file.endsWith('.md') && file !== 'README.md') {
      const relativePath = fullPath
        .replace(baseDir + '/', '')
        .replace(/\.md$/, '');
      
      try {
        bundle[relativePath] = parsePromptFile(fullPath);
        console.log(`✓ Bundled: ${relativePath}`);
      } catch (error) {
        console.error(`✗ Failed to parse ${relativePath}:`, error);
      }
    }
  }
}

async function main() {
  console.log('📦 Bundling prompts for Vercel deployment...\n');
  
  const promptsDir = join(process.cwd(), 'src', 'prompts');
  const outputPath = join(process.cwd(), 'src', 'prompts', 'bundled-prompts.json');
  
  const bundle: PromptBundle = {};
  
  walkDirectory(promptsDir, promptsDir, bundle);
  
  writeFileSync(outputPath, JSON.stringify(bundle, null, 2));
  
  console.log(`\n✅ Bundled ${Object.keys(bundle).length} prompts`);
  console.log(`📄 Output: src/prompts/bundled-prompts.json`);
}

main().catch(error => {
  console.error('❌ Failed to bundle prompts:', error);
  process.exit(1);
});

