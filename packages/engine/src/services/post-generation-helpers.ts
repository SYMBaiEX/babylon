/**
 * Shared post generation helpers
 *
 * Reduces code duplication between lookahead generation and game tick post generation
 */

import {
  type Actor,
  db,
  desc,
  eq,
  generateSnowflakeId,
  getDbInstance,
  inArray,
  type Organization,
  posts,
  type Question,
  users,
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

/**
 * Represents a post that NPCs can reply to
 */
interface PostForReply {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  timestamp: Date;
  /** If this post is a reply, the original post in the chain */
  originalPostId?: string | null;
  /** If this post is a reply, what it's replying to */
  commentOnPostId?: string | null;
}

/**
 * Minimal actor type for NPC discourse (only fields needed for reply generation)
 */
export interface DiscourseActor {
  id: string;
  name: string;
  description?: string | null;
  personality?: string | null;
  postStyle?: string | null;
  postExample?: string[];
}

/**
 * Generate NPC replies to posts from previous ticks (public discourse)
 *
 * This enables NPCs to engage in public discourse by commenting on each other's
 * posts from previous ticks. Posts are generated in parallel for efficiency.
 *
 * @param llmClient - LLM client for generating replies
 * @param actors - NPCs available to comment
 * @param worldFactsContext - World context for prompts
 * @param timestamp - Current timestamp for new replies
 * @param maxReplies - Maximum number of replies to generate (default: 4)
 * @returns Number of replies successfully created
 */
export async function generateNPCRepliesFromPreviousTicks(
  llmClient: BabylonLLMClient,
  actors: DiscourseActor[],
  worldFactsContext: string,
  timestamp: Date,
  maxReplies = 4
): Promise<number> {
  if (actors.length < 2) {
    logger.debug(
      'Not enough actors for NPC discourse',
      { actorCount: actors.length },
      'PostGeneration'
    );
    return 0;
  }

  // Fetch recent posts from other NPCs (last 2 hours, not from current minute)
  const twoHoursAgo = new Date(timestamp.getTime() - 2 * 60 * 60 * 1000);
  const oneMinuteAgo = new Date(timestamp.getTime() - 60 * 1000);

  const actorIds = actors.map((a) => a.id);

  // Get recent NPC posts that can be replied to
  // Include both original posts AND first-level replies (for threaded discourse)
  // Exclude deep reply chains (posts that reply to replies of replies)
  const recentNPCPosts = await db
    .select({
      id: posts.id,
      content: posts.content,
      authorId: posts.authorId,
      timestamp: posts.timestamp,
      commentOnPostId: posts.commentOnPostId,
      originalPostId: posts.originalPostId,
      type: posts.type,
    })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(
      // Post is by an NPC (actor)
      inArray(posts.authorId, actorIds)
    )
    .orderBy(desc(posts.timestamp))
    .limit(40);

  // Filter to posts in the right time window
  // Allow replies to:
  // - Original posts (commentOnPostId is null) - direct discourse
  // - First-level replies (originalPostId is set but not chained) - threaded discourse
  // Exclude deep chains (posts that are replies to replies of replies)
  const eligiblePosts: PostForReply[] = [];
  for (const post of recentNPCPosts) {
    if (!post.content || !post.timestamp) continue;
    const postTime = post.timestamp;
    if (postTime >= twoHoursAgo && postTime <= oneMinuteAgo) {
      // Skip posts that are too deep in reply chain
      // A post is "too deep" if it has originalPostId set AND commentOnPostId != originalPostId
      // meaning it's a reply to a reply
      const isDeepReply =
        post.originalPostId !== null &&
        post.commentOnPostId !== null &&
        post.originalPostId !== post.commentOnPostId;

      if (isDeepReply) continue; // Skip deep reply chains

      const author = actors.find((a) => a.id === post.authorId);
      if (author) {
        eligiblePosts.push({
          id: post.id,
          content: post.content,
          authorId: post.authorId,
          authorName: author.name,
          timestamp: post.timestamp,
          originalPostId: post.originalPostId,
          commentOnPostId: post.commentOnPostId,
        });
      }
    }
  }

  if (eligiblePosts.length === 0) {
    logger.debug(
      'No eligible posts for NPC discourse',
      { checkedPosts: recentNPCPosts.length },
      'PostGeneration'
    );
    return 0;
  }

  // Select random posts to reply to (up to maxReplies)
  const shuffledPosts = [...eligiblePosts].sort(() => Math.random() - 0.5);
  const postsToReplyTo = shuffledPosts.slice(
    0,
    Math.min(maxReplies, eligiblePosts.length)
  );

  logger.info(
    `Generating ${postsToReplyTo.length} NPC replies to previous tick posts`,
    {
      eligiblePosts: eligiblePosts.length,
      targetReplies: postsToReplyTo.length,
    },
    'PostGeneration'
  );

  // Generate replies and quote posts in parallel
  // 70% chance of reply, 30% chance of quote post for variety
  const discoursePromises = postsToReplyTo.map(async (originalPost) => {
    // Pick a random actor to engage (not the original author)
    const availableEngagers = actors.filter(
      (a) => a.id !== originalPost.authorId
    );
    if (availableEngagers.length === 0)
      return { type: 'none' as const, success: false };

    const engager =
      availableEngagers[Math.floor(Math.random() * availableEngagers.length)];
    if (!engager) return { type: 'none' as const, success: false };

    // Decide: reply (70%) or quote post (30%)
    // Quote posts only for original posts (not replies) to keep it clean
    const shouldQuote =
      originalPost.commentOnPostId === null && Math.random() < 0.3;

    if (shouldQuote) {
      const success = await generateNPCQuotePost(
        llmClient,
        engager,
        originalPost,
        worldFactsContext,
        timestamp
      );
      return { type: 'quote' as const, success };
    } else {
      const success = await generateNPCReplyToPost(
        llmClient,
        engager,
        originalPost,
        worldFactsContext,
        timestamp
      );
      return { type: 'reply' as const, success };
    }
  });

  const results = await Promise.allSettled(discoursePromises);

  let repliesCreated = 0;
  let quotesCreated = 0;
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.success) {
      if (result.value.type === 'quote') {
        quotesCreated++;
      } else {
        repliesCreated++;
      }
    } else if (result.status === 'rejected') {
      logger.warn(
        'Failed to generate NPC discourse',
        { error: result.reason },
        'PostGeneration'
      );
    }
  }

  const totalCreated = repliesCreated + quotesCreated;
  logger.info(
    `NPC discourse complete: ${totalCreated}/${postsToReplyTo.length} (${repliesCreated} replies, ${quotesCreated} quotes)`,
    { repliesCreated, quotesCreated, attempted: postsToReplyTo.length },
    'PostGeneration'
  );

  return totalCreated;
}

