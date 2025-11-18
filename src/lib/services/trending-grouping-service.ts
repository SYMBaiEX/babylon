/**
 * Trending Grouping Service
 * 
 * @description Uses LLM to intelligently group related trending tags together.
 * For example, "OpenAGI", "Sam Altman", and "GPT-5" become a single grouped trend.
 * Generates summaries for grouped trends and handles fallback logic when LLM
 * is unavailable.
 */

import { logger } from '@/lib/logger'
import OpenAI from 'openai'

// Configuration
const LLM_TIMEOUT_MS = 15000 // 15 seconds
const LLM_MAX_RETRIES = 2
const GROUPING_MODEL = process.env.TRENDING_GROUPING_MODEL || (process.env.GROQ_API_KEY ? 'llama-3.1-70b-versatile' : 'gpt-4o')
const SUMMARY_MODEL = process.env.TRENDING_SUMMARY_MODEL || (process.env.GROQ_API_KEY ? 'llama-3.1-8b-instant' : 'gpt-4o-mini')

// Check if LLM is available
const hasApiKey = !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY)
const useGroq = !!process.env.GROQ_API_KEY

// Only initialize OpenAI client if we have an API key
let openai: OpenAI | null = null
if (hasApiKey) {
  openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: useGroq
      ? 'https://api.groq.com/openai/v1'
      : 'https://api.openai.com/v1',
    timeout: LLM_TIMEOUT_MS,
  })
} else {
  logger.warn('No LLM API key configured (GROQ_API_KEY or OPENAI_API_KEY) - trending grouping will use fallback logic', undefined, 'TrendingGroupingService')
}

/**
 * Trending tag information
 * 
 * @description Contains information about a single trending tag including
 * ID, display name, slug, category, post count, summary, and rank.
 */
export interface TrendingTag {
  id: string
  tag: string
  tagSlug: string
  category: string | null
  postCount: number
  summary: string | null
  rank: number
}

/**
 * Grouped trend information
 * 
 * @description Contains information about a grouped trend including primary
 * tag ID, related tags, total post count, summary, and rank.
 */
export interface GroupedTrend {
  id: string // ID of the primary tag
  tags: string[] // Array of related tag display names
  tagSlugs: string[] // Array of tag slugs for routing
  tagIds: string[] // Array of tag IDs
  category: string | null
  totalPostCount: number
  summary: string
  rank: number
}

/**
 * LLM grouping instruction
 * 
 * @description Structure for LLM response containing grouping decisions.
 * @private
 */
interface GroupingInstruction {
  groupId: number
  tagNames: string[]
  reason: string
}

/**
 * Calculate estimated cost for LLM call (rough estimates)
 * 
 * @description Estimates the cost of an LLM API call based on model and token count.
 * Uses approximate pricing for Groq (free) and OpenAI models.
 * 
 * @param {string} model - Model identifier
 * @param {number} tokens - Number of tokens
 * @returns {number} Estimated cost in USD
 * @private
 */
function calculateCost(model: string, tokens: number): number {
  // Groq pricing (as of 2024): free tier, so $0
  if (model.includes('llama')) {
    return 0
  }
  
  // OpenAI pricing (approximate, per 1M tokens)
  // GPT-4o: $2.50 input, $10 output (average ~$6/1M)
  // GPT-4o-mini: $0.15 input, $0.60 output (average ~$0.375/1M)
  if (model.includes('gpt-4o-mini')) {
    return (tokens / 1000000) * 0.375
  } else if (model.includes('gpt-4o')) {
    return (tokens / 1000000) * 6
  }
  
  return 0
}

/**
 * Retry helper for LLM calls
 * 
 * @description Retries an LLM call with exponential backoff on failure.
 * 
 * @template T - Return type
 * @param {() => Promise<T>} fn - Function to retry
 * @param {number} [retries=LLM_MAX_RETRIES] - Number of retries
 * @param {string} [context='LLM call'] - Context for logging
 * @returns {Promise<T>} Result of the function
 * @throws {Error} If all retries fail
 * @private
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = LLM_MAX_RETRIES,
  context: string = 'LLM call'
): Promise<T> {
  let lastError: Error | undefined
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000) // Exponential backoff, max 5s
        logger.warn(`${context} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`, { error }, 'TrendingGroupingService')
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw lastError
}

/**
 * Fallback grouping logic based on category and post count similarity
 */
