/**
 * Trending Summary Service
 * 
 * Generates real LLM-powered summaries for trending tags (not templates)
 */

import { logger } from '@/lib/logger'
import OpenAI from 'openai'

// Lazy initialization to avoid build-time errors when API keys aren't available
let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
  if (openaiClient) {
    return openaiClient
  }

  const groqKey = process.env.GROQ_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  // Return null if no API keys available (build time or missing config)
  if (!groqKey && !openaiKey) {
    return null
  }

  const useGroq = !!groqKey
  openaiClient = new OpenAI({
    apiKey: groqKey || openaiKey,
    baseURL: useGroq
      ? 'https://api.groq.com/openai/v1'
      : 'https://api.openai.com/v1',
  })

  return openaiClient
}

/**
 * Generate a one-sentence summary for a trending tag based on recent posts
 */
export async function generateTrendingSummary(
  tagDisplayName: string,
  category: string | null,
  recentPosts: string[]
): Promise<string> {
  // Combine recent posts for context
  const context = recentPosts.slice(0, 3).join(' | ')

  // If no context, return a generic summary
  if (!context || context.trim().length === 0) {
    return `Trending topic in ${category || 'general'} discussions`
  }

  // Get OpenAI client (may be null during build or if keys not configured)
  const client = getOpenAIClient()
  if (!client) {
    // Fallback for build time or when API keys aren't available
    logger.debug('OpenAI client not available, using fallback summary', {
      tag: tagDisplayName,
    }, 'TrendingSummaryService')
    return `Active discussions about ${tagDisplayName}${category ? ` in ${category}` : ''}`
  }

  const useGroq = !!process.env.GROQ_API_KEY
  const prompt = `Generate a ONE SENTENCE summary for the trending topic "${tagDisplayName}" (Category: ${category || 'General'}).

Recent posts about this topic:
${context}

Requirements:
- Exactly ONE sentence, no more than 12 words
- Describe what people are discussing/why it's trending
- Natural, engaging tone like X/Twitter
- No hashtags, no emojis
- Don't start with "People are..." or "Users are..."

Examples:
- "Latest developments in SpaceX launch schedule"
- "Market reactions to new AI regulation"
- "Breaking news on election results"

One sentence summary:`

  const response = await client.chat.completions.create({
    model: useGroq ? 'llama-3.1-8b-instant' : 'gpt-4o-mini',  // 130k in/out, no restrictions
    messages: [
      {
        role: 'system',
        content: 'You are a trending topics summarization expert. Generate concise, engaging one-sentence summaries.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 50,
  })

  let cleanSummary = response.choices[0]!.message.content!.trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\.$/, '')
    .trim()

  if (!cleanSummary.endsWith('.') && !cleanSummary.endsWith('!') && !cleanSummary.endsWith('?')) {
    cleanSummary += '.'
  }

  const wordCount = cleanSummary.split(' ').length
  if (wordCount > 20) {
    cleanSummary = cleanSummary.split(' ').slice(0, 12).join(' ') + '...'
  }

  logger.debug('Generated trending summary', {
    tag: tagDisplayName,
    summary: cleanSummary,
    wordCount,
  }, 'TrendingSummaryService')

  return cleanSummary
}

/**
 * Generate summaries for multiple trending tags
 */
export async function generateTrendingSummaries(
  tags: Array<{
    displayName: string
    category: string | null
    recentPosts: string[]
  }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  // Process in small batches to avoid rate limits
  for (const tag of tags) {
    const summary = await generateTrendingSummary(
      tag.displayName,
      tag.category,
      tag.recentPosts
    )
    results.set(tag.displayName, summary)
    
    // Small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return results
}