/**
 * Generate a single NPC reply to another NPC's post
 */
async function generateNPCReplyToPost(
  llmClient: BabylonLLMClient,
  replier: DiscourseActor,
  originalPost: PostForReply,
  worldFactsContext: string,
  timestamp: Date
): Promise<boolean> {
  // Build replier's personality context
  const personalityContext = replier.personality
    ? `Personality: ${replier.personality}`
    : '';
  const voiceContext = replier.postStyle
    ? `Writing Style: ${replier.postStyle}`
    : '';
  const examplesContext =
    replier.postExample && replier.postExample.length > 0
      ? `Example posts (MATCH THIS STYLE):\n${replier.postExample
          .slice(0, 3)
          .map((ex, i) => `  ${i + 1}. "${ex}"`)
          .join('\n')}`
      : '';

  // Note if this is a thread (replying to a reply)
  const isThread = originalPost.commentOnPostId !== null;
  const threadContext = isThread
    ? '\n(Note: This is a reply in a thread - you can jump into the conversation)'
    : '';

  const prompt = `You ARE ${replier.name}. You're jumping into a public conversation${isThread ? ' thread' : ''} started by ${originalPost.authorName}.

=== YOUR CHARACTER ===
${replier.description || ''}
${personalityContext}
${voiceContext}
${examplesContext}

=== POST YOU'RE REPLYING TO ===
@${originalPost.authorName}: "${originalPost.content}"${threadContext}

=== TASK ===
Write a natural reply (max 200 chars) to ${originalPost.authorName}'s post AS ${replier.name}.

=== REPLY DYNAMICS ===
This is organic social media discourse. React authentically as YOUR character would:
- AGREE: "this", "W", "based", validate their point, add supporting info
- DISAGREE: "ratio", "L take", challenge them, call out what's wrong
- ENGAGE: Ask a follow-up question, share your perspective, add context
- DUNK: If they said something dumb and your character would roast, do it

Think about what ${replier.name} would ACTUALLY say to ${originalPost.authorName} given their relationship and perspectives.

=== CRITICAL RULES ===
- ABSOLUTELY NO HASHTAGS (no #anything)
- NO EMOJIS
- Match YOUR character's voice exactly - look at the examples above
- Reference what they said - don't just post in a vacuum
- Keep it punchy and natural - this is social media, not an essay

${worldFactsContext}

Return your response as XML in this exact format:
<response>
  <reply>your reply content here</reply>
</response>`;

  const response = await llmClient.generateJSON<
    { reply: string } | { response: { reply: string } }
  >(
    prompt,
    {
      properties: {
        reply: { type: 'string' },
      },
      required: ['reply'],
    },
    {
      temperature: 0.9,
      maxTokens: MAX_POST_TOKENS,
      format: 'xml',
      promptType: 'npc_reply_to_post',
    }
  );

  const replyContent =
    'response' in response &&
    response.response &&
    typeof response.response === 'object' &&
    'reply' in response.response
      ? (response.response as { reply: string }).reply
      : (response as { reply: string }).reply;

  if (!replyContent || replyContent.trim().length === 0) {
    logger.warn(
      'Empty reply generated',
      { replierName: replier.name, originalPostId: originalPost.id },
      'PostGeneration'
    );
    return false;
  }

  // Strip hashtags and emojis first
  const cleaned = stripHashtagsAndEmojis(replyContent.trim());

  // Then replace real names with parody names
  const transformed = await characterMappingService.transformText(cleaned);
  if (transformed.replacementCount > 0) {
    logger.warn(
      `Fixed ${transformed.replacementCount} real name(s) in NPC reply`,
      {
        replier: replier.name,
        originalPostId: originalPost.id,
      },
      'PostGeneration'
    );
  }

  // Determine the original post in the chain for proper threading
  // If replying to an original post: originalPostId = that post's ID
  // If replying to a reply: originalPostId = the root of the chain
  const rootPostId =
    originalPost.originalPostId ?? // If it's a reply, use its original
    (originalPost.commentOnPostId ? originalPost.commentOnPostId : null); // If it's replying to something

  await getDbInstance().createPostWithAllFields({
    id: await generateSnowflakeId(),
    type: 'reply',
    content: transformed.transformedText,
    authorId: replier.id,
    commentOnPostId: originalPost.id,
    originalPostId: rootPostId ?? originalPost.id, // Root of the chain
    gameId: 'continuous',
    dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
    timestamp,
  });

  logger.debug(
    'Created NPC reply',
    {
      replier: replier.name,
      originalAuthor: originalPost.authorName,
      originalPostId: originalPost.id,
    },
    'PostGeneration'
  );

  return true;
}

