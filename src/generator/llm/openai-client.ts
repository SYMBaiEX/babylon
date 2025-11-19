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
import { parseContinuationContent, cleanMarkdownCodeBlocks, extractJsonFromText } from './json-continuation-parser';
import { parseXML } from './xml-parser';

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

  /**
   * Create a BabylonLLMClient configured to use Groq provider (Priority #1 for game NPCs)
   * This is a convenience factory method for forcing Groq without passing undefined parameters
   */
  static forGroq(): BabylonLLMClient {
    return new BabylonLLMClient('', '', 'groq');
  }

  /**
   * Create a BabylonLLMClient configured to use Anthropic/Claude provider (Priority #2)
   * This is a convenience factory method for forcing Claude without passing undefined parameters
   */
  static forClaude(): BabylonLLMClient {
    return new BabylonLLMClient('', '', 'claude');
  }

  /**
   * Create a BabylonLLMClient configured to use OpenAI provider (Priority #3 - fallback)
   * This is a convenience factory method for forcing OpenAI without passing undefined parameters
   */
  static forOpenAI(apiKey?: string): BabylonLLMClient {
    return new BabylonLLMClient(apiKey || '', '', 'openai');
  }

  /**
   * Create a BabylonLLMClient configured to use a specific Wandb model
   * This is a convenience factory method for testing Wandb models
   * 
   * ⚠️ WARNING: Wandb models should ONLY be used for agent operations, not game tick operations
   */
  static forWandb(modelName: string): BabylonLLMClient {
    return new BabylonLLMClient('', modelName, undefined);
  }

  /**
   * Create a BabylonLLMClient for game tick operations (excludes Wandb)
   * Priority: Groq > Claude > OpenAI
   * 
   * ⚠️ IMPORTANT: Wandb models should ONLY be used for agent operations.
   * Game tick operations (content generation, market decisions, etc.) should use this method.
   */
  static forGameTick(): BabylonLLMClient {
    // Check providers in order, skipping Wandb
    if (process.env.GROQ_API_KEY) {
      return new BabylonLLMClient('', '', 'groq');
    } else if (process.env.ANTHROPIC_API_KEY) {
      return new BabylonLLMClient('', '', 'claude');
    } else if (process.env.OPENAI_API_KEY) {
      return new BabylonLLMClient('', '', 'openai');
    } else {
      // Fallback: throw error if no non-Wandb providers available
      throw new Error(
        '❌ No API key found for game tick operations!\n' +
        '   Game tick operations cannot use Wandb (Wandb is reserved for agents only).\n' +
        '   Set one of these environment variables:\n' +
        '   - GROQ_API_KEY (recommended for game tick)\n' +
        '   - ANTHROPIC_API_KEY\n' +
        '   - OPENAI_API_KEY\n' +
        '   Example: export GROQ_API_KEY=your_key_here'
      );
    }
  }

  constructor(apiKey?: string, wandbModelOverride?: string, forceProvider?: LLMProvider) {
    // Priority: Wandb > Groq > Claude > OpenAI (unless forceProvider is set)
    this.wandbKey = process.env.WANDB_API_KEY;
    this.groqKey = process.env.GROQ_API_KEY;
    this.claudeKey = process.env.ANTHROPIC_API_KEY;
    this.openaiKey = apiKey || process.env.OPENAI_API_KEY;
    this.wandbModel = wandbModelOverride || process.env.WANDB_MODEL || undefined; // Can be configured via admin
    
    // Force specific provider if requested (only for special cases, e.g., testing specific providers)
    if (forceProvider === 'groq' && this.groqKey) {
      logger.info('Using Groq (forced)', undefined, 'BabylonLLMClient');
      this.client = new OpenAI({
        apiKey: this.groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      this.provider = 'groq';
    } else if (this.wandbKey && !forceProvider) {
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
   * Generate completion with structured response (XML or JSON)
   * ALWAYS retries on failure - never gives up without exhausting all retries
   * Defaults to XML for more robust parsing
   */
  async generateJSON<T>(
    prompt: string,
    schema?: JSONSchema,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      format?: 'xml' | 'json'; // Default to XML for robustness
    } = {}
  ): Promise<T> {
    const defaultModel = this.getDefaultModel();

    const {
      model = defaultModel,
      temperature = 0.7,
      maxTokens = 16000,
      format = 'xml', // Default to XML for more robust parsing
    } = options;

    // OpenAI can enforce JSON mode, but we default to XML for robustness
    const useJsonFormat = (this.provider === 'openai' && format === 'json') 
      ? { type: 'json_object' as const } 
      : undefined;

    const systemContent = format === 'xml'
      ? 'You are an XML-only assistant. CRITICAL INSTRUCTIONS:\n' +
        '1. Respond ONLY with valid XML - NO explanations, NO reasoning, NO markdown\n' +
        '2. Start your response IMMEDIATELY with < (the opening tag)\n' +
        '3. End your response with > (the closing tag)\n' +
        '4. Do NOT write "Okay, let\'s see" or any thinking process\n' +
        '5. Do NOT write "Here is the XML" or any preamble\n' +
        '6. Just output the pure XML structure directly\n' +
        'WRONG: "Okay, let\'s see. I need to..."\n' +
        'CORRECT: "<decisions><decision>..."'
      : 'You are a JSON-only assistant. You must respond ONLY with valid JSON. No explanations, no markdown, no other text.';

    const messages = [
      {
        role: 'system' as const,
        content: systemContent,
      },
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    let retryCount = 0;
    const maxRetries = 3;
    const initialDelayMs = 2000;

    while (true) {
      try {
        const response = await this.client.chat.completions.create({
          model,
          messages,
          ...(useJsonFormat ? { response_format: useJsonFormat } : {}),
          temperature,
          max_tokens: maxTokens,
        });

        let content = response.choices[0]!.message.content!;
        let finishReason = response.choices[0]!.finish_reason;

        // Handle truncation by continuing generation (for models with 32k+ context)
        if (finishReason === 'length') {
          logger.warn('Response truncated, attempting continuation', { 
            model, 
            tokensUsed: maxTokens 
          }, 'BabylonLLMClient');
          
          // Try to continue generation up to 2 more times
          let continuationAttempts = 0;
          const maxContinuations = 2;
          
          while (finishReason === 'length' && continuationAttempts < maxContinuations) {
            continuationAttempts++;
            
            // Create continuation prompt
            const continuationMessages = [
              ...messages,
              {
                role: 'assistant' as const,
                content: content,
              },
              {
                role: 'user' as const,
                content: 'Continue from where you left off. Complete the remaining JSON array entries.',
              },
            ];
            
            logger.info(`Continuation attempt ${continuationAttempts}/${maxContinuations}`, { 
              contentLength: content.length 
            }, 'BabylonLLMClient');
            
            const continuationResponse = await this.client.chat.completions.create({
              model,
              messages: continuationMessages,
              ...(useJsonFormat ? { response_format: useJsonFormat } : {}),
              temperature,
              max_tokens: maxTokens,
            });
            
            const continuationContent = continuationResponse.choices[0]!.message.content!;
            finishReason = continuationResponse.choices[0]!.finish_reason;
            
            // Append continuation to content
            content += continuationContent;
            
            if (finishReason !== 'length') {
              logger.info('Continuation successful', { 
                attempts: continuationAttempts,
                finalLength: content.length 
              }, 'BabylonLLMClient');
              break;
            }
          }
          
          // If still truncated after max continuations, throw error
          if (finishReason === 'length') {
            throw new Error(`Response truncated at ${maxTokens} tokens after ${continuationAttempts} continuation attempts.`);
          }
        }

        // Parse based on requested format
        if (format === 'xml') {
          // Use XML parser (more robust, handles malformed content better)
          const xmlResult = parseXML(content);
          
          if (!xmlResult.success) {
            throw new Error(`Failed to parse XML: ${xmlResult.error}`);
          }
          
          logger.debug('Successfully parsed XML response', {
            hasData: xmlResult.data !== null,
            isArray: Array.isArray(xmlResult.data),
          }, 'BabylonLLMClient');
          
          return xmlResult.data as T;
        } else {
          // Use JSON parser (legacy)
          // If we had a continuation, use the advanced parser
          if (content.includes('Continue from where you left off')) {
            const parsed = parseContinuationContent(content);
            if (parsed !== null) {
              logger.info('Successfully parsed continuation content', { 
                isArray: Array.isArray(parsed),
                items: Array.isArray(parsed) ? parsed.length : 'N/A'
              }, 'BabylonLLMClient');
              return parsed as T;
            } else {
              logger.error('Failed to parse continuation content, attempting fallback', {
                contentPreview: content.substring(0, 200)
              }, 'BabylonLLMClient');
            }
          }

          // Standard JSON parsing for non-continuation responses
          let jsonContent = cleanMarkdownCodeBlocks(content);
          jsonContent = extractJsonFromText(jsonContent);
          
          const parsed: Record<string, JsonValue> = JSON.parse(jsonContent);

          if (schema && !this.validateSchema(parsed, schema)) {
            throw new Error(`Response does not match schema. Missing required fields: ${schema.required?.join(', ')}`);
          }

          return parsed as T;
        }
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string };
        // Handle 502/503/504 service errors with exponential backoff
        if (retryCount < maxRetries && (
            err?.status === 502 || 
            err?.status === 503 || 
            err?.status === 504 || 
            err?.message?.includes('502') || 
            err?.message?.includes('503') ||
            err?.message?.includes('service_unavailable')
        )) {
          retryCount++;
          const delay = initialDelayMs * Math.pow(2, retryCount - 1);
          
          logger.warn(`LLM Service Error (${err.status || 'unknown'}), retrying in ${delay}ms...`, {
            attempt: retryCount,
            maxRetries,
            error: err.message
          }, 'BabylonLLMClient');
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Re-throw if not a retryable error or retries exhausted
        throw error;
      }
    }
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
        // Content generation code explicitly specifies moonshotai/Kimi-K2-Instruct-0905 when needed
        return this.wandbModel || 'OpenPipe/Qwen3-14B-Instruct';
      case 'groq':
        // Use qwen3-32b as workhorse model for most operations
        return 'qwen/qwen3-32b';
      case 'claude':
        return 'claude-sonnet-4-5';
      case 'openai':
        return 'gpt-5-nano';
      default:
        return 'gpt-5-nano';
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
