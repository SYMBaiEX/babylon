#!/usr/bin/env bun
/**
 * Migrate Prompts from Markdown to TypeScript
 * 
 * Converts all .md prompt files to .ts files with proper type safety.
 * Run once to complete the migration.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

interface PromptMetadata {
  id: string;
  version: string;
  category: string;
  description: string;
  temperature?: number;
  maxTokens?: number;
}

function parsePromptFile(filePath: string): { metadata: PromptMetadata; template: string } {
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

function generateTsFile(
  metadata: PromptMetadata,
  template: string,
  varName: string
): string {
  // Escape backticks in template
  const escapedTemplate = template.replace(/`/g, '\\`').replace(/\${/g, '\\${');
  
  return `import { definePrompt } from '../define-prompt';

export const ${varName} = definePrompt({
  id: '${metadata.id}',
  version: '${metadata.version}',
  category: '${metadata.category}',
  description: '${metadata.description.replace(/'/g, "\\'")}',${metadata.temperature !== undefined ? `\n  temperature: ${metadata.temperature},` : ''}${metadata.maxTokens !== undefined ? `\n  maxTokens: ${metadata.maxTokens},` : ''}
  template: \`
${escapedTemplate}
\`.trim()
});
`;
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toLowerCase());
}

function walkDirectory(dir: string, baseDir: string): Array<{ path: string; category: string }> {
  const files: Array<{ path: string; category: string }> = [];
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...walkDirectory(fullPath, baseDir));
    } else if (entry.endsWith('.md') && entry !== 'README.md') {
      const relativePath = fullPath.replace(baseDir + '/', '');
      const category = relativePath.split('/')[0] || 'general';
      files.push({ path: fullPath, category });
    }
  }
  
  return files;
}

async function main() {
  console.log('🔄 Migrating prompts from Markdown to TypeScript...\n');
  
  const promptsDir = join(process.cwd(), 'src', 'prompts');
  const mdFiles = walkDirectory(promptsDir, promptsDir);
  
  const converted: string[] = [];
  const exports: Record<string, string[]> = {};
  
  for (const { path: mdPath, category } of mdFiles) {
    try {
      const { metadata, template } = parsePromptFile(mdPath);
      
      // Generate variable name from file name
      const fileName = mdPath.split('/').pop()?.replace('.md', '') || 'unknown';
      const varName = toCamelCase(fileName);
      
      // Generate TypeScript file
      const tsContent = generateTsFile(metadata, template, varName);
      const tsPath = mdPath.replace('.md', '.ts');
      
      writeFileSync(tsPath, tsContent);
      console.log(`✓ Converted: ${fileName}.md → ${fileName}.ts`);
      
      // Track for index generation
      if (!exports[category]) {
        exports[category] = [];
      }
      exports[category]!.push(
        `export { ${varName} } from './${category}/${fileName}';`
      );
      
      converted.push(fileName);
      
      // Optionally delete .md file
      // unlinkSync(mdPath);
    } catch (error) {
      console.error(`✗ Failed to convert ${mdPath}:`, error);
    }
  }
  
  // Generate updated index.ts
  const indexContent = `/**
 * Prompt Registry
 * 
 * Central export for all prompt definitions.
 * Import prompts directly for type safety and tree-shaking.
 */

// Re-export utilities
export { definePrompt, renderTemplate } from './define-prompt';
export { renderPrompt, getPromptParams } from './loader';
export type { PromptDefinition } from './define-prompt';

// Prompts by category
${Object.entries(exports)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([category, lines]) => `// ${category.charAt(0).toUpperCase() + category.slice(1)} prompts\n${lines.join('\n')}`)
  .join('\n\n')}

/**
 * Usage examples:
 * 
 * import { ambientPost, renderPrompt } from '@/prompts';
 * 
 * const prompt = renderPrompt(ambientPost, {
 *   actorName: 'Alice',
 *   actorDescription: 'Tech CEO'
 * });
 * 
 * const params = getPromptParams(ambientPost);
 * // { temperature: 0.9, maxTokens: 5000 }
 */
`;
  
  writeFileSync(join(promptsDir, 'index.ts'), indexContent);
  console.log(`\n✅ Migrated ${converted.length} prompts to TypeScript`);
  console.log('📄 Updated: src/prompts/index.ts');
  console.log('\n💡 Next steps:');
  console.log('   1. Review the generated TypeScript files');
  console.log('   2. Delete .md files: find src/prompts -name "*.md" -not -name "README.md" -delete');
  console.log('   3. Delete bundled-prompts.json');
  console.log('   4. Delete scripts/bundle-prompts.ts');
  console.log('   5. Update any code using loadPrompt() to use renderPrompt()');
}

main().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