/**
 * Generate a quote post (NPC shares another NPC's post with their own commentary)
 * Like a "retweet with comment" - shows the original post with added commentary
 */
async function generateNPCQuotePost(
  llmClient: BabylonLLMClient,
  quoter: DiscourseActor,
  originalPost: PostForReply,
  worldFactsContext: string,
  timestamp: Date
): Promise<boolean> {
  // Build quoter's personality context
  const personalityContext = quoter.personality
    ? `Personality: ${quoter.personality}`
    : '';
  const voiceContext = quoter.postStyle
    ? `Writing Style: ${quoter.postStyle}`
    : '';
  const examplesContext =
    quoter.postExample && quoter.postExample.length > 0
      ? `Example posts (MATCH THIS STYLE):\n${quoter.postExample
          .slice(0, 3)
          .map((ex, i) => `  ${i + 1}. "${ex}"`)
          .join('\n')}`
      : '';

  const prompt = `You ARE ${quoter.name}. You're quote-posting ${originalPost.authorName}'s post to share it with YOUR take.

=== YOUR CHARACTER ===
${quoter.description || ''}
${personalityContext}
${voiceContext}
${examplesContext}

=== POST YOU'RE QUOTING ===
@${originalPost.authorName}: "${originalPost.content}"

=== TASK ===
Write a quote post (max 180 chars) that shares ${originalPost.authorName}'s post with YOUR commentary.

=== QUOTE POST DYNAMICS ===
A quote post shares someone's post with your own take on top. React as YOUR character would:
- AMPLIFY: "need more people to see this", "exactly this", "W post"
- CLOWN: "bro really said this 💀", "least delusional [X] fan", dunk on them
- ADD CONTEXT: "what they're not telling you is...", add your insight
- HOT TAKE: Use their post as a jumping off point for your own take
- DISAGREE PUBLICLY: "imagine thinking this", call out the bad take

The original post will be shown below yours - don't repeat their whole message.

=== CRITICAL RULES ===
- ABSOLUTELY NO HASHTAGS (no #anything)
- NO EMOJIS
- Match YOUR character's voice exactly - look at the examples above
- Keep it punchy - your commentary should stand alone
- Don't just summarize what they said - ADD something

${worldFactsContext}

Return your response as XML in this exact format:
<response>
  <quote_comment>your commentary on top of the quoted post</quote_comment>
</response>`;

  const response = await llmClient.generateJSON<
    { quote_comment: string } | { response: { quote_comment: string } }
  >(
    prompt,
    {
      properties: {
        quote_comment: { type: 'string' },
      },
      required: ['quote_comment'],
    },
    {
      temperature: 0.9,
      maxTokens: MAX_POST_TOKENS,
      format: 'xml',
      promptType: 'npc_quote_post',
    }
  );

  const quoteComment =
    'response' in response &&
    response.response &&
    typeof response.response === 'object' &&
    'quote_comment' in response.response
      ? (response.response as { quote_comment: string }).quote_comment
      : (response as { quote_comment: string }).quote_comment;

  if (!quoteComment || quoteComment.trim().length === 0) {
    logger.warn(
      'Empty quote comment generated',
      { quoterName: quoter.name, originalPostId: originalPost.id },
      'PostGeneration'
    );
    return false;
  }

  // Strip hashtags and emojis first
  const cleaned = stripHashtagsAndEmojis(quoteComment.trim());

  // Then replace real names with parody names
  const transformed = await characterMappingService.transformText(cleaned);
  if (transformed.replacementCount > 0) {
    logger.warn(
      `Fixed ${transformed.replacementCount} real name(s) in NPC quote post`,
      {
        quoter: quoter.name,
        originalPostId: originalPost.id,
      },
      'PostGeneration'
    );
  }

  await getDbInstance().createPostWithAllFields({
    id: await generateSnowflakeId(),
    type: 'quote',
    content: transformed.transformedText,
    authorId: quoter.id,
    originalPostId: originalPost.id, // The post being quoted
    gameId: 'continuous',
    dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
    timestamp,
  });

  logger.debug(
    'Created NPC quote post',
    {
      quoter: quoter.name,
      originalAuthor: originalPost.authorName,
      originalPostId: originalPost.id,
    },
    'PostGeneration'
  );

  return true;
}
