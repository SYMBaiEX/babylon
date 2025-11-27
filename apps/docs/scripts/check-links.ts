#!/usr/bin/env tsx
/**
 * Link checker for documentation
 * Scans all MDX files for dead links and generates a report
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface LinkIssue {
  file: string;
  line: number;
  link: string;
  type: 'internal' | 'external' | 'anchor';
  issue: 'broken' | 'missing' | 'invalid';
  message: string;
}

// LinkResult interface removed - not used

const contentDir = resolve(__dirname, '../content');
const issues: LinkIssue[] = [];
const allFiles = new Map<string, string>(); // path -> file content

// Markdown link regex: [text](url) or [text](url "title")
const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Get all MDX files recursively
 */
async function getAllMdxFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getAllMdxFiles(fullPath)));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.mdx') || entry.name.endsWith('.md'))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Normalize internal link path
 */
function normalizePath(path: string, baseDir: string): string {
  // Remove query strings and anchors
  const [cleanPath] = path.split('?').join('').split('#');

  // Handle absolute paths from root
  if (cleanPath.startsWith('/')) {
    return resolve(contentDir, `${cleanPath.slice(1)}.mdx`);
  }

  // Handle relative paths
  if (cleanPath.startsWith('./') || !cleanPath.startsWith('http')) {
    const resolved = resolve(baseDir, cleanPath);
    // Try with .mdx extension
    if (!resolved.endsWith('.mdx') && !resolved.endsWith('.md')) {
      return `${resolved}.mdx`;
    }
    return resolved;
  }

  return cleanPath;
}

/**
 * Check if internal file exists
 */
async function checkInternalLink(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    // Try without extension
    try {
      const stats = await stat(path.replace(/\.mdx?$/, ''));
      return stats.isFile();
    } catch {
      return false;
    }
  }
}

/**
 * Check external link (basic check - just validates URL format)
 */
function checkExternalLink(url: string): { valid: boolean; message?: string } {
  try {
    const parsed = new URL(url);
    // We'll just validate format, not actually check HTTP status (too slow)
    return {
      valid: parsed.protocol === 'http:' || parsed.protocol === 'https:',
    };
  } catch {
    return { valid: false, message: 'Invalid URL format' };
  }
}

/**
 * Extract headings from file content for anchor checking
 */
function extractHeadings(content: string): Set<string> {
  const headings = new Set<string>();

  // Match markdown headings: # Heading, ## Heading, etc.
  const headingRegex = /^#{1,6}\s+(.+)$/gm;
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const heading = match[1]
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
    headings.add(heading);
  }

  return headings;
}

/**
 * Check anchor link
 */
function checkAnchor(anchor: string, fileContent: string): boolean {
  const headings = extractHeadings(fileContent);
  const normalizedAnchor = anchor.toLowerCase().replace(/[^\w-]/g, '');
  return headings.has(normalizedAnchor);
}

/**
 * Process a single file
 */
