/**
 * Upload Dataset to HuggingFace
 *
 * Manually upload benchmark dataset to HuggingFace Hub.
 *
 * Usage:
 *   npx ts-node scripts/upload-dataset-to-huggingface.ts --dataset=babylonlabs/agent-benchmarks
 *   npx ts-node scripts/upload-dataset-to-huggingface.ts --dataset=babylonlabs/agent-benchmarks --version=2025.01.15
 */

import { HuggingFaceDatasetUploader } from '@/lib/huggingface/HuggingFaceDatasetUploader';
import { logger } from '@/lib/logger';

async function main() {
  const args = process.argv.slice(2);

  const datasetName = args
    .find((a) => a.startsWith('--dataset='))
    ?.split('=')[1];
  const version = args.find((a) => a.startsWith('--version='))?.split('=')[1];
  const description = args
    .find((a) => a.startsWith('--description='))
    ?.split('=')[1];
  const isPrivate = args.includes('--private');
  const force = args.includes('--force');

  if (!datasetName) {
    console.error('❌ Error: --dataset argument is required');
    console.log('\nUsage:');
    console.log(
      '  npx ts-node scripts/upload-dataset-to-huggingface.ts --dataset=babylonlabs/agent-benchmarks'
    );
    console.log('\nOptions:');
    console.log('  --dataset=NAME       HuggingFace dataset name (required)');
    console.log('  --version=VERSION    Dataset version (default: YYYY.MM.DD)');
    console.log('  --description=DESC   Dataset description');
    console.log('  --private            Make dataset private');
    console.log('  --force              Force re-upload even if exists');
    console.log('\nEnvironment variables:');
    console.log('  HUGGING_FACE_TOKEN or HF_TOKEN  Your HuggingFace API token');
    process.exit(1);
  }

  // Check token
  if (!process.env.HUGGING_FACE_TOKEN && !process.env.HF_TOKEN) {
    console.error(
      '❌ Error: HUGGING_FACE_TOKEN or HF_TOKEN environment variable required'
    );
    console.log('\nSet your token:');
    console.log('  export HUGGING_FACE_TOKEN=your_token_here');
    console.log(
      '\nOr get a token from: https://huggingface.co/settings/tokens'
    );
    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       HUGGINGFACE DATASET UPLOADER                     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log(`Dataset: ${datasetName}`);
  console.log(`Version: ${version || 'auto'}`);
  console.log(`Private: ${isPrivate ? 'yes' : 'no'}`);
  console.log(`Force: ${force ? 'yes' : 'no'}\n`);

  try {
    const uploader = new HuggingFaceDatasetUploader();

    console.log('📊 Step 1: Collecting benchmark data...\n');

    const result = await uploader.uploadDataset({
      datasetName,
      version,
      description,
      private: isPrivate,
    });

    if (result.success) {
      console.log('\n✅ DATASET UPLOAD SUCCESSFUL!\n');
      console.log(`Dataset URL: ${result.datasetUrl}`);
      console.log(`Version: ${result.version}`);
      console.log(`Files uploaded: ${result.filesUploaded}`);
      console.log('\n📊 View your dataset:');
      console.log(`   ${result.datasetUrl}`);
      console.log('\n📦 Use in Python:');
      console.log('   from datasets import load_dataset');
      console.log(`   dataset = load_dataset("${datasetName}")`);
    } else {
      console.error('\n❌ DATASET UPLOAD FAILED\n');
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    logger.error('Upload failed', { error });
    console.error('\n❌ UPLOAD FAILED\n');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
