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

const MAX_POST_TOKENS = 500; // Reasonable limit for social media posts

/**
 * Generate a single NPC post using LLM
 */
export async function generateNPCPost(
  llmClient: BabylonLLMClient,
  actor: Actor,
  question: Question,
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
  question: Question,
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

