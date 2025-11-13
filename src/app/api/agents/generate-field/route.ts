import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  try {
    const { fieldName, currentValue, context } = await req.json()

    if (!fieldName) {
      return NextResponse.json(
        { success: false, error: 'Field name required' },
        { status: 400 }
      )
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicApiKey) {
      return NextResponse.json(
        { success: false, error: 'AI generation not configured' },
        { status: 500 }
      )
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    // Build context-aware prompt
    const prompt = buildPromptForField(fieldName, currentValue, context)

    const systemPrompt = `You are a helpful assistant that generates agent configurations. Be concise, professional, and authentic.`

    // Generate using Anthropic
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
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

    const firstContent = message.content[0]
    const generatedValue = firstContent && firstContent.type === 'text' 
      ? ('text' in firstContent ? firstContent.text.trim() : '')
      : ''

    // Clean up quotes
    const cleanedValue = generatedValue.replace(/^["']|["']$/g, '')

    return NextResponse.json({
      success: true,
      value: cleanedValue
    })
  } catch (error) {
    console.error('Error generating field:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate field' },
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

