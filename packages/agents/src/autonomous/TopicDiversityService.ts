/**
 * Topic Diversity Service
 *
 * Ensures agents post about different topics like real humans would.
 * Prevents the "echo chamber" effect where all agents post about the same thing.
 *
 * Key mechanisms:
 * 1. Topic tracking - Track what topics have been covered recently
 * 2. Topic assignment - Assign different topics to different agents
 * 3. Similarity detection - Detect and reject similar posts
 * 4. Cooldown management - Prevent same topic spam in short windows
 */

import { db, desc, gte, posts } from '@babylon/db';
import { logger } from '../shared/logger';

// =============================================================================
// Types
// =============================================================================

interface TopicCoverage {
  /** Topic identifier (normalized keywords) */
  topicKey: string;
  /** How many times covered in current window */
  coverageCount: number;
  /** Last time this topic was posted about */
  lastPostedAt: Date;
  /** Agent IDs who have posted about this */
  coveredByAgents: Set<string>;
  /** Sample content for similarity checking */
  sampleContent: string[];
}

interface TopicAssignment {
  /** Primary topic/market for this agent */
  primaryTopicKey: string;
  /** Market ID if this is a prediction market topic */
  marketId?: string;
  /** Signal direction from arc plan (YES/NO/NEUTRAL) */
  signalDirection?: 'YES' | 'NO' | 'NEUTRAL';
  /** Suggested angle/take for variety */
  suggestedAngle: string;
}

export interface PredictionMarketForTopic {
  id: string;
  question: string;
  yesPrice: number;
  noPrice: number;
}

// =============================================================================
// Constants
// =============================================================================

/** How long to track topic coverage (30 minutes) */
const TOPIC_TRACKING_WINDOW_MS = 30 * 60 * 1000;

/** Max posts about same topic in window before blocking */
const MAX_TOPIC_COVERAGE = 5;

/** Minimum word overlap to consider posts similar */
const SIMILARITY_THRESHOLD = 0.5; // Raised to allow more variety in similar topics

/** Angles for variety in posting */
const POSTING_ANGLES = [
  'contrarian', // Disagree with consensus
  'analytical', // Data/numbers focused
  'skeptical', // Question the narrative
  'bullish', // Optimistic take
  'bearish', // Pessimistic take
  'humorous', // Joking/sarcastic
  'insider', // Claim special knowledge
  'historical', // Compare to past events
  'questioning', // Ask a question
  'declarative', // Bold statement
];

// =============================================================================
// Topic Diversity Service
// =============================================================================

export class TopicDiversityService {
  /** In-memory topic coverage tracking */
  private topicCoverage: Map<string, TopicCoverage> = new Map();

  /** Agent to assigned topic mapping for current tick batch */
  private agentAssignments: Map<string, TopicAssignment> = new Map();

  /** Last cleanup timestamp */
  private lastCleanup = 0;

