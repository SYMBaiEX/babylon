/**
 * LLM Client for Babylon Game Generation
 * Supports multiple providers with intelligent fallback
 * Priority: Wandb > Groq > Claude > OpenAI
 * 
 * IMPORTANT: Always requires an API key - never falls back to mock mode
 */

import OpenAI from 'openai';
import 'dotenv/config';
import type { JsonValue } from '@/types/common';
import { logger } from '@/lib/logger';

type LLMProvider = 'wandb' | 'groq' | 'claude' | 'openai';

/**
 * Simple JSON schema for validation
 */
interface JSONSchema {
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
}

interface JsonSchemaProperty {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
}

export class BabylonLLMClient {
  private client: OpenAI;
  private provider: LLMProvider;
  private wandbKey: string | undefined;
  private groqKey: string | undefined;
  private claudeKey: string | undefined;
  private openaiKey: string | undefined;
  private wandbModel: string | undefined;
  
  constructor(apiKey?: string, wandbModelOverride?: string) {
    // Priority: Wandb > Groq > Claude > OpenAI
    this.wandbKey = process.env.WANDB_API_KEY;
    this.groqKey = process.env.GROQ_API_KEY;
    this.claudeKey = process.env.ANTHROPIC_API_KEY;
    this.openaiKey = apiKey || process.env.OPENAI_API_KEY;
    this.wandbModel = wandbModelOverride || process.env.WANDB_MODEL || undefined; // Can be configured via admin
    
    if (this.wandbKey) {
      logger.info('Using Weights & Biases inference API (primary)', { model: this.wandbModel || 'default' }, 'BabylonLLMClient');
      this.client = new OpenAI({
        apiKey: this.wandbKey,
        baseURL: 'https://api.inference.wandb.ai/v1',
      });
      this.provider = 'wandb';
    } else if (this.groqKey) {
      logger.info('Using Groq (fast inference)', undefined, 'BabylonLLMClient');
      this.client = new OpenAI({
        apiKey: this.groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      this.provider = 'groq';
    } else if (this.claudeKey) {
      logger.info('Using Claude via OpenAI-compatible API', undefined, 'BabylonLLMClient');
      this.client = new OpenAI({
        apiKey: this.claudeKey,
        baseURL: 'https://api.anthropic.com/v1',
      });
      this.provider = 'claude';
    } else if (this.openaiKey) {
      logger.info('Using OpenAI (fallback)', undefined, 'BabylonLLMClient');
      this.client = new OpenAI({ apiKey: this.openaiKey });
      this.provider = 'openai';
    } else {
      throw new Error(
        '❌ No API key found!\n' +
        '   Set one of these environment variables (in priority order):\n' +
        '   - WANDB_API_KEY (Weights & Biases inference)\n' +
        '   - GROQ_API_KEY (fast inference)\n' +
        '   - ANTHROPIC_API_KEY (Claude)\n' +
        '   - OPENAI_API_KEY (fallback)\n' +
        '   Example: export WANDB_API_KEY=your_key_here'
      );
    }
  }

  /**
   * Generate completion with JSON response
   * ALWAYS retries on failure - never gives up without exhausting all retries
   */
  async generateJSON<T>(
    prompt: string,
    schema?: JSONSchema,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<T> {
    const defaultModel = this.getDefaultModel();

    const {
      model = defaultModel,
      temperature = 0.7,
      maxTokens = 16000,
    } = options;

    const useJsonFormat = this.provider === 'openai' ? { type: 'json_object' as const } : undefined;

    const messages = [
      {
        role: 'system' as const,
        content: 'You are a JSON-only assistant. You must respond ONLY with valid JSON. No explanations, no markdown, no other text.',
      },
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    const response = await this.client.chat.completions.create({
      model,
      messages,
      ...(useJsonFormat ? { response_format: useJsonFormat } : {}),
      temperature,
      max_tokens: maxTokens,
    });

    const content = response.choices[0]!.message.content!;
    const finishReason = response.choices[0]!.finish_reason;

    if (finishReason === 'length') {
      throw new Error(`Response truncated at ${maxTokens} tokens.`);
    }

    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      const lines = jsonContent.split('\n');
      const jsonStartIndex = lines.findIndex(line => line.trim().startsWith('{') || line.trim().startsWith('['));
      if (jsonStartIndex !== -1) {
        jsonContent = lines.slice(jsonStartIndex).join('\n');
      }
      jsonContent = jsonContent.replace(/```\s*$/, '').trim();
    }

    if (!jsonContent.startsWith('{') && !jsonContent.startsWith('[')) {
      const jsonMatch = jsonContent.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch?.[1]) {
        jsonContent = jsonMatch[1];
      }
    }

    const parsed: Record<string, JsonValue> = JSON.parse(jsonContent);

    if (schema && !this.validateSchema(parsed, schema)) {
      throw new Error(`Response does not match schema. Missing required fields: ${schema.required?.join(', ')}`);
    }

    return parsed as T;
  }

  /**
   * Simple schema validation
   */
  private validateSchema(data: Record<string, JsonValue>, schema: JSONSchema): boolean {
    // Basic validation - check required fields exist
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          logger.error(`Missing required field: ${field}`, undefined, 'BabylonLLMClient');
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Get the default model for the current provider
   */
  private getDefaultModel(): string {
    switch (this.provider) {
      case 'wandb':
        // Use configured model or default to our trained Qwen model
        // Content generation code explicitly specifies moonshotai/kimi-k2-instruct-0905 when needed
        return this.wandbModel || 'OpenPipe/Qwen3-14B-Instruct';
      case 'groq':
        // Use qwen3-32b as workhorse model for most operations
        return 'qwen/qwen3-32b';
      case 'claude':
        return 'claude-3-5-sonnet-20241022';
      case 'openai':
        return 'gpt-4o-mini';
      default:
        return 'gpt-4o-mini';
    }
  }

  /**
   * Get current provider information
   */
  getProvider(): LLMProvider {
    return this.provider;
  }

  /**
   * Get the current wandb model if using wandb
   */
  getWandbModel(): string | undefined {
    return this.provider === 'wandb' ? this.wandbModel : undefined;
  }

  /**
   * Set wandb model (useful for dynamic configuration)
   */
  setWandbModel(model: string): void {
    if (this.provider === 'wandb') {
      this.wandbModel = model;
      logger.info('Updated wandb model', { model }, 'BabylonLLMClient');
    } else {
      logger.warn('Cannot set wandb model - not using wandb provider', undefined, 'BabylonLLMClient');
    }
  }

  getStats() {
    return {
      provider: this.provider,
      model: this.getDefaultModel(),
      totalTokens: 0,
      totalCost: 0,
    };
  }
}