function fallbackGrouping(tags: TrendingTag[]): Map<string, number> {
  logger.info('Using fallback grouping logic (no LLM available)', undefined, 'TrendingGroupingService')
  
  // Simple heuristic: group tags in same category if they have similar post counts
  const categoryGroups = new Map<string, TrendingTag[]>()
  
  for (const tag of tags) {
    const _category = tag.category || 'general'
    if (!categoryGroups.has(_category)) {
      categoryGroups.set(_category, [])
    }
    categoryGroups.get(_category)!.push(tag)
  }
  
  const tagToGroup = new Map<string, number>()
  let groupId = 1
  
  for (const [_category, categoryTags] of categoryGroups.entries()) {
    if (categoryTags.length >= 2) {
      // Only group if tags have similar post counts (within 50%)
      categoryTags.sort((a, b) => b.postCount - a.postCount)
      for (let i = 0; i < categoryTags.length - 1; i++) {
        const tag1 = categoryTags[i]!
        const tag2 = categoryTags[i + 1]!
        const ratio = tag2.postCount / tag1.postCount
        
        if (ratio >= 0.5 && !tagToGroup.has(tag1.tag) && !tagToGroup.has(tag2.tag)) {
          tagToGroup.set(tag1.tag, groupId)
          tagToGroup.set(tag2.tag, groupId)
          groupId++
        }
      }
    }
  }
  
  return tagToGroup
}

/**
 * Use LLM to analyze and group related trending tags
 */
