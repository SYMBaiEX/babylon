#!/usr/bin/env bun
/**
 * Test script for prompt debug logging
 *
 * Usage:
 *   DEBUG_PROMPTS=true bun run scripts/test-prompt-debug.ts
 */

import { BabylonLLMClient } from '@/generator/llm/openai-client';
import { logger } from '@/lib/logger';
import { getPromptParams, renderPrompt } from '@/prompts';
import { questionGeneration } from '@/prompts/game/question-generation';

async function testPromptDebugLogging() {
  logger.info('Testing prompt debug logging...', {}, 'TestScript');

  // Check if DEBUG_PROMPTS is enabled
  const debugEnabled =
    process.env.DEBUG_PROMPTS === 'true' || process.env.DEBUG_PROMPTS === '1';
  logger.info(`Debug prompts enabled: ${debugEnabled}`, {}, 'TestScript');

  if (!debugEnabled) {
    logger.warn(
      '⚠️  DEBUG_PROMPTS not enabled. Set DEBUG_PROMPTS=true to see debug output.',
      {},
      'TestScript'
    );
  }

  // Initialize LLM client
  const llm = BabylonLLMClient.forGameTick();

  // Render a test prompt
  const prompt = renderPrompt(questionGeneration, {
    scenariosList: 'Scenario 1: AI Drama\nSam AIltman launches GPT-7',
    actorsList: '- AIlon Musk: CEO of TeslAI\n- Sam AIltman: CEO of OpenAGI',
    orgsList: '- TeslAI: Electric car company\n- OpenAGI: AI research lab',
    recentContext: '\n\nRECENT EVENTS:\nDay 1: AIlon tweeted about AI safety',
    activeQuestionsContext: '\n\nNo active questions yet.',
    numToGenerate: '2',
    exampleQuestions:
      '✅ "Will AIlon Musk tweet 100 times today?"\n✅ "Will OpenAGI announce GPT-7?"',
  });

  const params = getPromptParams(questionGeneration);

  logger.info('Generating questions with debug logging...', {}, 'TestScript');

  // Generate questions - this should create a debug log file
  const response = await llm.generateJSON<
    | {
        questions: Array<{
          text: string;
          scenario: number;
          daysUntilResolution: number;
          expectedOutcome: boolean;
        }>;
      }
    | {
        response: {
          questions: Array<{
            text: string;
            scenario: number;
            daysUntilResolution: number;
            expectedOutcome: boolean;
          }>;
        };
      }
  >(prompt, undefined, params);

  const questions =
    'response' in response && response.response
      ? response.response.questions
      : (
          response as {
            questions: Array<{
              text: string;
              scenario: number;
              daysUntilResolution: number;
              expectedOutcome: boolean;
            }>;
          }
        ).questions;

  logger.info(
    `Generated ${questions.length} questions`,
    { questions },
    'TestScript'
  );

  if (debugEnabled) {
    logger.info(
      '✅ Debug log should be created in debug-prompts/ directory',
      {},
      'TestScript'
    );
    logger.info(
      '   Check debug-prompts/<timestamp>_question-generation.md',
      {},
      'TestScript'
    );
  }
}

testPromptDebugLogging()
  .then(() => {
    logger.info('Test complete', {}, 'TestScript');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Test failed', { error }, 'TestScript');
    process.exit(1);
  });
