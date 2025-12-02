/**
 * Admin AI Models API
 *
 * @route GET /api/admin/ai-models - Get AI model configuration
 * @access Admin
 *
 * @description
 * Returns current AI provider configuration and available providers.
 *
 * @openapi
 * /api/admin/ai-models:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get AI model configuration
 *     description: Returns current AI configuration and available providers (admin only)
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
import { logger } from '@babylon/shared';

/**
 * GET /api/admin/ai-models
 * Returns current AI configuration and available providers
 */
export async function GET(_req: NextRequest) {
  try {
    // Check available providers
    const providers = {
      groq: !!process.env.GROQ_API_KEY,
      claude: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    };

    // Get active provider (based on priority: Groq > Claude > OpenAI)
    let activeProvider: 'groq' | 'claude' | 'openai' = 'openai';
    if (providers.groq) {
      activeProvider = 'groq';
    } else if (providers.claude) {
      activeProvider = 'claude';
    }

    return NextResponse.json({
      success: true,
      data: {
        providers,
        activeProvider,
        recommendedModels: [
          {
            id: 'qwen/qwen3-32b',
            name: 'Qwen 3 32B (Groq)',
            description: '⭐ Best for quality content: events, articles, posts, decisions',
          },
          {
            id: 'llama-3.1-8b-instant',
            name: 'Llama 3.1 8B Instant (Groq)',
            description:
              '🚀 Best for frequent operations: comments, DMs, tags, evaluations',
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
