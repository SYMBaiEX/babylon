/**
 * LLM Client for Babylon Game Generation
 * Supports Groq (fast) and OpenAI (fallback)
 * Wrapper with retry logic and error handling
 * 
 * IMPORTANT: Always requires an API key - never falls back to mock mode
 */

import OpenAI from 'openai';
import 'dotenv/config';
import type { JsonValue } from '@/types/common';
import { logger } from '@/lib/logger';

type LLMProvider = 'groq' | 'openai';

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
  private maxRetries = 10; // Aggressive retries - never give up
  
  constructor(apiKey?: string) {
    // Priority: Groq > OpenAI
    const groqKey = process.env.GROQ_API_KEY;
    const openaiKey = apiKey || process.env.OPENAI_API_KEY;
    
    if (groqKey) {
      logger.info('Using Groq (fast inference)', undefined, 'BabylonLLMClient');
      this.client = new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      this.provider = 'groq';
    } else if (openaiKey) {
      logger.info('Using OpenAI', undefined, 'BabylonLLMClient');
      this.client = new OpenAI({ apiKey: openaiKey });
      this.provider = 'openai';
    } else {
      throw new Error(
        '❌ No API key found!\n' +
        '   Set GROQ_API_KEY or OPENAI_API_KEY environment variable.\n' +
        '   Example: export GROQ_API_KEY=your_key_here'
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
    // Select model based on provider
    const defaultModel = this.provider === 'groq' 
      ? 'llama-3.1-8b-instant'  // Groq's fastest model
      : 'gpt-5-mini';                 // OpenAI default

    const {
      model = defaultModel,
      temperature = 0.7,
      maxTokens = 16000, // High default - never truncate
    } = options;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a JSON-only assistant. You must respond ONLY with valid JSON. No explanations, no markdown, no other text.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: { type: 'json_object' },
          temperature,
          max_tokens: maxTokens,
        });

        const content = response.choices[0]?.message.content;
        const finishReason = response.choices[0]?.finish_reason;
        
        // Error if response was truncated - this should never happen with high token limits
        if (finishReason === 'length') {
          throw new Error(`Response truncated at ${maxTokens} tokens. This should not happen - token limit may need to be increased.`);
        }

        if (!content) {
          throw new Error('Empty response from LLM');
        }

        const parsed = JSON.parse(content);
        
        // Validate against schema if provided
        if (schema && !this.validateSchema(parsed, schema)) {
          logger.error('Schema validation failed. Expected schema:', schema, 'BabylonLLMClient');
          logger.error('Got response:', JSON.stringify(parsed, null, 2), 'BabylonLLMClient');
          throw new Error(`Response does not match schema. Missing required fields: ${schema.required?.join(', ')}`);
        }

        return parsed as T;
      } catch (error) {
        lastError = error as Error;
        const isRateLimit = lastError.message.includes('rate limit') || lastError.message.includes('429');
        const waitTime = isRateLimit ? 30000 : Math.min(1000 * Math.pow(2, attempt), 10000);
        
        logger.error(`Attempt ${attempt + 1}/${this.maxRetries} failed:`, lastError.message, 'BabylonLLMClient');
        
        if (attempt < this.maxRetries - 1) {
          logger.info(`Retrying in ${(waitTime / 1000).toFixed(1)}s... (${this.maxRetries - attempt - 1} retries left)`, undefined, 'BabylonLLMClient');
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // Final failure after all retries exhausted
    const errorMsg = `GENERATION FAILED after ${this.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`;
    logger.error(errorMsg, undefined, 'BabylonLLMClient');
    logger.error('Troubleshooting:', {
      step1: 'Check your API key is valid',
      step2: 'Verify you have API credits/quota remaining',
      step3: 'Check network connectivity',
      step4: 'Try again later if rate limited',
      provider: this.provider
    }, 'BabylonLLMClient');
    throw new Error(errorMsg);
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
   * Get provider info
   */
  getProvider(): LLMProvider {
    return this.provider;
  }

  /**
   * Get token usage stats
   */
  getStats() {
    return {
      provider: this.provider,
      totalTokens: 0,
      totalCost: 0,
    };
  }
}


