/**
 * Shared post generation helpers
 *
 * Reduces code duplication between lookahead generation and game tick post generation
 */

import {
  type Actor,
  generateSnowflakeId,
  getDbInstance,
  type Organization,
  type Question,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { BabylonLLMClient } from '../llm/openai-client';
import { stripHashtagsAndEmojis } from '../utils/shared-utils';
import { characterMappingService } from './character-mapping-service';

// Minimal question type for post generation (only fields actually used)
type QuestionForPost = Pick<Question, 'id' | 'text' | 'questionNumber'>;

const MAX_POST_TOKENS = 16384; // No practical limit
const MAX_ARTICLE_TOKENS = 16384; // No practical limit

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
  // Build personality context
  const personalityContext = actor.personality
    ? `Personality: ${actor.personality}`
    : '';
  const voiceContext = actor.postStyle
    ? `Writing Style: ${actor.postStyle}`
    : '';
  const examplesContext =
    actor.postExample && actor.postExample.length > 0
      ? `Example posts (MATCH THIS STYLE):\n${actor.postExample
          .slice(0, 3)
          .map((ex, i) => `  ${i + 1}. "${ex}"`)
          .join('\n')}`
      : '';

  const prompt = `You ARE ${actor.name}. Fully embody this character.

=== YOUR CHARACTER ===
${actor.description || ''}
${personalityContext}
${voiceContext}
${examplesContext}

=== TASK ===
Write a social media post (max 280 chars) about: "${question.text}"

=== CRITICAL RULES ===
- ABSOLUTELY NO HASHTAGS (no #crypto, #AI, #news, NOTHING with #)
- NO EMOJIS
- Match YOUR character's voice exactly - sound like the examples above
- Be opinionated and entertaining in YOUR unique style

${worldFactsContext}

Return your response as XML in this exact format:
<response>
  <post>your post content here</post>
</response>`;

  const response = await llmClient.generateJSON<
    { post: string } | { response: { post: string } }
  >(
    prompt,
    {
      properties: {
        post: { type: 'string' },
      },
      required: ['post'],
    },
    {
      temperature: 0.9,
      maxTokens: MAX_POST_TOKENS,
      format: 'xml',
    }
  );

  const postContent =
    'response' in response &&
    response.response &&
    typeof response.response === 'object' &&
    'post' in response.response
      ? (response.response as { post: string }).post
      : (response as { post: string }).post;

  if (!postContent || postContent.trim().length === 0) {
    logger.warn(
      'Empty post generated',
      { actorName: actor.name, questionId: question.id },
      'PostGeneration'
    );
    return false;
  }

  // Strip hashtags and emojis first
  const cleaned = stripHashtagsAndEmojis(postContent.trim());

  // Then replace real names with parody names
  const transformed = await characterMappingService.transformText(cleaned);
  if (transformed.replacementCount > 0) {
    logger.warn(
      `Fixed ${transformed.replacementCount} real name(s) in NPC post`,
      {
        actor: actor.name,
        questionId: question.id,
      },
      'PostGeneration'
    );
  }

  await getDbInstance().createPostWithAllFields({
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
  const orgName = org.name || 'Unknown Org';

  const prompt = `You are ${orgName}, a media organization.

=== YOUR IDENTITY ===
${org.description || 'A news and media organization'}
Style: Professional news organization

=== TASK ===
Write a brief news-style post (max 280 chars) about: "${question.text}"

=== CRITICAL RULES ===
- ABSOLUTELY NO HASHTAGS (no #crypto, #AI, #news, #breaking, NOTHING with #)
- NO EMOJIS
- Be informative and engaging
- Sound like a real news outlet, not a marketing bot

${worldFactsContext}

Return your response as XML in this exact format:
<response>
  <post>your post content here</post>
</response>`;

  const response = await llmClient.generateJSON<
    { post: string } | { response: { post: string } }
  >(
    prompt,
    {
      properties: {
        post: { type: 'string' },
      },
      required: ['post'],
    },
    {
      temperature: 0.9,
      maxTokens: MAX_POST_TOKENS,
      format: 'xml',
    }
  );

  const postContent =
    'response' in response &&
    response.response &&
    typeof response.response === 'object' &&
    'post' in response.response
      ? (response.response as { post: string }).post
      : (response as { post: string }).post;

  if (!postContent || postContent.trim().length === 0) {
    logger.warn(
      'Empty org post generated',
      { orgName: org.name, questionId: question.id },
      'PostGeneration'
    );
    return false;
  }

  // Strip hashtags and emojis first
  const cleaned = stripHashtagsAndEmojis(postContent.trim());

  // Then replace real names with parody names
  const transformed = await characterMappingService.transformText(cleaned);
  if (transformed.replacementCount > 0) {
    logger.warn(
      `Fixed ${transformed.replacementCount} real name(s) in org post`,
      {
        org: org.name,
        questionId: question.id,
      },
      'PostGeneration'
    );
  }

  await getDbInstance().createPostWithAllFields({
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
  const orgName = org.name || 'Unknown Org';

  const prompt = `You are ${orgName}, a news organization writing a comprehensive article.

=== YOUR IDENTITY ===
${org.description || 'A major news publication'}

=== TOPIC ===
"${question.text}"

=== CRITICAL RULES ===
- ABSOLUTELY NO HASHTAGS anywhere in the article (no #crypto, #AI, NOTHING with #)
- NO EMOJIS
- Use ONLY parody names (AIlon Musk, TeslAI, OpenAGI, etc.) - NEVER real names

${worldFactsContext}

=== REQUIRED OUTPUT ===
- "title": a compelling headline (max 100 characters)
- "summary": a succinct 2-3 sentence summary for social feeds (max 400 characters)
- "article": a FULL-LENGTH article body (800-1200 words, at least 4 paragraphs). Include:
  * An engaging lead paragraph that hooks readers
  * Background context and relevant details
  * Analysis of implications and what this means
  * Expert perspectives or insider viewpoints (you can fabricate realistic quotes)
  * A conclusion with forward-looking analysis
  
  The article must read like a professional newsroom piece from a major publication - NOT bullet points, NOT a summary. Separate paragraphs with \\n\\n (two newlines).

Return your response as XML in this exact format:
<response>
  <title>news headline here</title>
  <summary>2-3 sentence summary here</summary>
  <article>full article body here with \\n\\n between paragraphs</article>
</response>`;

  const response = await llmClient.generateJSON<
    | { title: string; summary: string; article: string }
    | { response: { title: string; summary: string; article: string } }
  >(
    prompt,
    {
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        article: { type: 'string' },
      },
      required: ['title', 'summary', 'article'],
    },
    {
      temperature: 0.7,
      maxTokens: MAX_ARTICLE_TOKENS,
      format: 'xml',
      promptType: 'generate_org_article',
    }
  );

  const articleData =
    'response' in response && response.response
      ? (response.response as {
          title: string;
          summary: string;
          article: string;
        })
      : (response as { title: string; summary: string; article: string });

  if (!articleData.title || !articleData.summary || !articleData.article) {
    logger.warn(
      'Empty article generated',
      { orgName: org.name, questionId: question.id },
      'PostGeneration'
    );
    return false;
  }

  const summary = articleData.summary.trim();
  const articleTitle = articleData.title.trim();
  const articleBody = articleData.article.trim();

  // Content should be a full article (800-1200 words = ~4000-6000 chars)
  // Minimum 500 chars to ensure it's not just a summary
  if (articleBody.length < 500) {
    logger.warn(
      'Article body too short - rejecting',
      { orgName: org.name, length: articleBody.length, minRequired: 500 },
      'PostGeneration'
    );
    return false;
  }

  // Transform content to replace real names with parody names
  const transformedSummary =
    await characterMappingService.transformText(summary);
  const transformedBody =
    await characterMappingService.transformText(articleBody);
  if (
    transformedSummary.replacementCount > 0 ||
    transformedBody.replacementCount > 0
  ) {
    logger.warn(
      `Fixed ${transformedSummary.replacementCount + transformedBody.replacementCount} real name(s) in org article`,
      {
        org: org.name,
        title: articleTitle,
      },
      'PostGeneration'
    );
  }

  await getDbInstance().createPostWithAllFields({
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

  logger.debug(
    'Created org article',
    { org: org.name, timestamp },
    'PostGeneration'
  );
  return true;
}
