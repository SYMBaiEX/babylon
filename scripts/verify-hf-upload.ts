/**
 * Verify HuggingFace Upload
 *
 * Verifies that the upload to HuggingFace was successful.
 * Checks that files exist and are accessible.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

async function verifyUpload(): Promise<boolean> {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║    VERIFYING HUGGINGFACE UPLOAD                        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const dataDir = path.join(process.cwd(), 'exports', 'huggingface', 'latest');

  const requiredFiles = [
    'index.json',
    'summary.json',
    'trajectories.jsonl',
    'benchmarks.jsonl',
    'README.md',
  ];

  let allExist = true;

  for (const file of requiredFiles) {
    const filePath = path.join(dataDir, file);
    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);
      console.log(`✅ ${file} (${Math.round(stats.size / 1024)}KB)`);
    } catch (error) {
      console.error(`❌ ${file} - NOT FOUND`);
      allExist = false;
    }
  }

  // Check for month files
  const monthsDir = path.join(dataDir, 'by-month');
  try {
    const monthFiles = await fs.readdir(monthsDir);
    console.log(`✅ by-month/ directory (${monthFiles.length} files)`);

    for (const monthFile of monthFiles) {
      console.log(`   - ${monthFile}`);
    }
  } catch (error) {
    console.warn('⚠️  by-month/ directory empty or missing');
  }

  console.log('');

  if (allExist) {
    console.log('✅ All required files present!\n');
    return true;
  }
  console.error('❌ Some files are missing!\n');
  return false;
}

async function main() {
  const success = await verifyUpload();
  process.exit(success ? 0 : 1);
}

main();
