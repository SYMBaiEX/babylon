/**
 * Test W&B Inference Directly
 *
 * Makes a direct call to W&B inference API to verify it works
 * and that we're actually using the trained model.
 *
 * Usage:
 *   bun run scripts/test-wandb-inference.ts [--model <model-id>]
 */

import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { isPromptLoggingEnabled, logPrompt } from '@babylon/engine';

async function testWandbInference() {
  const args = process.argv.slice(2);
  const modelIndex = args.findIndex((a) => a === '--model');
  const modelId =
    modelIndex >= 0
      ? args[modelIndex + 1]
      : process.env.WANDB_MODEL || 'OpenPipe/Qwen3-14B-Instruct';
  const apiKey = process.env.WANDB_API_KEY;

  if (!apiKey) {
    console.error('❌ WANDB_API_KEY not set');
    console.error('   Set it with: export WANDB_API_KEY=your_key');
    process.exit(1);
  }

  console.log('\n🧪 Testing W&B Inference API\n');
  console.log('='.repeat(60));
  console.log(`Model: ${modelId}`);
  console.log(`API Key: ${apiKey.substring(0, 10)}...`);
  console.log('='.repeat(60) + '\n');

  try {
    // Create Groq client with W&B baseURL
    const groq = createGroq({
      apiKey,
      baseURL: 'https://api.inference.wandb.ai/v1',
    });

    console.log('📡 Making test call to W&B inference API...\n');

    const startTime = Date.now();
    const result = await generateText({
      model: groq.languageModel(modelId as string),
      prompt:
        'Say "W&B RL Model Test" if you are a trained reinforcement learning model. Otherwise say "Base Model".',
      system: 'You are a helpful AI assistant.',
      maxOutputTokens: 50,
      temperature: 0.7,
    });
    const latencyMs = Date.now() - startTime;

    if (isPromptLoggingEnabled()) {
      await logPrompt({
        promptType: 'test_wandb_inference',
        input:
          'System: You are a helpful AI assistant.\n\nUser: Say "W&B RL Model Test" if you are a trained reinforcement learning model. Otherwise say "Base Model".',
        output: result.text,
        metadata: {
          provider: 'wandb',
          model: modelId,
          temperature: 0.7,
          maxTokens: 50,
        },
      });
    }

    console.log('✅ Call succeeded!\n');
    console.log(`Response: ${result.text}\n`);
    console.log(`Latency: ${latencyMs}ms\n`);

    // Check if response indicates trained model
    const isTrainedModel =
      result.text.toLowerCase().includes('rl model') ||
      result.text.toLowerCase().includes('reinforcement learning');

    if (isTrainedModel) {
      console.log('🎉 Model appears to be trained RL model!\n');
    } else {
      console.log('⚠️  Model response does not indicate trained RL model\n');
    }

    console.log('='.repeat(60));
    console.log('✅ W&B Inference API is working correctly\n');
    console.log('   Endpoint: https://api.inference.wandb.ai/v1');
    console.log(`   Model: ${modelId}`);
    console.log('   Response received: ✅\n');
  } catch (error) {
    console.error('\n❌ W&B Inference API call failed:\n');
    console.error(error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.message.includes('401')) {
      console.error('\n⚠️  Authentication failed. Check your WANDB_API_KEY.\n');
    } else if (error instanceof Error && error.message.includes('404')) {
      console.error(
        '\n⚠️  Model not found. Check that the model ID is correct.\n'
      );
    }

    process.exit(1);
  }
}

testWandbInference().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
