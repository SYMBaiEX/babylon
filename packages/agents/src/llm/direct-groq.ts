/**
 * Direct Groq LLM calls - with W&B RL model support
 *
 * Supports both Groq models and W&B trained RL models.
 * All LLM calls are automatically logged to trajectory logger if available.
 */

import { createGroq } from '@ai-sdk/groq';
import type { IAgentRuntime } from '@elizaos/core';
import { generateText } from 'ai';
import { isPromptLoggingEnabled, logPrompt } from '../utils/prompt-logger';
import type { TrajectoryLoggerService } from '../plugins/plugin-trajectory-logger/src/TrajectoryLoggerService';

export async function callGroqDirect(params: {
  prompt: string;
  system?: string;
  modelSize?: 'small' | 'large';
  temperature?: number;
  maxTokens?: number;
  trajectoryLogger?: TrajectoryLoggerService;
  trajectoryId?: string;
  purpose?: 'action' | 'reasoning' | 'evaluation' | 'response' | 'other';
  actionType?: string;
  runtime?: IAgentRuntime; // Pass runtime to access W&B trained models
}): Promise<string> {
  // Check for W&B trained model from runtime
  let model: string;
  let baseURL: string;
  let apiKey: string;

  if (params.runtime) {
    const wandbEnabled = params.runtime.getSetting('WANDB_ENABLED') === 'true';
    const wandbApiKey = params.runtime.getSetting('WANDB_API_KEY') as
      | string
      | undefined;
    const wandbModel = params.runtime.getSetting('WANDB_MODEL') as
      | string
      | undefined;

    if (wandbEnabled && wandbApiKey && wandbModel) {
      // Use trained W&B model for inference!
      model = wandbModel;
      baseURL = 'https://api.inference.wandb.ai/v1';
      apiKey = wandbApiKey;

      const { logger } = await import('../shared/logger');
      logger.info(
        'Using trained W&B model for agent decision',
        {
          model: wandbModel,
          purpose: params.purpose,
        },
        'DirectGroq'
      );

      const wandbClient = createGroq({ apiKey, baseURL });

      const startTime = Date.now();
      const result = await generateText({
        model: wandbClient.languageModel(model),
        prompt: params.prompt,
        system: params.system,
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens ?? 8192,
        maxRetries: 2,
      });

      const latencyMs = Date.now() - startTime;

      // Log to trajectory if available
      if (params.trajectoryLogger && params.trajectoryId) {
        const stepId = params.trajectoryLogger.getCurrentStepId(
          params.trajectoryId
        );
        if (stepId) {
          params.trajectoryLogger.logLLMCall(stepId, {
            model,
            systemPrompt: params.system || '',
            userPrompt: params.prompt,
            response: result.text,
            temperature: params.temperature ?? 0.7,
            maxTokens: params.maxTokens ?? 8192,
            purpose: params.purpose || 'action',
            actionType: params.actionType,
            latencyMs,
            promptTokens: undefined,
            completionTokens: undefined,
          });
        }
      }

      if (isPromptLoggingEnabled()) {
        await logPrompt({
          promptType:
            params.actionType || params.purpose || 'groq_direct_wandb',
          input: `System: ${params.system || ''}\n\nUser: ${params.prompt}`,
          output: result.text,
          metadata: {
            provider: 'wandb',
            model,
            temperature: params.temperature ?? 0.7,
            maxTokens: params.maxTokens ?? 8192,
          },
        });
      }

      return result.text;
    }
  }

  // Fallback to Groq models if no W&B model available
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set and no W&B model available');
  }

  const groq = createGroq({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  // Default to llama-3.1-8b-instant for fast evaluation (free tier)
  // For larger tasks, use qwen3-32b
  model =
    params.modelSize === 'large' ? 'qwen/qwen3-32b' : 'llama-3.1-8b-instant';

  apiKey = process.env.GROQ_API_KEY;
  baseURL = 'https://api.groq.com/openai/v1';

  const startTime = Date.now();

  // Add timeout to prevent hanging (60 seconds default, configurable)
  const timeoutMs = params.maxTokens && params.maxTokens < 500 ? 20000 : 60000; // Shorter timeout for small outputs

  const result = await Promise.race([
    generateText({
      model: groq.languageModel(model),
      prompt: params.prompt,
      system: params.system,
      temperature: params.temperature ?? 0.7,
      maxOutputTokens: params.maxTokens ?? 8192,
      maxRetries: 2,
    }),
    new Promise<{ text: string }>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`LLM call timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);

  const latencyMs = Date.now() - startTime;

  // Log to trajectory if available
  if (params.trajectoryLogger && params.trajectoryId) {
    const stepId = params.trajectoryLogger.getCurrentStepId(
      params.trajectoryId
    );
    if (stepId) {
      params.trajectoryLogger.logLLMCall(stepId, {
        model,
        systemPrompt: params.system || '',
        userPrompt: params.prompt,
        response: result.text,
        temperature: params.temperature ?? 0.7,
        maxTokens: params.maxTokens ?? 8192,
        purpose: params.purpose || 'action',
        actionType: params.actionType,
        latencyMs,
        promptTokens: undefined, // Token counts not available from Groq SDK
        completionTokens: undefined,
      });
    }
  }

  if (isPromptLoggingEnabled()) {
    await logPrompt({
      promptType: params.actionType || params.purpose || 'groq_direct',
      input: `System: ${params.system || ''}\n\nUser: ${params.prompt}`,
      output: result.text,
      metadata: {
        provider: 'groq',
        model,
        temperature: params.temperature ?? 0.7,
        maxTokens: params.maxTokens ?? 8192,
      },
    });
  }

  return result.text;
}
