/**
 * Admin AI Models API
 * 
 * @route GET /api/admin/ai-models - Get AI model configuration
 * @route POST /api/admin/ai-models - Update AI model configuration
 * @access Admin
 * 
 * @description
 * Manages AI model configuration including wandb model selection and system
 * AI settings. GET returns current configuration and available models.
 * POST updates model selection.
 * 
 * @openapi
 * /api/admin/ai-models:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get AI model configuration
 *     description: Returns current AI configuration and available models (admin only)
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activeProvider:
 *                   type: string
 *                 providers:
 *                   type: object
 *                 wandbModels:
 *                   type: array
 *                 settings:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *   post:
 *     tags:
 *       - Admin
 *     summary: Update AI model configuration
 *     description: Updates AI model selection and settings (admin only)
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               wandbEnabled:
 *                 type: boolean
 *               wandbModelId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *       400:
 *         description: Invalid configuration
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 * 
 * @example
 * ```typescript
 * const config = await fetch('/api/admin/ai-models', {
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * }).then(r => r.json());
 * ```
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import OpenAI from 'openai';

/**
 * GET /api/admin/ai-models
 * Returns current AI configuration and available models
 */
export async function GET(_req: NextRequest) {
  try {
    // Get current settings
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 'system' },
    });

    // Check available providers
    const providers = {
      wandb: !!process.env.WANDB_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      claude: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    };

    // Get active provider (based on priority)
    let activeProvider: 'wandb' | 'groq' | 'claude' | 'openai' = 'openai';
    if (providers.wandb && settings?.wandbEnabled) {
      activeProvider = 'wandb';
    } else if (providers.groq) {
      activeProvider = 'groq';
    } else if (providers.claude) {
      activeProvider = 'claude';
    }

    // Fetch available wandb models if wandb is available
    let wandbModels: { id: string; name: string; description?: string }[] = [];
    if (providers.wandb) {
      try {
        const wandbClient = new OpenAI({
          apiKey: process.env.WANDB_API_KEY!,
          baseURL: 'https://api.inference.wandb.ai/v1',
        });

        const modelsResponse = await wandbClient.models.list();
        wandbModels = modelsResponse.data.map((model) => ({
          id: model.id,
          name: model.id,
          description: `${model.id}`,
        }));
      } catch (error) {
        logger.error('Failed to fetch wandb models', { error }, 'AIModelsAPI');
        // Return empty array on error
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        currentSettings: {
          wandbModel: settings?.wandbModel ?? null,
          wandbEnabled: settings?.wandbEnabled ?? false,
        },
        providers,
        activeProvider,
        wandbModels,
        recommendedModels: [
          {
            id: 'OpenPipe/Qwen3-14B-Instruct',
            name: 'Qwen 3 14B (OpenPipe Trained)',
            description: '⭐ Best for agents: Our custom RL-trained model',
          },
          {
            id: 'Qwen/Qwen2.5-32B-Instruct',
            name: 'Qwen 2.5 32B Instruct',
            description: '⚡ Best for quality content: events, articles, posts, decisions',
          },
          {
            id: 'meta-llama/Llama-3.1-8B-Instruct',
            name: 'Llama 3.1 8B Instruct',
            description: '🚀 Best for frequent operations: comments, DMs, tags, evaluations',
          },
        ],
      },
    });
  } catch (error) {
    logger.error('Failed to get AI models', { error }, 'AIModelsAPI');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get AI models configuration',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/ai-models
 * Updates AI model configuration
 */
export async function PUT(req: NextRequest) {
  try {
    let body: { wandbModel?: string; wandbEnabled?: boolean }
    try {
      body = await req.json() as { wandbModel?: string; wandbEnabled?: boolean }
    } catch (error) {
      logger.error('Failed to parse request body', { error }, 'POST /api/admin/ai-models')
      return NextResponse.json({
        success: false,
        error: 'Invalid request body'
      }, { status: 400 })
    }
    const { wandbModel, wandbEnabled } = body;

    // Validate inputs
    if (wandbEnabled && !process.env.WANDB_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot enable wandb without WANDB_API_KEY environment variable',
        },
        { status: 400 }
      );
    }

    // Update or create settings
    const settings = await prisma.systemSettings.upsert({
      where: { id: 'system' },
      update: {
        wandbModel: typeof wandbModel === 'string' ? wandbModel : null,
        wandbEnabled: typeof wandbEnabled === 'boolean' ? wandbEnabled : undefined,
      },
      create: {
        id: 'system',
        wandbModel: typeof wandbModel === 'string' ? wandbModel : null,
        wandbEnabled: typeof wandbEnabled === 'boolean' ? wandbEnabled : undefined,
      },
    });

    logger.info('Updated AI model configuration', { 
      wandbModel, 
      wandbEnabled 
    }, 'AIModelsAPI');

    // Clear the cache so the new config is picked up
    const { clearAIModelConfigCache } = await import('@/lib/ai-model-config');
    clearAIModelConfigCache();

    // Also update the environment variable for immediate effect
    if (wandbEnabled && typeof wandbModel === 'string') {
      process.env.WANDB_MODEL = wandbModel;
    }

    return NextResponse.json({
      success: true,
      data: {
        wandbModel: settings.wandbModel,
        wandbEnabled: settings.wandbEnabled,
      },
      message: 'AI model configuration updated successfully',
    });
  } catch (error) {
    logger.error('Failed to update AI models', { error }, 'AIModelsAPI');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update AI model configuration',
      },
      { status: 500 }
    );
  }
}

