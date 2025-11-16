/**
 * Upload Model to HuggingFace
 * 
 * Manually upload trained model to HuggingFace Hub with benchmarks.
 * 
 * Usage:
 *   npx ts-node scripts/upload-model-to-huggingface.ts --model=babylon-agent-v1.0.0 --hf-name=babylonlabs/babylon-agent
 */

import { HuggingFaceModelUploader } from '@/lib/huggingface/HuggingFaceModelUploader';
import { ModelBenchmarkService } from '@/lib/benchmark/ModelBenchmarkService';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

async function main() {
  const args = process.argv.slice(2);

  const modelId = args.find(a => a.startsWith('--model='))?.split('=')[1];
  const hfModelName = args.find(a => a.startsWith('--hf-name='))?.split('=')[1];
  const description = args.find(a => a.startsWith('--description='))?.split('=')[1];
  const isPrivate = args.includes('--private');
  const includeWeights = !args.includes('--no-weights');
  const benchmark = args.includes('--benchmark');
  const force = args.includes('--force');

  if (!modelId || !hfModelName) {
    console.error('❌ Error: --model and --hf-name arguments are required');
    console.log('\nUsage:');
    console.log('  npx ts-node scripts/upload-model-to-huggingface.ts --model=babylon-agent-v1.0.0 --hf-name=babylonlabs/babylon-agent');
    console.log('\nOptions:');
    console.log('  --model=ID            Model ID from database (required)');
    console.log('  --hf-name=NAME        HuggingFace model name (required)');
    console.log('  --description=DESC    Model description');
    console.log('  --private             Make model private');
    console.log('  --no-weights          Don\'t upload model weights');
    console.log('  --benchmark           Run benchmarks before upload');
    console.log('  --force               Force upload even if exists');
    console.log('\nEnvironment variables:');
    console.log('  HUGGING_FACE_TOKEN or HF_TOKEN  Your HuggingFace API token');
    process.exit(1);
  }

  // Check token
  if (!process.env.HUGGING_FACE_TOKEN && !process.env.HF_TOKEN) {
    console.error('❌ Error: HUGGING_FACE_TOKEN or HF_TOKEN environment variable required');
    console.log('\nSet your token:');
    console.log('  export HUGGING_FACE_TOKEN=your_token_here');
    console.log('\nOr get a token from: https://huggingface.co/settings/tokens');
    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       HUGGINGFACE MODEL UPLOADER                       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  console.log(`Model ID: ${modelId}`);
  console.log(`HuggingFace Name: ${hfModelName}`);
  console.log(`Private: ${isPrivate ? 'yes' : 'no'}`);
  console.log(`Include Weights: ${includeWeights ? 'yes' : 'no'}`);
  console.log(`Benchmark First: ${benchmark ? 'yes' : 'no'}\n`);

  try {
    // Check if model exists
    const model = await prisma.trainedModel.findUnique({
      where: { modelId },
    });

    if (!model) {
      console.error(`❌ Model not found: ${modelId}`);
      process.exit(1);
    }

    console.log(`Found model: ${model.modelId} v${model.version}`);
    console.log(`Base model: ${model.baseModel}`);
    console.log(`Status: ${model.status}\n`);

    // Run benchmarks if requested
    if (benchmark) {
      console.log('📊 Running benchmarks...\n');

      const benchmarkPaths = await ModelBenchmarkService.getStandardBenchmarkPaths();
      
      if (benchmarkPaths.length === 0) {
        console.warn('⚠️  No standard benchmarks found, skipping benchmarking');
      } else {
        console.log(`Found ${benchmarkPaths.length} standard benchmarks\n`);

        const benchmarkResults = await ModelBenchmarkService.benchmarkModel({
          modelId,
          benchmarkPaths,
          saveResults: true,
        });

        console.log(`\n✅ Benchmark complete: ${benchmarkResults.length} runs\n`);

        // Show results
        for (const result of benchmarkResults) {
          console.log(`  ${result.benchmarkId}:`);
          console.log(`    P&L: ${result.metrics.totalPnl.toFixed(2)}`);
          console.log(`    Accuracy: ${(result.metrics.predictionMetrics.accuracy * 100).toFixed(1)}%`);
          console.log(`    Optimality: ${result.metrics.optimalityScore.toFixed(1)}`);
          
          if (result.comparisonToBaseline) {
            const delta = result.comparisonToBaseline.pnlDelta;
            const symbol = delta > 0 ? '📈' : delta < 0 ? '📉' : '➡️';
            console.log(`    vs Baseline: ${symbol} ${delta > 0 ? '+' : ''}${delta.toFixed(2)}`);
          }
          console.log('');
        }

        // Compare to baseline
        const comparison = await ModelBenchmarkService.compareToBaseline(modelId);
        console.log('📊 Overall Comparison to Baseline:\n');
        console.log(`  P&L Delta: ${comparison.improvement.pnlDelta > 0 ? '+' : ''}${comparison.improvement.pnlDelta.toFixed(2)}`);
        console.log(`  Accuracy Delta: ${comparison.improvement.accuracyDelta > 0 ? '+' : ''}${(comparison.improvement.accuracyDelta * 100).toFixed(1)}%`);
        console.log(`  Recommendation: ${comparison.recommendation.toUpperCase()}\n`);

        if (comparison.recommendation !== 'deploy' && !force) {
          console.warn(`⚠️  Model recommendation is "${comparison.recommendation}" not "deploy"`);
          console.warn('   Use --force to upload anyway\n');
          process.exit(1);
        }
      }
    }

    // Upload to HuggingFace
    console.log('📤 Uploading to HuggingFace...\n');

    const uploader = new HuggingFaceModelUploader();

    const result = await uploader.uploadModel({
      modelId,
      modelName: hfModelName,
      description,
      private: isPrivate,
      includeWeights,
    });

    if (result.success) {
      console.log('\n✅ MODEL UPLOAD SUCCESSFUL!\n');
      console.log(`Model URL: ${result.modelUrl}`);
      console.log(`Files uploaded: ${result.filesUploaded}`);
      console.log('\n🤖 View your model:');
      console.log(`   ${result.modelUrl}`);
      console.log('\n📦 Use in Python:');
      console.log(`   from transformers import AutoModelForCausalLM`);
      console.log(`   model = AutoModelForCausalLM.from_pretrained("${hfModelName}")`);
    } else {
      console.error('\n❌ MODEL UPLOAD FAILED\n');
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    await prisma.$disconnect();
  } catch (error) {
    logger.error('Upload failed', { error });
    console.error('\n❌ UPLOAD FAILED\n');
    console.error(error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(async error => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});



