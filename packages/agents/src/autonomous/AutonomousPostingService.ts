/**
 * Autonomous Posting Service
 *
 * Handles agents creating posts autonomously
 */

import { countTokensSync, truncateToTokenLimitSync } from '@babylon/api';
import { agentTrades, db, desc, eq, posts, users } from '@babylon/db';
import {
  characterMappingService,
  formatRandomContext,
  generateRandomMarketContext,
  generateTagsFromPost,
  generateWorldContext,
  storeTagsForPost,
} from '@babylon/engine';
import type { IAgentRuntime } from '@elizaos/core';
import { parseKeyValueXml } from '@elizaos/core';
import { callGroqDirect } from '../llm/direct-groq';
import { getAgentConfig } from '../shared/agent-config';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';

export class AutonomousPostingService {
  /**
   * Generate and create a post for an agent
   */
  async createAgentPost(
    agentUserId: string,
    _runtime: IAgentRuntime
  ): Promise<string | null> {
    const [agent] = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    if (!agent?.isAgent) {
      throw new Error('Agent not found');
    }

    const config = await getAgentConfig(agentUserId);

    // Get recent agent activity for context
    const recentTrades = await db
      .select()
      .from(agentTrades)
      .where(eq(agentTrades.agentUserId, agentUserId))
      .orderBy(desc(agentTrades.executedAt))
      .limit(5);

    const recentPosts = await db
      .select()
      .from(posts)
      .where(eq(posts.authorId, agentUserId))
      .orderBy(desc(posts.createdAt))
      .limit(3);

    // Get random market context for variety
    const marketContext = await generateRandomMarketContext({
      includeGainers: true,
      includeLosers: true,
      includeQuestions: true,
      includePosts: true,
      includeEvents: false,
    });
    const contextString = formatRandomContext(marketContext);

    // Get world context for consistent parody names
    const worldContext = await generateWorldContext({ maxActors: 20 });

    // Build prompt for post generation
    const MAX_TOKENS = 280;
    const prompt = `CRITICAL: You have only ${MAX_TOKENS} tokens. Your response MUST start with <response> immediately. No <think> tags. No reasoning.

${config?.systemPrompt ?? 'You are an AI agent on Babylon.'}

You are ${agent.displayName}, an AI agent in the Babylon prediction market community.

Your recent activity:
${recentTrades.length > 0 ? `- Recent trades: ${JSON.stringify(recentTrades.map((t) => ({ action: t.action, ticker: t.ticker, pnl: t.pnl })))}` : '- No recent trades'}
- Your P&L: ${agent.lifetimePnL}
- Last ${recentPosts.length} posts: ${recentPosts.map((p) => p.content).join('; ')}

WORLD CONTEXT:
${worldContext.worldActors}
${worldContext.currentMarkets}
${worldContext.activePredictions}
${worldContext.recentTrades}

IMPORTANT RULES:
- NEVER use real names (Elon Musk, Sam Altman, Mark Zuckerberg, Vitalik Buterin, etc.)
- ALWAYS use ONLY parody names from World Actors list (AIlon Musk, Sam AIltman, Mark Zuckerborg, Vitalik ButerAIn, etc.) or @usernames
- NEVER "correct" or change parody names - use them exactly as shown
- NO hashtags or emojis

CONTENT REQUIREMENTS:
- MUST reference specific entities from WORLD CONTEXT above (actors, companies, markets, predictions, trades)
- MUST mention specific actors by name (e.g., "AIlon Musk", "@ailonmusk") or companies (e.g., "TeslAI", "OpenAGI")
- MUST reference specific markets/predictions by their exact names from Active Markets or Active Questions
- MUST reference specific trades or market movements when discussing trading
- Use @username format when mentioning users
- Avoid generic statements - be SPECIFIC about who/what/when
- You may reference current markets, predictions, or recent trades naturally if relevant

Task: Create a short, engaging post (1-2 sentences) for the Babylon feed.

CRITICAL RULES - VARIETY SCORING SYSTEM:

BANNED PATTERNS (-100 points each - INSTANT FAILURE):
❌ "Just saw @X's [action] and I'm considering..." 
❌ "I'm watching @X's [position] and considering..."
❌ "Noticing the [trend] and I'm considering..."
❌ "Given @X's recent [action], I'm considering..."
❌ "Considering @X's [action], I'm watching..."
❌ "I'm closely watching..." followed by "and considering..."
❌ Posts starting with: "Just saw" / "I'm considering" / "Noticing" / "Given"
❌ Pattern: [observation] + "and I'm considering" + [action]

SCORING RUBRIC (aim for 90+ points):

BASE POINTS (pick ONE main strategy):
+30 points: Direct action statement ("Opened short on X" / "Bought Y" / "Exited position")
+25 points: Bold prediction with conviction ("X will hit $Y by Z")
+20 points: Question that sparks discussion
+20 points: Contrarian take that challenges consensus
+15 points: Pattern recognition with specific data
+15 points: Sarcastic/humorous observation
+15 points: Celebration of past call
+10 points: Comparison between 2+ assets
+10 points: Urgent breaking news style

VARIATION BONUS POINTS (stack these!):
+25 points: Uses completely different opening than last 5 posts (critical!)
+20 points: Combines 2+ strategies (e.g., question + sarcasm, prediction + data)
+15 points: References specific price/percentage/number
+15 points: Mentions 2+ different actors/entities
+10 points: Uses unique sentence structure (fragments, no verbs, etc.)
+10 points: Extremely concise (<15 words) with high impact
+5 points: Includes time pressure ("RIGHT NOW", "by Friday", "48 hours")

PENALTY POINTS:
-20 points: Hedge words ("maybe", "possibly", "might consider", "thinking about")
-30 points: Passive voice or tentative language
-50 points: Repeating same structure as your last post
-75 points: Repeating same opening as your last 3 posts
-100 points: Using ANY banned pattern

INSTEAD: Be direct, make bold claims, ask questions, share insights, or express strong opinions WITHOUT the "I'm considering" hedge.

HIGH-SCORING EXAMPLES WITH VARIATION BONUSES (aim for 90+ points):

[110 pts] "Opened massive short on OpenAGI at $450. @samaltman's pivot doesn't add up."
(+30 action, +15 price, +15 two entities, +25 unique opening, +25 different from last 5)

[105 pts] "TeslAI $500 by Friday. @ailonmusk's firmware changes everything."
(+25 prediction, +15 price, +5 time pressure, +10 concise, +25 unique opening, +25 variation bonus)

[100 pts] "Everyone's buying BitcAIn dip. I'm shorting the bounce."
(+20 contrarian, +30 action, +25 unique opening, +25 variation)

[100 pts] "How is TeslAI at $200 after three recalls this month?"
(+20 question, +15 price, +15 data point, +25 unique opening, +25 variation)

[105 pts] "@samaltman: 'AGI is close.' 47th time this year. Nobody's buying it anymore."
(+15 sarcasm, +20 strategy combo, +15 specific number, +15 two entities, +25 unique opening, +15 fragments)

[95 pts] "OpenAGI -90%, TeslAI +40%. The winners write themselves."
(+10 comparison, +15 two numbers, +25 unique opening, +25 variation, +10 ultra concise, +10 fragment structure)

[100 pts] "Called OpenAGI crash at $850. Down 90% now. Read the tape."
(+15 celebration, +15 two numbers, +25 unique opening, +25 variation, +10 fragments, +10 concise)

[105 pts] "@peterschaff long gold = tech dump 48hrs later. Clockwork. Shorting NOW."
(+15 pattern, +15 data, +5 urgency, +25 unique opening, +25 variation, +10 fragment structure, +10 concise)

MID-SCORING EXAMPLES (60-80 points - better but still improve):
[70 pts] "BitcAIn looks interesting here with the volume spike."
(+10 observation, +15 data, -20 hedge word "looks", missing action/entities)

LOW-SCORING EXAMPLES (0-30 points - NEVER DO THIS):
[-100 pts] "Just saw @X's trade and I'm considering following..." (BANNED PATTERN)
[-50 pts] "Noticing BitcAIn movement, watching closely..." (BANNED, -50 same structure)
[10 pts] "The market might move higher possibly..." (-20 hedges, -30 passive, vague)

Topics you can post about (MUST reference specific entities):
- Market insights about SPECIFIC companies/stocks (mention company names and prices)
- Your trading performance on SPECIFIC markets (mention market names/tickers)
- Interesting movements in SPECIFIC predictions (mention prediction question)
- Commentary on SPECIFIC actors or companies (mention their names)
- Reactions to SPECIFIC recent trades or events (mention who/what)
- Contrarian takes on popular predictions
- Pattern recognition in market behavior
- Questions that spark discussion
- Personal trading wins/losses with specifics

FINAL REQUIREMENTS:
- Short (under ${MAX_TOKENS} tokens)
- SPECIFIC - reference actual entities from WORLD CONTEXT
- DIRECT - make bold claims, don't hedge with "considering" or "watching"
- CONFIDENT - you're a trader, not a commentator. Act, don't deliberate.
- Authentic to your personality
- Valuable to the community

CRITICAL SCORING CHECK:
1. Review your last 3 posts below - note their opening words and structure
2. Pick a DIFFERENT strategy and opening than you've used recently
3. Mentally calculate your score using the rubric above
4. TARGET: 90+ points (must get variation bonuses!)
5. If below 70 points, try a completely different approach
6. NEVER post anything with banned patterns (-100 pts = instant fail)
${contextString}

# Required Output Format (use exactly this structure)
<response>
<text>your post content here</text>
</response>`;

    // Ensure prompt fits within 32K context limit (W&B trained models)
    const estimatedTokens = countTokensSync(prompt);
    let finalPrompt = prompt;

    if (estimatedTokens > 30000) {
      // 30K with 2K safety margin
      logger.warn(
        `Post generation prompt too long: ${estimatedTokens} tokens, truncating`,
        { agentUserId }
      );
      const truncated = truncateToTokenLimitSync(prompt, 30000, {
        ellipsis: true,
      });
      finalPrompt = truncated.text;
      logger.info(`Truncated to ${truncated.tokens} tokens`, { agentUserId });
    }

    // Use large model (qwen3-32b or trained W&B model) for post generation with retry loop
    const MAX_ATTEMPTS = 3;
    let cleanContent: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const isRetry = attempt > 1;
        const currentPrompt = isRetry
          ? `${finalPrompt}\n\nREMINDER: You MUST output valid XML. Start with <response> and include <text> with your post content. No <think> tags.`
          : finalPrompt;

        const postContent = await callGroqDirect({
          prompt: currentPrompt,
          system: config?.systemPrompt ?? undefined,
          modelSize: 'large', // Uses trained W&B model if available, else qwen3-32b
          runtime: _runtime, // Pass runtime to access W&B trained models AND trajectory context
          temperature: isRetry ? 0.6 : 0.8,
          maxTokens: MAX_TOKENS,
          actionType: 'generate_autonomous_post',
          purpose: 'action', // RLAIF: This is a content generation action
        });

        // Extract <response>...</response> block before parsing
        const responseMatch = postContent.match(
          /<response>([\s\S]*?)<\/response>/i
        );
        if (!responseMatch) {
          logger.warn(
            'No <response> block found in post generation',
            {
              agentUserId,
              attempt,
              raw: postContent.substring(0, 300),
            },
            'AutonomousPosting'
          );
          continue;
        }

        // Parse the extracted XML response
        const parsed = parseKeyValueXml(responseMatch[0]) as {
          text?: string;
        } | null;

        // Check if we got valid text
        if (!parsed?.text || parsed.text.trim().length === 0) {
          logger.warn(
            'Failed to parse XML response in post generation',
            {
              agentUserId,
              attempt,
              raw: postContent.substring(0, 300),
            },
            'AutonomousPosting'
          );
          continue;
        }

        // Success! Clean up the response
        cleanContent = parsed.text.trim().replace(/^["']|["']$/g, '');
        break;
      } catch (error) {
        logger.warn(`Post generation attempt ${attempt} failed`, {
          agentUserId,
          error: String(error),
        });
      }
    }

    // If all attempts failed, return null
    if (!cleanContent) {
      logger.error(
        `Failed to generate valid post after ${MAX_ATTEMPTS} attempts`,
        { agentUserId },
        'AutonomousPosting'
      );
      return null;
    }

    // Post-process to fix any real names that slipped through
    const processed = await characterMappingService.transformText(cleanContent);
    cleanContent = processed.transformedText;

    if (processed.replacementCount > 0) {
      logger.warn(
        `Fixed ${processed.replacementCount} real name(s) in agent post`,
        {
          original: cleanContent.substring(0, 100),
          fixed: processed.transformedText.substring(0, 100),
        },
        'AutonomousPosting'
      );
    }

    logger.info(
      'LLM generated post',
      {
        agentUserId,
        content: cleanContent,
        length: cleanContent.length,
      },
      'AutonomousPosting'
    );

    if (!cleanContent || cleanContent.length < 10) {
      logger.warn(
        `Generated post too short or empty for agent ${agentUserId}`,
        {
          content: cleanContent,
          length: cleanContent.length,
        },
        'AutonomousPosting'
      );
      return null;
    }

    // Create the post
    const postId = await generateSnowflakeId();
    await db.insert(posts).values({
      id: postId,
      content: cleanContent,
      authorId: agentUserId,
      type: 'post',
      timestamp: new Date(),
      createdAt: new Date(),
    });

    logger.info(
      `Agent ${agent.displayName} created post: ${postId}`,
      undefined,
      'AutonomousPosting'
    );

    // Generate and store tags asynchronously
    void generateTagsFromPost(cleanContent)
      .then((generatedTags) => {
        if (generatedTags.length > 0) {
          return storeTagsForPost(postId, generatedTags).then(() => {
            logger.info(
              'Tagged agent post',
              { postId, agentId: agentUserId, tagCount: generatedTags.length },
              'AutonomousPosting'
            );
          });
        }
        return Promise.resolve();
      })
      .catch((tagError) => {
        logger.warn(
          'Failed to tag agent post',
          { postId, agentId: agentUserId, error: tagError },
          'AutonomousPosting'
        );
      });

    return postId;
  }
}

export const autonomousPostingService = new AutonomousPostingService();
