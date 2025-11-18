/**
 * Shared post generation helpers
 * 
 * Reduces code duplication between lookahead generation and game tick post generation
 */

import { logger } from '@/lib/logger';
import { generateSnowflakeId } from '@/lib/snowflake';
import db from '@/lib/database-service';
import { characterMappingService } from './character-mapping-service';
import type { BabylonLLMClient } from '@/generator/llm/openai-client';
import type { Actor, Organization, Question } from '@prisma/client';

// Minimal question type for post generation (only fields actually used)
type QuestionForPost = Pick<Question, 'id' | 'text' | 'questionNumber'>;

const MAX_POST_TOKENS = 500; // Reasonable limit for social media posts
const MAX_ARTICLE_TOKENS = 8000; // Higher limit for full articles

/**
 * Generate a single NPC post using LLM
 */
export async function generateNPCPost(
  llmClient: BabylonLLMClient,
  actor: Actor,
  question: QuestionForPost,
  worldFactsContext: string,
  timestamp: Date
): Promise<boolean> {
  const prompt = `You are ${actor.name}. Write a brief social media post (max 280 chars) about this prediction market question: "${question.text}". Be opinionated and entertaining.

${worldFactsContext}

Return your response as XML in this exact format:
<response>
  <post>your post content here</post>
</response>`;

  const model = llmClient.getProvider() === 'wandb' ? 'moonshotai/kimi-k2-instruct-0905' : undefined;
  const response = await llmClient.generateJSON<{ post: string } | { response: { post: string } }>(
    prompt,
    {
      properties: {
        post: { type: 'string' },
      },
      required: ['post'],
    },
    { temperature: 0.9, maxTokens: MAX_POST_TOKENS, ...(model ? { model } : {}), format: 'xml' }
  );
  
  const postContent = 'response' in response && response.response && typeof response.response === 'object' && 'post' in response.response
    ? (response.response as { post: string }).post
    : (response as { post: string }).post;

  if (!postContent || postContent.trim().length === 0) {
    logger.warn('Empty post generated', { actorName: actor.name, questionId: question.id }, 'PostGeneration');
    return false;
  }

  const transformed = await characterMappingService.transformText(postContent.trim());
  if (transformed.replacementCount > 0) {
    logger.warn(`Fixed ${transformed.replacementCount} real name(s) in NPC post`, {
      actor: actor.name,
      questionId: question.id,
    }, 'PostGeneration');
  }

  await db().createPostWithAllFields({
    id: await generateSnowflakeId(),
    content: transformed.transformedText,
    authorId: actor.id,
    gameId: 'continuous',
    dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
    timestamp,
  });
  
  return true;
}

/**
 * Generate a single organization post using LLM
 */
export async function generateOrgPost(
  llmClient: BabylonLLMClient,
  org: Organization,
  question: QuestionForPost,
  worldFactsContext: string,
  timestamp: Date
): Promise<boolean> {
  const prompt = `You are ${org.name || 'Unknown Org'}, a media organization. Write a brief news-style post (max 280 chars) about this prediction market question: "${question.text}". Be informative and engaging.

${worldFactsContext}

Return your response as XML in this exact format:
<response>
  <post>your post content here</post>
</response>`;

  const model = llmClient.getProvider() === 'wandb' ? 'moonshotai/kimi-k2-instruct-0905' : undefined;
  const response = await llmClient.generateJSON<{ post: string } | { response: { post: string } }>(
    prompt,
    {
      properties: {
        post: { type: 'string' },
      },
      required: ['post'],
    },
    { temperature: 0.9, maxTokens: MAX_POST_TOKENS, ...(model ? { model } : {}), format: 'xml' }
  );
  
  const postContent = 'response' in response && response.response && typeof response.response === 'object' && 'post' in response.response
    ? (response.response as { post: string }).post
    : (response as { post: string }).post;

  if (!postContent || postContent.trim().length === 0) {
    logger.warn('Empty org post generated', { orgName: org.name, questionId: question.id }, 'PostGeneration');
    return false;
  }

  const transformed = await characterMappingService.transformText(postContent.trim());
  if (transformed.replacementCount > 0) {
    logger.warn(`Fixed ${transformed.replacementCount} real name(s) in org post`, {
      org: org.name,
      questionId: question.id,
    }, 'PostGeneration');
  }

  await db().createPostWithAllFields({
    id: await generateSnowflakeId(),
    type: 'post',
    content: transformed.transformedText,
    authorId: org.id,
    gameId: 'continuous',
    dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
    timestamp,
  });
  
  return true;
}

/**
 * Generate a full news article from an organization
 */
export async function generateOrgArticle(
  llmClient: BabylonLLMClient,
  org: Organization,
  question: QuestionForPost,
  worldFactsContext: string,
  timestamp: Date
): Promise<boolean> {
  const prompt = `You are ${org.name}, a news organization. Write a comprehensive news article about this prediction market: "${question.text}".

${worldFactsContext}

Provide:
- "title": a compelling headline (max 100 characters)
- "summary": a succinct 2-3 sentence summary for social feeds (max 400 characters)
- "article": a full-length article body (at least 4 paragraphs) with concrete details, analysis, and optional quotes. The article should read like a professional newsroom piece, not bullet points. Separate paragraphs with \\n\\n (two newlines).

Return your response as XML in this exact format:
<response>
  <title>news headline here</title>
  <summary>2-3 sentence summary here</summary>
  <article>full article body here with \\n\\n between paragraphs</article>
</response>`;

  const model = llmClient.getProvider() === 'wandb' ? 'moonshotai/kimi-k2-instruct-0905' : undefined;
  const response = await llmClient.generateJSON<{ title: string; summary: string; article: string } | { response: { title: string; summary: string; article: string } }>(
    prompt,
    { 
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        article: { type: 'string' }
      },
      required: ['title', 'summary', 'article'] 
    },
    { temperature: 0.7, maxTokens: MAX_ARTICLE_TOKENS, ...(model ? { model } : {}), format: 'xml' }
  );
  
  const articleData = 'response' in response && response.response 
    ? response.response as { title: string; summary: string; article: string }
    : response as { title: string; summary: string; article: string };

  if (!articleData.title || !articleData.summary || !articleData.article) {
    logger.warn('Empty article generated', { orgName: org.name, questionId: question.id }, 'PostGeneration');
    return false;
  }

  const summary = articleData.summary.trim();
  const articleTitle = articleData.title.trim();
  const articleBody = articleData.article.trim();

  if (articleBody.length < 400) {
    logger.warn('Article body too short', { orgName: org.name, length: articleBody.length }, 'PostGeneration');
    return false;
  }

  // Transform content to replace real names with parody names
  const transformedSummary = await characterMappingService.transformText(summary);
  const transformedBody = await characterMappingService.transformText(articleBody);
  if (transformedSummary.replacementCount > 0 || transformedBody.replacementCount > 0) {
    logger.warn(`Fixed ${transformedSummary.replacementCount + transformedBody.replacementCount} real name(s) in org article`, {
      org: org.name,
      title: articleTitle,
    }, 'PostGeneration');
  }

  await db().createPostWithAllFields({
    id: await generateSnowflakeId(),
    type: 'article',
    content: transformedSummary.transformedText,
    fullContent: transformedBody.transformedText,
    articleTitle: articleTitle,
    authorId: org.id,
    gameId: 'continuous',
    dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
    timestamp,
  });
  
  logger.debug('Created org article', { org: org.name, timestamp }, 'PostGeneration');
  return true;
}
