/**
 * AI Field Generation API
 * 
 * @route POST /api/agents/generate-field - Generate field content
 * @access Public
 * 
 * @description
 * AI-powered content generation for agent configuration fields using Groq
 * or Claude. Generates contextually appropriate content for agent profiles,
 * personalities, system prompts, trading strategies, etc.
 * 
 * @openapi
 * /api/agents/generate-field:
 *   post:
 *     tags:
 *       - Agents
 *     summary: Generate field content
 *     description: Generates AI content for agent configuration fields
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fieldName
 *             properties:
 *               fieldName:
 *                 type: string
 *                 enum: [name, description, system, bio, personality, tradingStrategy]
 *                 description: Field to generate
 *               currentValue:
 *                 type: string
 *                 description: Current/partial value for enhancement
 *               context:
 *                 type: object
 *                 description: Context for generation
 *                 properties:
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   system:
 *                     type: string
 *     responses:
 *       200:
 *         description: Content generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 value:
 *                   type: string
 *       400:
 *         description: Missing field name
 *       503:
 *         description: No LLM API key configured
 * 
 * @example
 * ```typescript
 * const { value } = await fetch('/api/agents/generate-field', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ fieldName: 'name' })
 * }).then(r => r.json());
 * 
 * // Generate system prompt with context
 * const system = await fetch('/api/agents/generate-field', {
 *   method: 'POST',
 *   body: JSON.stringify({
 *     fieldName: 'system',
 *     context: {
 *       name: 'TraderBot',
 *       description: 'A conservative trading agent'
 *     }
 *   })
 * }).then(r => r.json());
 * 
 * // Enhance partial input
 * const enhanced = await fetch('/api/agents/generate-field', {
 *   method: 'POST',
 *   body: JSON.stringify({
 *     fieldName: 'description',
 *     currentValue: 'An agent that focuses on',
 *     context: { name: 'MarketMaker' }
 *   })
 * }).then(r => r.json());
 * ```
 * 
 * @see {@link /src/app/agents/create/page.tsx} Agent creation UI
 * @see {@link https://console.groq.com/docs/models} Groq API
 * @see {@link https://www.anthropic.com/api} Anthropic API
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createGroq } from '@ai-sdk/groq'
import { generateText } from 'ai'
import { logger } from '@/lib/logger'
import { authenticateUser } from '@/lib/server-auth'
import { checkRateLimitAndDuplicates, RATE_LIMIT_CONFIGS } from '@/lib/rate-limiting'

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req)
    
    // Apply rate limiting - 10 field generations per minute
    const rateLimitError = checkRateLimitAndDuplicates(
      user.userId,
      null, // No duplicate detection for field generation
      RATE_LIMIT_CONFIGS.GENERATE_AGENT_FIELD
    )
    
    if (rateLimitError) {
      logger.warn('Agent field generation rate limit exceeded', { userId: user.userId }, 'GenerateField')
      return rateLimitError
    }
    
    const { fieldName, currentValue, context } = await req.json()

    const prompt = buildPromptForField(fieldName, currentValue, context)
    const systemPrompt = `You are a helpful assistant that generates agent configurations. Be concise, professional, and authentic.`

    let generatedValue: string

    // Use Groq qwen/qwen3-32b if available, otherwise fall back to Claude
    if (process.env.GROQ_API_KEY) {
      const groq = createGroq({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1'
      })

      const result = await generateText({
        model: groq.languageModel('qwen/qwen3-32b'),
        prompt,
        system: systemPrompt,
        temperature: 0.8,
        maxOutputTokens: 300
      })

      generatedValue = result.text.trim()
      logger.info('Generated agent field with Groq', { fieldName, provider: 'groq' }, 'GenerateField')
    } else if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        temperature: 0.8,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })

      const firstContent = message.content[0]!
      generatedValue = (firstContent as { text: string }).text.trim()
      logger.info('Generated agent field with Claude', { fieldName, provider: 'claude' }, 'GenerateField')
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No LLM API key configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY.'
        },
        { status: 503 }
      )
    }

    const cleanedValue = generatedValue.replace(/^["']|["']$/g, '')

    return NextResponse.json({
      success: true,
      value: cleanedValue
    })
  } catch (error) {
    logger.error('Error generating agent field', { error }, 'generate-field')
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate field'
      },
      { status: 500 }
    )
  }
}

function buildPromptForField(
  fieldName: string,
  currentValue: string | undefined,
  context: Record<string, string | undefined>
): string {
  const hasCurrentValue = currentValue && currentValue.length > 0

  // Build context summary
  let contextSummary = ''
  if (context.name) contextSummary += `Name: ${context.name}\n`
  if (context.description) contextSummary += `Description: ${context.description}\n`

  switch (fieldName) {
    case 'name':
      return `Generate a creative, memorable name for an AI agent. It should sound intelligent and professional. Just return the name, nothing else.`

    case 'description':
      if (hasCurrentValue) {
        return `Complete or enhance this agent description:\n"${currentValue}"\n${
          contextSummary ? `\nContext:\n${contextSummary}` : ''
        }\nProvide a natural, complete description (1-2 sentences). Just return the enhanced text, no quotes or explanations.`
      }
      return `Write a brief, natural description (1-2 sentences) for an AI agent${
        context.name ? ` named ${context.name}` : ''
      }. Describe what makes this agent unique and useful. Just return the description, no quotes or explanations.`

    case 'system':
      return `Write a system prompt for an AI agent${context.name ? ` named ${context.name}` : ''}${
        context.description ? ` that is ${context.description}` : ''
      }. The system prompt should define the agent's role, personality, and how it should behave. Keep it 2-3 sentences. Just return the system prompt starting with "You are...", no quotes or explanations.`

    case 'bio':
      return `Generate 3 short bio points (separated by |) for an AI agent${context.name ? ` named ${context.name}` : ''}${
        context.description ? ` that is ${context.description}` : ''
      }. Each point should be 3-5 words highlighting a key trait or capability. Format: "Point 1|Point 2|Point 3". Just return the points, nothing else.`

    case 'personality':
      return `Write a personality description (2-3 sentences) for an AI agent${context.name ? ` named ${context.name}` : ''}${
        context.description ? ` that is ${context.description}` : ''
      }${context.system ? `\n\nSystem prompt: ${context.system}` : ''}. Describe how the agent communicates and interacts. Just return the personality description, no quotes or explanations.`

    case 'tradingStrategy':
      return `Write a trading strategy description (2-3 sentences) for an AI trading agent${context.name ? ` named ${context.name}` : ''}${
        context.description ? ` that is ${context.description}` : ''
      }. Describe the agent's approach to trading, risk management, and decision-making. Just return the strategy description, no quotes or explanations.`

    default:
      return `Generate a value for ${fieldName}${contextSummary ? ` using this context:\n${contextSummary}` : ''}.`
  }
}

