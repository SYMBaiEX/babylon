/**
 * Tag Generation Service
 * 
 * Generates organic tags from post content using LLM
 * Similar to X's trending topics extraction
 */

import { logger } from '@/lib/logger'
import type OpenAI from 'openai'
import { logPrompt, isPromptLoggingEnabled } from '@/lib/debug/prompt-logger'

type OpenAIClient = OpenAI

// Try Groq first, then OpenAI (Groq is faster and often more reliable)
const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY
const baseURL = process.env.GROQ_API_KEY
  ? 'https://api.groq.com/openai/v1'
  : 'https://api.openai.com/v1'

// Lazy initialization - only create client when needed and API key is available
let openaiClient: OpenAIClient | null = null
let openaiImportAttempted = false

async function getOpenAIClient(): Promise<OpenAIClient | null> {
  if (!apiKey) {
    return null // No API key configured
  }
  if (openaiClient) {
    return openaiClient
  }

  if (!openaiImportAttempted) {
    openaiImportAttempted = true
    try {
      const { default: OpenAI } = await import('openai')
      openaiClient = new OpenAI({
        apiKey,
        baseURL,
      })
    } catch (error) {
      logger.warn(
        'OpenAI SDK not available, tag generation disabled',
        { error },
        'TagGenerationService'
      )
      openaiClient = null
    }
  }

  return openaiClient
}

export interface GeneratedTag {
  name: string        // lowercase, normalized (e.g., "nfc-north")
  displayName: string // original display format (e.g., "NFC North")
  category?: string   // auto-detected category (e.g., "Sports", "Politics", "Tech")
}

/**
 * Generate 1-3 organic tags from post content
 */
export async function generateTagsFromPost(content: string): Promise<GeneratedTag[]> {
  const openai = await getOpenAIClient()
  
  // If no API key configured, return empty tags (graceful degradation)
  if (!openai) {
    logger.warn('Tag generation skipped - no GROQ_API_KEY or OPENAI_API_KEY configured', undefined, 'TagGenerationService')
    return []
  }
  
  const prompt = `Extract 1-3 trending tags from this social media post. Tags should be topics people would search for on X/Twitter.

POST: "${content}"

RULES:
1. Extract SPECIFIC names, companies, products, or events (not generic topics)
2. Use the EXACT names from the post (preserve parody names like "AIlon Musk", "OpenAGI", "TeslAI")
3. Keep tags 1-3 words max
4. Return 1-3 tags (quality over quantity)
5. Tags should CLUSTER together - if post mentions related things, use tags that will group

GOOD TAGS (specific, searchable, will cluster):
- Person names: "AIlon Musk", "Sam AIltman", "Mark Zuckerborg"
- Company names: "OpenAGI", "TeslAI", "MetAI", "NvidAI"
- Products: "GPT-6", "Cybertruck", "Vision Pro"
- Events: "DevDay", "SEC Hearing", "Earnings Call"
- Specific topics: "AGI Timeline", "Crypto Regulation", "AI Safety"

BAD TAGS (too generic, won't cluster):
- "AI" (too broad - use specific company or product)
- "Tech" (too generic)
- "News" (not a topic)
- "Breaking" (not searchable)
- "Market" (use specific market like "Bitcoin" or "NVDA")

CLUSTERING EXAMPLES:
- Post about Sam AIltman announcing GPT-6 → tags: "Sam AIltman", "GPT-6", "OpenAGI" (all will cluster)
- Post about TeslAI stock after Musk tweet → tags: "TeslAI", "AIlon Musk" (will cluster)
- Post comparing NvidAI to AMD → tags: "NvidAI", "AMD" (separate companies, separate clusters)

CATEGORIES: Tech, Crypto, Finance, Politics, Entertainment, Media, AI, Gaming

Return ONLY valid XML:
<response>
  <tags>
    <tag>
      <displayName>Sam AIltman</displayName>
      <category>Tech</category>
    </tag>
    <tag>
      <displayName>OpenAGI</displayName>
      <category>AI</category>
    </tag>
  </tags>
</response>

If no good tags, return: <response><tags></tags></response>`

  // Use llama-3.1-8b-instant for fast tag generation (free tier)
  const model = process.env.GROQ_API_KEY 
    ? 'llama-3.1-8b-instant' // Free tier: Fast and efficient
    : 'gpt-5-nano'

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are an XML-only assistant for tag extraction. You must respond ONLY with valid XML. No JSON, no explanations, no markdown.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 500, // Increased for XML (more verbose than JSON)
  })

  const content_text = response.choices[0]?.message?.content?.trim()

  if (isPromptLoggingEnabled()) {
    await logPrompt({
      promptType: 'tag_generation',
      input: `System: You are an XML-only assistant for tag extraction. You must respond ONLY with valid XML. No JSON, no explanations, no markdown.\n\nUser: ${prompt}`,
      output: content_text || '',
      metadata: {
        provider: process.env.GROQ_API_KEY ? 'groq' : 'openai',
        model,
        temperature: 0.3,
        maxTokens: 500
      }
    })
  }

  if (!content_text) {
    logger.warn('No content in tag generation response', { content }, 'TagGenerationService')
    return []
  }

  // Parse XML response
  const xmlContent = content_text
    .replace(/```xml\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
  
  // Extract tags from XML (handles both <response><tags> and just <tags> wrappers)
  const tags: Array<{ displayName: string; category?: string }> = [];
  
  try {
    // Simple XML parsing for tag structure
    const tagMatches = xmlContent.matchAll(/<tag>([\s\S]*?)<\/tag>/g);
    
    for (const tagMatch of tagMatches) {
      const tagContent = tagMatch[1];
      if (!tagContent) continue;
      
      const displayNameMatch = tagContent.match(/<displayName>(.*?)<\/displayName>/);
      const categoryMatch = tagContent.match(/<category>(.*?)<\/category>/);
      
      if (displayNameMatch && displayNameMatch[1]) {
        const displayName = displayNameMatch[1].trim();
        // Skip generic tags that won't cluster well
        const genericTags = ['ai', 'tech', 'news', 'breaking', 'market', 'update', 'latest'];
        if (genericTags.includes(displayName.toLowerCase())) {
          logger.debug('Skipping generic tag', { displayName }, 'TagGenerationService');
          continue;
        }
        
        tags.push({
          displayName,
          category: categoryMatch?.[1]?.trim(),
        });
      }
    }
    
    // Log if no tags found
    if (tags.length === 0) {
      logger.debug('No specific tags extracted from post', { 
        xmlPreview: xmlContent.substring(0, 200),
        contentPreview: content.substring(0, 100)
      }, 'TagGenerationService');
    }
  } catch (error) {
    logger.error('Failed to parse tag generation XML', { 
      error, 
      xmlContent: xmlContent.substring(0, 200),
      contentPreview: content.substring(0, 100)
    }, 'TagGenerationService');
    // Return empty array on parse error instead of crashing
    return [];
  }

  const generatedTags: GeneratedTag[] = tags
    .filter(tag => tag.displayName && typeof tag.displayName === 'string')
    .map(tag => {
      const displayName = tag.displayName.trim()
      const name = displayName
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
      
      return {
        name,
        displayName,
        category: tag.category,
      }
    })
    .filter(tag => tag.name.length > 0 && tag.displayName.length <= 50)

  logger.debug('Generated tags from post', {
    content: content.slice(0, 100),
    tagsCount: generatedTags.length,
    tags: generatedTags,
  }, 'TagGenerationService')

  return generatedTags
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