  /**
   * Extract topic key from content (normalized keywords)
   */
  extractTopicKey(content: string): string {
    // Normalize: lowercase, remove punctuation, extract key terms
    const normalized = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract key nouns/entities (simple heuristic)
    const words = normalized.split(' ');
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'dare',
      'ought',
      'used',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'up',
      'about',
      'into',
      'over',
      'after',
      'and',
      'but',
      'or',
      'so',
      'yet',
      'both',
      'either',
      'neither',
      'not',
      'only',
      'own',
      'same',
      'than',
      'too',
      'very',
      'just',
      'also',
      'now',
      'here',
      'there',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'every',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'nor',
      'as',
      'if',
      'then',
      'because',
      'while',
      'although',
      'though',
      'whether',
      'my',
      'your',
      'his',
      'her',
      'its',
      'our',
      'their',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'me',
      'him',
      'us',
      'them',
    ]);

    const keyTerms = words
      .filter((w) => w.length > 3 && !stopWords.has(w))
      .slice(0, 5)
      .sort()
      .join('_');

    return keyTerms || 'generic';
  }

  /**
   * Calculate similarity between two pieces of content
   * Uses Jaccard similarity on word sets
   */
  calculateSimilarity(content1: string, content2: string): number {
    const words1 = new Set(
      content1
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
    const words2 = new Set(
      content2
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Record that a topic was covered by an agent
   */
  recordTopicCoverage(
    agentId: string,
    content: string,
    topicKey?: string
  ): void {
    this.cleanupOldEntries();

    const key = topicKey || this.extractTopicKey(content);
    const now = new Date();

    const existing = this.topicCoverage.get(key);
    if (existing) {
      existing.coverageCount++;
      existing.lastPostedAt = now;
      existing.coveredByAgents.add(agentId);
      existing.sampleContent.push(content.substring(0, 200));
      // Keep only last 10 samples
      if (existing.sampleContent.length > 10) {
        existing.sampleContent = existing.sampleContent.slice(-10);
      }
    } else {
      this.topicCoverage.set(key, {
        topicKey: key,
        coverageCount: 1,
        lastPostedAt: now,
        coveredByAgents: new Set([agentId]),
        sampleContent: [content.substring(0, 200)],
      });
    }
  }

  /**
   * Check if a topic can be posted about (not over-covered)
   */
  canPostAboutTopic(agentId: string, topicKey: string): boolean {
    this.cleanupOldEntries();

    const coverage = this.topicCoverage.get(topicKey);
    if (!coverage) return true;

    // Block if too many posts about this topic
    if (coverage.coverageCount >= MAX_TOPIC_COVERAGE) {
      return false;
    }

    // Block if this agent already posted about it recently
    if (coverage.coveredByAgents.has(agentId)) {
      return false;
    }

    return true;
  }

  /**
   * Check if content is too similar to recent posts
   */
  isTooSimilarToRecent(content: string): {
    isSimilar: boolean;
    matchedContent?: string;
    similarity?: number;
  } {
    this.cleanupOldEntries();

    for (const coverage of this.topicCoverage.values()) {
      for (const sample of coverage.sampleContent) {
        const similarity = this.calculateSimilarity(content, sample);
        if (similarity >= SIMILARITY_THRESHOLD) {
          return {
            isSimilar: true,
            matchedContent: sample,
            similarity,
          };
        }
      }
    }

    return { isSimilar: false };
  }

  /**
   * Validate content before posting
   * Returns issues if any, empty array if OK
   *
   * Focus: Prevent repetitiveness, NOT restrict creative language
   */
  validateContent(agentId: string, content: string): string[] {
    const issues: string[] = [];

    // Check topic coverage - prevent same topic spam
    const topicKey = this.extractTopicKey(content);
    if (!this.canPostAboutTopic(agentId, topicKey)) {
      issues.push(
        `Topic "${topicKey}" has been covered too many times recently. Post about a different market or topic.`
      );
    }

    // Check similarity - prevent copy-paste style repetition
    const similarityCheck = this.isTooSimilarToRecent(content);
    if (similarityCheck.isSimilar) {
      issues.push(
        `Content is ${Math.round((similarityCheck.similarity ?? 0) * 100)}% similar to a recent post. Add your unique take.`
      );
    }

    return issues;
  }

  /**
   * Assign topics to agents for a batch tick
   * Ensures each agent gets a different primary topic
   */
  async assignTopicsToAgents(
    agentIds: string[],
    availableMarkets: PredictionMarketForTopic[]
  ): Promise<Map<string, TopicAssignment>> {
    this.cleanupOldEntries();
    this.agentAssignments.clear();

    // Score markets by how under-covered they are
    const marketScores = availableMarkets.map((market) => {
      const topicKey = this.extractTopicKey(market.question);
      const coverage = this.topicCoverage.get(topicKey);
      const coverageCount = coverage?.coverageCount ?? 0;

      // Higher score = less covered = better to assign
      const freshness = Math.max(0, MAX_TOPIC_COVERAGE - coverageCount);

      // Add some randomness for variety
      const randomBonus = Math.random() * 2;

      return {
        market,
        topicKey,
        score: freshness + randomBonus,
      };
    });

    // Sort by score (highest first)
    marketScores.sort((a, b) => b.score - a.score);

    // Shuffle agents for fairness
    const shuffledAgents = [...agentIds].sort(() => Math.random() - 0.5);

    // Assign topics round-robin
    for (let i = 0; i < shuffledAgents.length; i++) {
      const agentId = shuffledAgents[i];
      if (!agentId) continue;

      // Pick market for this agent (cycle through available markets)
      const marketIndex = i % marketScores.length;
      const marketData = marketScores[marketIndex];

      if (!marketData) continue;

      // Pick a random angle for variety
      const angle =
        POSTING_ANGLES[Math.floor(Math.random() * POSTING_ANGLES.length)] ??
        'analytical';

      this.agentAssignments.set(agentId, {
        primaryTopicKey: marketData.topicKey,
        marketId: marketData.market.id,
        suggestedAngle: angle,
      });
    }

    logger.info(
      `Assigned topics to ${shuffledAgents.length} agents`,
      {
        marketsAvailable: availableMarkets.length,
        assignmentCount: this.agentAssignments.size,
      },
      'TopicDiversityService'
    );

    return this.agentAssignments;
  }

  /**
   * Get the assigned topic for an agent
   */
  getAgentAssignment(agentId: string): TopicAssignment | undefined {
    return this.agentAssignments.get(agentId);
  }

  /**
   * Load recent posts from DB to seed the topic tracker
   */
  async seedFromRecentPosts(): Promise<void> {
    const cutoff = new Date(Date.now() - TOPIC_TRACKING_WINDOW_MS);

    const recentPosts = await db
      .select({
        authorId: posts.authorId,
        content: posts.content,
        timestamp: posts.timestamp,
      })
      .from(posts)
      .where(gte(posts.timestamp, cutoff))
      .orderBy(desc(posts.timestamp))
      .limit(100);

    for (const post of recentPosts) {
      this.recordTopicCoverage(post.authorId, post.content);
    }

    logger.info(
      `Seeded topic tracker with ${recentPosts.length} recent posts`,
      { topicsTracked: this.topicCoverage.size },
      'TopicDiversityService'
    );
  }

  /**
   * Get diversity instructions for an agent's prompt
   *
   * Emphasizes: Trading, events, markets, organic engagement
   */
  getDiversityInstructions(agentId: string): string {
    const assignment = this.agentAssignments.get(agentId);
    const recentTopics = Array.from(this.topicCoverage.entries())
      .filter(([, coverage]) => coverage.coverageCount >= 3)
      .map(([key]) => key)
      .slice(0, 5);

    let instructions = `
# PLAY THE GAME - MIX IT UP

## What to Do This Tick (pick what feels natural):
- TRADE on prediction markets or perps
- POST about events, markets, your thesis, anything
- COMMENT on someone else's post from the feed - engage!
- RESPOND to pending DMs or mentions
- React to news, rumors, price movements
- Dunk on a bad take or amplify a good one

## Topics Others Have Covered A Lot (try something different):
${recentTopics.length > 0 ? recentTopics.map((t) => `- ${t}`).join('\n') : '- None currently - pick any topic!'}

## Your Assigned Angle: ${assignment?.suggestedAngle?.toUpperCase() || 'UNIQUE'}
${this.getAngleDescription(assignment?.suggestedAngle || 'analytical')}

## Post Ideas (variety is good):
- React to a recent event or news
- Comment on market movements or price action
- Share a hot take on what's happening
- Flex a winning position
- Question something others believe
- Dunk on a bad take
- Just vibe about the game world
`;

    if (assignment?.marketId) {
      instructions += `
## Your Focus Market:
Market ID: ${assignment.marketId}
You could trade this, post about it, or comment on price action.
`;
    }

    return instructions;
  }

  /**
   * Get description for a posting angle
   */
  private getAngleDescription(angle: string): string {
    const descriptions: Record<string, string> = {
      contrarian: 'Challenge the consensus view. Find what others are missing.',
      analytical:
        'Focus on data, numbers, and logical analysis. Be specific with figures.',
      skeptical:
        "Question the narrative. What doesn't add up? What's being overlooked?",
      bullish:
        "Be optimistic. What's the upside others don't see? Why will this succeed?",
      bearish:
        'Be cautious/pessimistic. What are the risks? Why might this fail?',
      humorous:
        'Find the absurdity. Make it entertaining while still insightful.',
      insider:
        "Hint at special knowledge (carefully). What do insiders know that's not public?",
      historical:
        'Compare to past events. What historical pattern does this follow?',
      questioning:
        'Ask a provocative question that gets others thinking. Engage the community.',
      declarative: 'Make a bold, confident statement. Take a strong position.',
    };

    return descriptions[angle] || 'Bring your unique perspective.';
  }

  /**
   * Clean up old entries from the tracker
   */
  private cleanupOldEntries(): void {
    const now = Date.now();

    // Only cleanup every 5 minutes
    if (now - this.lastCleanup < 5 * 60 * 1000) return;

    this.lastCleanup = now;
    const cutoff = new Date(now - TOPIC_TRACKING_WINDOW_MS);

    for (const [key, coverage] of this.topicCoverage.entries()) {
      if (coverage.lastPostedAt < cutoff) {
        this.topicCoverage.delete(key);
      }
    }
  }

  /**
   * Get current topic coverage stats (for debugging/monitoring)
   */
  getTopicStats(): {
    topicsTracked: number;
    mostCovered: { topic: string; count: number }[];
  } {
    const sorted = Array.from(this.topicCoverage.entries())
      .map(([key, coverage]) => ({
        topic: key,
        count: coverage.coverageCount,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      topicsTracked: this.topicCoverage.size,
      mostCovered: sorted.slice(0, 10),
    };
  }
}

// Export singleton
export const topicDiversityService = new TopicDiversityService();
