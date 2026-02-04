/**
 * Test NPC Voice Generation
 *
 * A standalone script to test that NPC post generation produces distinct voices.
 * Doesn't require database - just tests the LLM prompt.
 *
 * Run: cd packages/engine && bun run src/__tests__/scripts/test-npc-voice.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Load environment variables from .env files
const loadEnvFile = (filePath: string) => {
  if (!existsSync(filePath)) return;
  const envContent = readFileSync(filePath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
};

const rootDir = join(import.meta.dir, '../../../../../..');
loadEnvFile(join(rootDir, '.env'));
loadEnvFile(join(rootDir, '.env.local'));
loadEnvFile(join(rootDir, '.env.test'));

import { BabylonLLMClient } from '../../llm/openai-client';
import { StaticDataRegistry } from '../../services/static-data-registry';

// Test actors with very different voices
const testActorIds = [
  'ailon-musk', // Cryptic one-liners, dismissive
  'kanyai-west', // ALL CAPS, stream of consciousness
  'baill-gaites', // Book recommendations, nerd humor
  'dairiio-amodei', // Safety-first corporate speak
  'trump-terminal', // CAPS, "TOTAL DISASTER"
];

async function main() {
  console.log('Testing NPC Voice Generation\n');
  console.log('='.repeat(60));

  const llmClient = BabylonLLMClient.forGameTick();

  const question = {
    text: 'Will OpenAGI release their new SMH-95 "Soul Minter" AI by January 10, 2026?',
  };

  const worldFacts =
    'Use parody names: OpenAGI (not OpenAI), AIlon Musk (not Elon Musk), TeslAI (not Tesla).';

  const generatedPosts: Array<{ name: string; post: string }> = [];

  for (const actorId of testActorIds) {
    const actor = StaticDataRegistry.getActor(actorId);
    if (!actor) {
      console.log(`Actor ${actorId} not found, skipping`);
      continue;
    }

    // Build examples context with ALL available examples
    const allExamples =
      actor.postExample && actor.postExample.length > 0
        ? actor.postExample
            .slice(0, 6)
            .map((ex) => `"${ex}"`)
            .join('\n')
        : '';

    const personalityContext = actor.personality
      ? `Personality: ${actor.personality}`
      : '';
    const voiceContext = actor.postStyle
      ? `Writing Style: ${actor.postStyle}`
      : '';

    const prompt = `You ARE ${actor.name}. Write a single post exactly as they would.

=== WHO YOU ARE ===
${actor.description || ''}
${personalityContext}
${voiceContext}

=== HOW YOU WRITE (match this style exactly) ===
${allExamples || 'Use short, authentic posts matching your personality.'}

=== WHAT'S HAPPENING ===
"${question.text}"

=== RULES ===
- Sound exactly like the examples above
- No hashtags, no emojis
- No dates ("by Dec 13")
- Max 280 characters

${worldFacts}

<response>
  <post>your post here</post>
</response>`;

    console.log(`\nGenerating post for ${actor.name}...`);

    const response = await llmClient.generateJSON<
      { post: string } | { response: { post: string } }
    >(
      prompt,
      {
        properties: {
          post: { type: 'string' },
        },
        required: ['post'],
      },
      {
        temperature: 0.9,
        maxTokens: 1024,
        format: 'xml',
      }
    );

    const postContent =
      'response' in response &&
      response.response &&
      typeof response.response === 'object' &&
      'post' in response.response
        ? (response.response as { post: string }).post
        : (response as { post: string }).post;

    generatedPosts.push({
      name: actor.name,
      post: postContent || '[EMPTY]',
    });

    console.log(`  Style: ${actor.postStyle}`);
    console.log(`  Post: "${postContent}"`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  // Check for pattern issues
  const overusedPatterns = [
    { pattern: /parses.*mints?/i, name: 'parses...mints' },
    { pattern: /mints?.*parses/i, name: 'mints...parses' },
    { pattern: /is not.*—.*it is/i, name: 'is not—it is' },
    { pattern: /does not parse/i, name: 'does not parse' },
  ];

  let patternIssues = 0;
  for (const { name, post } of generatedPosts) {
    for (const { pattern, name: patternName } of overusedPatterns) {
      if (pattern.test(post)) {
        console.log(`❌ PATTERN ISSUE: ${name} used "${patternName}"`);
        patternIssues++;
      }
    }
  }

  // Check for uniqueness
  const uniquePosts = new Set(generatedPosts.map((p) => p.post));
  const allUnique = uniquePosts.size === generatedPosts.length;

  console.log(`\nGenerated ${generatedPosts.length} posts`);
  console.log(`Unique posts: ${uniquePosts.size}/${generatedPosts.length}`);
  console.log(`Pattern issues: ${patternIssues}`);
  console.log(`All unique: ${allUnique ? '✅' : '❌'}`);

  // Voice checks
  const kanyaiPost = generatedPosts.find((p) => p.name === 'KanyAI West');
  if (kanyaiPost) {
    const letters = kanyaiPost.post.replace(/[^a-zA-Z]/g, '');
    const uppercase = letters.replace(/[^A-Z]/g, '');
    const ratio = letters.length > 0 ? uppercase.length / letters.length : 0;
    console.log(
      `KanyAI uppercase ratio: ${(ratio * 100).toFixed(1)}% ${ratio > 0.4 ? '✅' : '❌'}`
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('ALL POSTS');
  console.log('='.repeat(60));
  for (const { name, post } of generatedPosts) {
    console.log(`\n${name}:`);
    console.log(`  "${post}"`);
  }
}

main().catch(console.error);