async function analyzeTagRelationships(tags: TrendingTag[]): Promise<Map<string, number>> {
  if (tags.length <= 1) {
    return new Map()
  }

  // If no LLM available, use fallback logic
  if (!openai) {
    return fallbackGrouping(tags)
  }

  const tagList = tags.map((t, i) => `${i + 1}. ${t.tag} (${t.category || 'General'}, ${t.postCount} posts)`).join('\n')

  const prompt = `You are analyzing trending topics to group related tags together. Your goal is to identify tags that represent the same story, person, organization, or event.

Trending tags:
${tagList}

Rules for grouping:
1. Group tags that are about the SAME person, organization, product, or event
2. Examples of related tags: "OpenAGI" + "Sam Altman" + "GPT-5", "Tesla" + "Elon Musk", "iPhone 15" + "Apple Event"
3. DON'T group tags just because they're in the same category
4. DON'T group unrelated tags (e.g., "Bitcoin" and "Ethereum" are separate)
5. Only create groups with 2+ tags
6. A tag can only belong to ONE group
7. If a tag doesn't relate to others, leave it ungrouped

Return your analysis as valid JSON in this EXACT format:
{
  "groups": [
    {
      "groupId": 1,
      "tagNames": ["OpenAGI", "Sam Altman"],
      "reason": "Both tags discuss the same organization and its CEO"
    }
  ]
}

If no tags should be grouped, return: {"groups": []}

IMPORTANT: Return ONLY valid JSON, no markdown, no explanations.`

  try {
    const startTime = Date.now()
    
    const response = await withRetry(
      async () => await openai!.chat.completions.create({
        model: GROUPING_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a JSON-only assistant that analyzes trending topics. You must respond ONLY with valid JSON. No markdown, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
      LLM_MAX_RETRIES,
      'Tag relationship analysis'
    )

    const duration = Date.now() - startTime
    const tokensUsed = (response.usage?.total_tokens || 0)
    const estimatedCost = calculateCost(GROUPING_MODEL, tokensUsed)
    
    logger.debug('LLM grouping call completed', { 
      durationMs: duration, 
      model: GROUPING_MODEL,
      tokensUsed,
      estimatedCostUSD: estimatedCost,
    }, 'TrendingGroupingService')

    const content = response.choices[0]?.message?.content?.trim()
    if (!content) {
      logger.warn('No content in grouping response, using fallback', undefined, 'TrendingGroupingService')
      return fallbackGrouping(tags)
    }

    // Parse LLM response
    const result = JSON.parse(content) as { groups: GroupingInstruction[] }
    
    if (!result.groups || !Array.isArray(result.groups)) {
      logger.warn('Invalid grouping response format, using fallback', { content }, 'TrendingGroupingService')
      return fallbackGrouping(tags)
    }

    // Create mapping of tag name to group ID
    const tagToGroup = new Map<string, number>()
    for (const group of result.groups) {
      if (!group.tagNames || group.tagNames.length < 2) {
        continue
      }
      
      for (const tagName of group.tagNames) {
        tagToGroup.set(tagName, group.groupId)
      }
    }

    logger.info('LLM grouping analysis complete', {
      totalGroups: result.groups.length,
      groupedTags: tagToGroup.size,
      durationMs: duration,
    }, 'TrendingGroupingService')

    return tagToGroup

  } catch (error) {
    logger.error('Failed to analyze tag relationships, using fallback', { error }, 'TrendingGroupingService')
    return fallbackGrouping(tags)
  }
}

/**
 * Generate a summary for a grouped trend using LLM
 */
async function generateGroupSummary(
  tags: TrendingTag[],
  existingSummaries: string[]
): Promise<string> {
  const tagNames = tags.map(t => t.tag).join(', ')
  const category = tags[0]?.category || 'General'
  
  // Fallback summary if LLM unavailable or fails
  const fallbackSummary = `${tagNames} trending in ${category.toLowerCase()}.`
  
  if (!openai) {
    return fallbackSummary
  }
  
  const summariesContext = existingSummaries.filter(s => s && s.length > 0).join(' | ')

  const prompt = `Generate a ONE SENTENCE summary for this grouped trending topic.

Tags: ${tagNames}
Category: ${category}
${summariesContext ? `Context: ${summariesContext}` : ''}

Requirements:
- Exactly ONE sentence, no more than 15 words
- Explain what connects these topics and why they're trending together
- Natural, engaging tone like X/Twitter
- No hashtags, no emojis
- Don't list the tag names

Examples:
- "Breaking developments in OpenAGI's leadership and product launches"
- "Latest updates from Tesla's earnings call and production news"
- "Ongoing debate about new AI regulations and their market impact"

One sentence summary:`

  try {
    const startTime = Date.now()
    
    const response = await withRetry(
      async () => await openai!.chat.completions.create({
        model: SUMMARY_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a trending topics summarization expert. Generate concise, engaging summaries.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 50,
      }),
      LLM_MAX_RETRIES,
      'Group summary generation'
    )

    const duration = Date.now() - startTime
    const tokensUsed = (response.usage?.total_tokens || 0)
    const estimatedCost = calculateCost(SUMMARY_MODEL, tokensUsed)
    
    logger.debug('LLM summary call completed', { 
      durationMs: duration, 
      model: SUMMARY_MODEL,
      tokensUsed,
      estimatedCostUSD: estimatedCost,
    }, 'TrendingGroupingService')

    let summary = response.choices[0]?.message?.content?.trim() || fallbackSummary
    summary = summary.replace(/^["']|["']$/g, '').replace(/\.$/, '').trim()
    
    if (!summary.endsWith('.') && !summary.endsWith('!') && !summary.endsWith('?')) {
      summary += '.'
    }

    return summary
  } catch (error) {
    logger.error('Failed to generate group summary, using fallback', { error, tags: tagNames }, 'TrendingGroupingService')
    return fallbackSummary
  }
}

/**
 * Group related trending tags using LLM analysis
 */
export async function groupTrendingTags(tags: TrendingTag[]): Promise<GroupedTrend[]> {
  if (tags.length === 0) {
    return []
  }

  const startTime = Date.now()
  logger.info('Starting trending tags grouping', { tagCount: tags.length }, 'TrendingGroupingService')

  // Get grouping instructions from LLM
  const tagToGroup = await analyzeTagRelationships(tags)

  // Build groups
  const groups = new Map<number, TrendingTag[]>()
  const ungroupedTags: TrendingTag[] = []

  for (const tag of tags) {
    const groupId = tagToGroup.get(tag.tag)
    if (groupId !== undefined) {
      if (!groups.has(groupId)) {
        groups.set(groupId, [])
      }
      groups.get(groupId)!.push(tag)
    } else {
      ungroupedTags.push(tag)
    }
  }

  // Create grouped trends
  const result: GroupedTrend[] = []

  // Process groups (multiple tags) - PARALLELIZE summary generation
  const groupsToProcess: Array<[number, TrendingTag[]]> = []
  for (const [groupId, groupTags] of groups.entries()) {
    if (groupTags.length < 2) {
      // If group ended up with only 1 tag, treat as ungrouped
      ungroupedTags.push(...groupTags)
      continue
    }
    groupsToProcess.push([groupId, groupTags])
  }

  // Generate all summaries in parallel
  const groupSummaries = await Promise.all(
    groupsToProcess.map(async ([groupId, groupTags]) => {
      // Sort by post count to pick primary tag
      groupTags.sort((a, b) => b.postCount - a.postCount)
      const primaryTag = groupTags[0]!

      // Generate group summary
      const existingSummaries = groupTags.map(t => t.summary).filter((s): s is string => !!s)
      const summary = await generateGroupSummary(groupTags, existingSummaries)

      logger.debug('Created grouped trend', {
        groupId,
        tags: groupTags.map(t => t.tag),
        totalPosts: groupTags.reduce((sum, t) => sum + t.postCount, 0),
      }, 'TrendingGroupingService')

      return {
        id: primaryTag.id,
        tags: groupTags.map(t => t.tag),
        tagSlugs: groupTags.map(t => t.tagSlug),
        tagIds: groupTags.map(t => t.id),
        category: primaryTag.category,
        totalPostCount: groupTags.reduce((sum, t) => sum + t.postCount, 0),
        summary,
        rank: Math.min(...groupTags.map(t => t.rank)), // Use best rank
      }
    })
  )

  result.push(...groupSummaries)

  // Add ungrouped tags as single-tag groups
  for (const tag of ungroupedTags) {
    result.push({
      id: tag.id,
      tags: [tag.tag],
      tagSlugs: [tag.tagSlug],
      tagIds: [tag.id],
      category: tag.category,
      totalPostCount: tag.postCount,
      summary: tag.summary || `Trending in ${tag.category || 'general'}`,
      rank: tag.rank,
    })
  }

  // Sort by rank
  result.sort((a, b) => a.rank - b.rank)

  const duration = Date.now() - startTime
  logger.info('Trending tags grouping complete', {
    inputTags: tags.length,
    outputGroups: result.length,
    multiTagGroups: result.filter(g => g.tags.length > 1).length,
    durationMs: duration,
  }, 'TrendingGroupingService')

  return result
}