async function processFile(filePath: string): Promise<void> {
  const content = await readFile(filePath, 'utf-8');
  allFiles.set(filePath, content);

  const lines = content.split('\n');
  const baseDir = dirname(filePath);

  // Check markdown links
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let match;

    // Check [text](url) links
    while ((match = linkRegex.exec(line)) !== null) {
      const [, text, url] = match;
      const fullLink = `[${text}](${url})`;

      // Skip if it's a code block or inline code
      const beforeMatch = line.substring(0, match.index);
      const backticksBefore = (beforeMatch.match(/`/g) || []).length;
      if (backticksBefore % 2 !== 0) continue;

      // Check if external link
      if (
        url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('//')
      ) {
        const check = checkExternalLink(url);
        if (!check.valid) {
          issues.push({
            file: relative(contentDir, filePath),
            line: lineNum + 1,
            link: fullLink,
            type: 'external',
            issue: 'invalid',
            message: check.message || 'Invalid URL format',
          });
        }
      }
      // Check if anchor link
      else if (url.startsWith('#')) {
        const anchor = url.slice(1);
        if (!checkAnchor(anchor, content)) {
          issues.push({
            file: relative(contentDir, filePath),
            line: lineNum + 1,
            link: fullLink,
            type: 'anchor',
            issue: 'missing',
            message: `Anchor "${anchor}" not found in file`,
          });
        }
      }
      // Check internal link
      else {
        const normalized = normalizePath(url, baseDir);
        const exists = await checkInternalLink(normalized);

        if (!exists) {
          // Check if it's a cross-file anchor link
          const [filePart, anchorPart] = url.split('#');
          if (anchorPart) {
            const filePath = normalizePath(filePart, baseDir);
            const fileExists = await checkInternalLink(filePath);
            if (fileExists) {
              const targetContent = await readFile(filePath, 'utf-8').catch(
                () => ''
              );
              if (!checkAnchor(anchorPart, targetContent)) {
                issues.push({
                  file: relative(contentDir, filePath),
                  line: lineNum + 1,
                  link: fullLink,
                  type: 'anchor',
                  issue: 'missing',
                  message: `Anchor "${anchorPart}" not found in target file`,
                });
              }
            } else {
              issues.push({
                file: relative(contentDir, filePath),
                line: lineNum + 1,
                link: fullLink,
                type: 'internal',
                issue: 'missing',
                message: `File not found: ${relative(contentDir, normalized)}`,
              });
            }
          } else {
            issues.push({
              file: relative(contentDir, filePath),
              line: lineNum + 1,
              link: fullLink,
              type: 'internal',
              issue: 'missing',
              message: `File not found: ${relative(contentDir, normalized)}`,
            });
          }
        }
      }
    }

    // Reset regex
    linkRegex.lastIndex = 0;
  }
}

/**
 * Check _meta.ts files for references to non-existent pages
 */
async function checkMetaFiles(): Promise<void> {
  const metaFiles: string[] = [];

  async function findMetaFiles(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await findMetaFiles(fullPath);
      } else if (entry.name === '_meta.ts' || entry.name === '_meta.tsx') {
        metaFiles.push(fullPath);
      }
    }
  }

  await findMetaFiles(contentDir);

  for (const metaFile of metaFiles) {
    const content = await readFile(metaFile, 'utf-8');
    const dir = dirname(metaFile);

    // Extract page references from _meta.ts
    // Format: 'page-name': 'Display Name'
    const pageRefRegex = /['"]([^'"]+)['"]:\s*['"][^'"]+['"]/g;
    let match;

    while ((match = pageRefRegex.exec(content)) !== null) {
      const pageName = match[1];
      const pagePath = join(dir, `${pageName}.mdx`);
      const pagePathAlt = join(dir, `${pageName}.md`);

      try {
        await stat(pagePath);
      } catch {
        try {
          await stat(pagePathAlt);
        } catch {
          issues.push({
            file: relative(contentDir, metaFile),
            line: 0, // Can't determine line number easily
            link: pageName,
            type: 'internal',
            issue: 'missing',
            message: `Page "${pageName}" referenced in _meta.ts but file does not exist`,
          });
        }
      }
    }
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Scanning documentation for dead links...\n');

  const files = await getAllMdxFiles(contentDir);
  console.log(`Found ${files.length} MDX files\n`);

  // Process all files
  for (const file of files) {
    await processFile(file);
  }

  // Check _meta.ts files
  await checkMetaFiles();

  // Generate report
  console.log('='.repeat(80));
  console.log('LINK CHECK REPORT');
  console.log('='.repeat(80));
  console.log();

  if (issues.length === 0) {
    console.log('✅ No dead links found! All links are valid.\n');
    process.exit(0);
  }

  console.log(`❌ Found ${issues.length} issue(s):\n`);

  // Group by file
  const byFile = new Map<string, LinkIssue[]>();
  for (const issue of issues) {
    if (!byFile.has(issue.file)) {
      byFile.set(issue.file, []);
    }
    byFile.get(issue.file)?.push(issue);
  }

  // Print grouped by file
  for (const [file, fileIssues] of byFile.entries()) {
    console.log(`📄 ${file}`);
    for (const issue of fileIssues) {
      const lineInfo = issue.line > 0 ? `:${issue.line}` : '';
      console.log(`   ${lineInfo} [${issue.type.toUpperCase()}] ${issue.link}`);
      console.log(`      → ${issue.message}`);
    }
    console.log();
  }

  console.log('='.repeat(80));
  console.log(`Total issues: ${issues.length}`);
  console.log('='.repeat(80));

  process.exit(issues.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
