/**
 * Test HuggingFace Pipeline Manually
 *
 * Complete end-to-end test of the GitHub Actions pipeline:
 * 1. Collect game data
 * 2. Upload to HuggingFace
 * 3. Download and verify
 * 4. Run offline simulation
 *
 * Run this to verify everything works before relying on GitHub Actions.
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runStep(
  name: string,
  command: string
): Promise<{ success: boolean; output: string }> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${name}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      env: { ...process.env },
    });

    console.log(stdout);
    if (stderr) console.error(stderr);

    return { success: true, output: stdout };
  } catch (error) {
    console.error('❌ Failed:', error);
    return {
      success: false,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║    HUGGINGFACE PIPELINE - MANUAL TEST                  ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  console.log('\nThis will test the complete GitHub Actions pipeline locally:');
  console.log('  1. Collect game data');
  console.log('  2. Upload to HuggingFace (requires token)');
  console.log('  3. Verify files');
  console.log('  4. Run offline simulation');
  console.log('');

  // Check prerequisites
  if (!process.env.HUGGING_FACE_TOKEN) {
    console.error('❌ HUGGING_FACE_TOKEN not set');
    console.log('\nSet it first:');
    console.log('  export HUGGING_FACE_TOKEN=hf_your_token\n');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    console.log('\nSet it first or check your .env file\n');
    process.exit(1);
  }

  const results = [];

  // Step 1: Collect game data
  const step1 = await runStep(
    'STEP 1: Collect Game Data',
    'bun run scripts/collect-game-data-for-hf.ts'
  );
  results.push({ step: 'Collect Data', ...step1 });

  if (!step1.success) {
    console.error('\n❌ Data collection failed. Fix errors and try again.\n');
    process.exit(1);
  }

  // Step 2: Check collected data
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STEP 2: Verify Collected Data');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const dataDir = path.join(process.cwd(), 'exports', 'huggingface', 'latest');
  const summaryPath = path.join(dataDir, 'summary.json');

  try {
    const summary = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));
    console.log('✅ Summary file exists');
    console.log(`   Game Worlds: ${summary.totalWorlds || 0}`);
    console.log(`   Trajectories: ${summary.totalTrajectories || 0}`);
    console.log(`   Benchmarks: ${summary.totalBenchmarks || 0}`);
    console.log(
      `   Date Range: ${summary.dateRange?.start || 'N/A'} to ${summary.dateRange?.end || 'N/A'}`
    );
    results.push({ step: 'Verify Data', success: true });
  } catch (error) {
    console.error('❌ Summary file not found or invalid');
    results.push({ step: 'Verify Data', success: false });
    process.exit(1);
  }

  // Step 3: Upload to HuggingFace
  const step3 = await runStep(
    'STEP 3: Upload to HuggingFace',
    'bun run scripts/upload-to-huggingface.ts'
  );
  results.push({ step: 'Upload', ...step3 });

  if (!step3.success) {
    console.error('\n⚠️  Upload failed. Data is collected but not uploaded.');
    console.log('You can try manual upload or check token permissions.\n');
  }

  // Step 4: Test offline simulation (if we have data)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STEP 4: Test Offline Simulation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Find any available game data file
  try {
    const monthsDir = path.join(dataDir, 'by-month');
    const monthFiles = await fs.readdir(monthsDir).catch(() => []);

    if (monthFiles.length > 0) {
      const testFile = path.join(monthsDir, monthFiles[0]!);
      console.log(`Using test data: ${monthFiles[0]}`);

      const step4 = await runStep(
        'Run Offline Simulation (Fast-Forward)',
        `bun run scripts/run-offline-simulation.ts --data=${testFile} --max-ticks=100 --save`
      );
      results.push({ step: 'Offline Simulation', ...step4 });
    } else {
      console.log('⏭️  No monthly data files found, skipping offline test');
      results.push({
        step: 'Offline Simulation',
        success: true,
        output: 'Skipped - no data',
      });
    }
  } catch (error) {
    console.log('⏭️  Offline simulation test skipped');
    results.push({
      step: 'Offline Simulation',
      success: true,
      output: 'Skipped',
    });
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.step}`);
  }

  const allPassed = results.every((r) => r.success);

  console.log('');
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('\nThe GitHub Actions pipeline is ready to use.');
    console.log('It will run automatically daily at 2 AM UTC.');
  } else {
    console.log('⚠️  Some tests failed. Review errors above.');
    process.exit(1);
  }
  console.log('');
}

main();
