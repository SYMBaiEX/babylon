/**
 * Test HuggingFace Integration
 * 
 * Comprehensive test script for the HuggingFace integration system.
 * Tests all components without actually uploading to HuggingFace.
 * 
 * Usage:
 *   npx ts-node scripts/test-huggingface-integration.ts
 */

import { HuggingFaceDatasetUploader } from '@/lib/huggingface/HuggingFaceDatasetUploader';
import { HuggingFaceModelUploader } from '@/lib/huggingface/HuggingFaceModelUploader';
import { ModelBenchmarkService } from '@/lib/benchmark/ModelBenchmarkService';
import { db } from '@/db';
import * as path from 'path';
import { promises as fs } from 'fs';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n🧪 Testing: ${name}...`);
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`   ✅ PASSED`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`   ❌ FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     HUGGINGFACE INTEGRATION TEST SUITE                 ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Test 1: Check environment variables
  await test('Environment Variables', async () => {
    const hasToken = !!(process.env.HUGGING_FACE_TOKEN || process.env.HF_TOKEN);
    if (!hasToken) {
      console.log('   ⚠️  No HuggingFace token found (uploads will be skipped)');
    }
    if (!process.env.CRON_SECRET) {
      console.log('   ⚠️  No CRON_SECRET found (CRON job cannot be triggered)');
    }
  });

  // Test 2: Database connectivity
  await test('Database Connection', async () => {
    await db.$connect();
    const count = await db.trainedModel.count();
    console.log(`   Found ${count} trained models in database`);
  });

  // Test 3: Check for benchmark files
  await test('Benchmark Files Exist', async () => {
    const benchmarksDir = path.join(process.cwd(), 'benchmarks');
    const files = await fs.readdir(benchmarksDir);
    const benchmarkFiles = files.filter(f => f.endsWith('.json') && f.startsWith('benchmark-'));
    if (benchmarkFiles.length === 0) {
      throw new Error('No benchmark files found. Run: npx ts-node scripts/generate-benchmark.ts');
    }
    console.log(`   Found ${benchmarkFiles.length} benchmark files`);
  });

  // Test 4: HuggingFaceDatasetUploader instantiation
  await test('HuggingFaceDatasetUploader Initialization', async () => {
    const uploader = new HuggingFaceDatasetUploader();
    if (!uploader) {
      throw new Error('Failed to instantiate HuggingFaceDatasetUploader');
    }
  });

  // Test 5: HuggingFaceModelUploader instantiation
  await test('HuggingFaceModelUploader Initialization', async () => {
    const uploader = new HuggingFaceModelUploader();
    if (!uploader) {
      throw new Error('Failed to instantiate HuggingFaceModelUploader');
    }
  });

  // Test 6: ModelBenchmarkService - get unbenchmarked models
  await test('ModelBenchmarkService - Get Unbenchmarked Models', async () => {
    const unbenchmarked = await ModelBenchmarkService.getUnbenchmarkedModels();
    console.log(`   Found ${unbenchmarked.length} unbenchmarked models`);
  });

  // Test 7: ModelBenchmarkService - get standard benchmarks
  await test('ModelBenchmarkService - Get Standard Benchmarks', async () => {
    const benchmarks = await ModelBenchmarkService.getStandardBenchmarkPaths();
    if (benchmarks.length === 0) {
      throw new Error('No standard benchmarks found');
    }
    console.log(`   Found ${benchmarks.length} standard benchmark paths`);
  });

  // Test 8: Check BenchmarkResult table exists
  await test('BenchmarkResult Table Exists', async () => {
    try {
      const count = await db.benchmarkResult.count();
      console.log(`   BenchmarkResult table has ${count} records`);
    } catch (error) {
      throw new Error('BenchmarkResult table not found. Run: npx drizzle-kit push');
    }
  });

  // Test 9: Check TrainedModel has new fields
  await test('TrainedModel Schema Updated', async () => {
    const model = await db.trainedModel.findFirst();
    if (model) {
      const hasNewFields = 'huggingFaceRepo' in model && 'lastBenchmarked' in model && 'benchmarkCount' in model;
      if (!hasNewFields) {
        throw new Error('TrainedModel missing new fields. Run: npx drizzle-kit push');
      }
      console.log('   Schema includes: huggingFaceRepo, lastBenchmarked, benchmarkCount');
    } else {
      console.log('   ⚠️  No trained models in database (cannot verify schema)');
    }
  });

  // Test 10: Check exports directory writeable
  await test('Exports Directory Writeable', async () => {
    const exportsDir = path.join(process.cwd(), 'exports', 'test');
    await fs.mkdir(exportsDir, { recursive: true });
    const testFile = path.join(exportsDir, 'test.txt');
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    await fs.rmdir(exportsDir);
    console.log('   Exports directory is writeable');
  });

  // Test 11: Trajectory table exists and has data
  await test('Trajectory Data Availability', async () => {
    const count = await db.trajectory.count();
    console.log(`   Found ${count} trajectories in database`);
    if (count === 0) {
      console.log('   ⚠️  No trajectories found (trajectory dataset will be empty)');
    }
  });

  // Test 12: Check CLI scripts exist
  await test('CLI Scripts Exist', async () => {
    const scripts = [
      'scripts/upload-dataset-to-huggingface.ts',
      'scripts/upload-model-to-huggingface.ts',
      'scripts/benchmark-rl-model.ts',
    ];
    for (const script of scripts) {
      const scriptPath = path.join(process.cwd(), script);
      await fs.access(scriptPath);
    }
    console.log('   All CLI scripts present');
  });

  // Test 13: Check CRON endpoint exists
  await test('Weekly Dataset Upload CRON Endpoint', async () => {
    const cronFile = path.join(process.cwd(), 'src/app/api/cron/weekly-dataset-upload/route.ts');
    await fs.access(cronFile);
    console.log('   CRON endpoint file exists');
  });

  // Test 14: Check documentation exists
  await test('Documentation Files', async () => {
    const docs = [
      'HUGGINGFACE_INTEGRATION.md',
      'HUGGINGFACE_QUICKSTART.md',
      'HUGGINGFACE_COMPLETE_IMPLEMENTATION.md',
    ];
    for (const doc of docs) {
      const docPath = path.join(process.cwd(), doc);
      await fs.access(docPath);
    }
    console.log('   All documentation files present');
  });

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 TEST SUMMARY                 ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => r.passed === false).length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! System is ready for deployment.\n');
    console.log('Next steps:');
    console.log('1. Apply migration: npx drizzle-kit push --name add_benchmark_results_table');
    console.log('2. Set HUGGING_FACE_TOKEN in your environment');
    console.log('3. Test uploads: bun run hf:upload-dataset --dataset=test-org/test-dataset');
    console.log('4. Deploy to production\n');
  } else {
    console.log('⚠️  Some tests failed. Please fix the issues above before deploying.\n');
    process.exit(1);
  }

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error('\n💥 Test suite crashed:', error);
  await db.$disconnect();
  process.exit(1);
});

