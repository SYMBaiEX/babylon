/**
 * Tag Generation Service
 * 
 * Generates organic tags from post content using LLM
 * Similar to X's trending topics extraction
 */

import { logger } from '@/lib/logger'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY,
  baseURL: process.env.OPENAI_API_KEY 
    ? 'https://api.openai.com/v1' 
    : 'https://api.groq.com/openai/v1',
})

export interface GeneratedTag {
  name: string        // lowercase, normalized (e.g., "nfc-north")
  displayName: string // original display format (e.g., "NFC North")
  category?: string   // auto-detected category (e.g., "Sports", "Politics", "Tech")
}

/**
 * Generate 1-3 organic tags from post content
 */
export async function generateTagsFromPost(content: string): Promise<GeneratedTag[]> {
  try {
    const prompt = `Analyze this social media post and extract 1-3 organic, trending-worthy tags.

Post: "${content}"

Rules:
1. Extract natural topics, names, events, or themes that people would search for
2. Format like X/Twitter trending topics (e.g., "NFC North", "Puka", "FanDuel")
3. Prioritize proper nouns, events, organizations, or trending terms
4. Keep tags concise (1-3 words max)
5. Return 1-3 tags only (prefer quality over quantity)
6. Categorize each tag (Sports, Politics, Tech, Finance, Entertainment, etc.)

Return ONLY a JSON array of objects with this exact format:
[
  {
    "displayName": "NFC North",
    "category": "Sports"
  },
  {
    "displayName": "Puka",
    "category": "Sports"
  }
]

If no good tags can be extracted, return an empty array: []`

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_API_KEY ? 'gpt-4' : 'llama-3.1-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a trending topics extraction expert. You analyze social media posts and extract organic, searchable tags that would appear in trending sections.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    })

    const content_text = response.choices[0]?.message?.content?.trim()
    if (!content_text) {
      logger.warn('No content in tag generation response', { content }, 'TagGenerationService')
      return []
    }

    // Parse JSON response
    let tags: Array<{ displayName: string; category?: string }>
    try {
      // Remove markdown code blocks if present
      const jsonContent = content_text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      
      tags = JSON.parse(jsonContent)
    } catch (parseError) {
      logger.error('Failed to parse tag generation JSON', { content_text, parseError }, 'TagGenerationService')
      return []
    }

    // Validate and normalize tags
    const generatedTags: GeneratedTag[] = []
    for (const tag of tags) {
      if (!tag.displayName || typeof tag.displayName !== 'string') {
        continue
      }

      const displayName = tag.displayName.trim()
      if (displayName.length === 0 || displayName.length > 50) {
        continue
      }

      // Normalize to lowercase, replace spaces with hyphens
      const name = displayName
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove special chars except hyphens
        .replace(/\s+/g, '-')     // Replace spaces with hyphens
        .replace(/-+/g, '-')      // Collapse multiple hyphens
        .trim()

      if (name.length > 0) {
      generatedTags.push({
        name,
        displayName,
        category: tag.category || undefined,
      })
      }
    }

    logger.debug('Generated tags from post', {
      content: content.slice(0, 100),
      tagsCount: generatedTags.length,
      tags: generatedTags,
    }, 'TagGenerationService')

    return generatedTags
  } catch (error) {
    logger.error('Error generating tags from post', { error, content }, 'TagGenerationService')
    return []
  }
}

/**
 * Generate tags in batch for multiple posts
 */
export async function generateTagsForPosts(
  posts: Array<{ id: string; content: string }>
): Promise<Map<string, GeneratedTag[]>> {
  const results = new Map<string, GeneratedTag[]>()

  // Process posts concurrently with a limit to avoid rate limits
  const BATCH_SIZE = 5
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE)
    const promises = batch.map(async (post) => {
      const tags = await generateTagsFromPost(post.content)
      return { postId: post.id, tags }
    })

    const batchResults = await Promise.all(promises)
    for (const { postId, tags } of batchResults) {
      results.set(postId, tags)
    }

    // Small delay between batches
    if (i + BATCH_SIZE < posts.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return results
}

