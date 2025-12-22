/**
 * NPC Anti-Repetition Service
 *
 * Tracks recent post openings and vocabulary per character to prevent
 * repetitive patterns within the same character's posts.
 *
 * Uses an in-memory LRU cache per character to track:
 * - Recent opening words/phrases
 * - Overused vocabulary
 * - Post structure patterns
 *
 * @module services/npc-anti-repetition-service
 */

import { logger } from '@babylon/shared';

/** Maximum posts to track per character */
const HISTORY_SIZE = 20;

/** Minimum number of posts before flagging repetition */
const MIN_POSTS_FOR_ANALYSIS = 3;

/** Threshold for flagging overused openings (frequency ratio) */
const OPENING_REPETITION_THRESHOLD = 0.4; // 40% of posts start same way = problem

/** Threshold for flagging overused words */
const VOCABULARY_REPETITION_THRESHOLD = 0.5; // Word appears in 50%+ of posts = problem

/**
 * Tracked post data
 */
interface TrackedPost {
  content: string;
  timestamp: Date;
  opening: string; // First 2-3 words
  words: Set<string>; // Significant words
}

/**
 * Character post history
 */
interface CharacterHistory {
  posts: TrackedPost[];
  lastUpdated: Date;
}

/**
 * Repetition analysis result
 */
export interface RepetitionAnalysis {
  isRepetitive: boolean;
  overusedOpenings: string[];
  overusedWords: string[];
  suggestions: string[];
  repetitionScore: number; // 0-1, higher = more repetitive
}

class NPCAntiRepetitionService {
  private characterHistories = new Map<string, CharacterHistory>();

  /**
   * Extract opening phrase from post content
   */
  private extractOpening(content: string): string {
    const words = content.trim().split(/\s+/);
    // Take first 3 words as opening (or fewer if post is short)
    return words.slice(0, Math.min(3, words.length)).join(' ').toLowerCase();
  }

  /**
   * Extract significant words from post content
   * Filters out common words, short words, etc.
   */
  private extractSignificantWords(content: string): Set<string> {
    const stopWords = new Set([
      'a',
      'an',
      'the',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
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
      'can',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      "it's",
      'i',
      'me',
      'my',
      'we',
      'our',
      'you',
      'your',
      'he',
      'she',
      'they',
      'them',
      'his',
      'her',
      'their',
      'not',
      'no',
      'yes',
      'just',
      'only',
      'also',
      'so',
      'if',
      'then',
      'than',
      'when',
      'what',
      'who',
      'how',
      'why',
      'where',
      'which',
      'all',
      'any',
      'both',
      'each',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'very',
      'too',
      'as',
      'up',
      'out',
      'about',
    ]);

    const words = content
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stopWords.has(w));

    return new Set(words);
  }

  /**
   * Add a post to the character's history
   */
  addPost(actorId: string, content: string): void {
    if (!this.characterHistories.has(actorId)) {
      this.characterHistories.set(actorId, {
        posts: [],
        lastUpdated: new Date(),
      });
    }

    const history = this.characterHistories.get(actorId)!;

    const trackedPost: TrackedPost = {
      content,
      timestamp: new Date(),
      opening: this.extractOpening(content),
      words: this.extractSignificantWords(content),
    };

    history.posts.push(trackedPost);
    history.lastUpdated = new Date();

    // Maintain history size limit (LRU)
    if (history.posts.length > HISTORY_SIZE) {
      history.posts = history.posts.slice(-HISTORY_SIZE);
    }
  }

  /**
   * Analyze if a proposed post is too repetitive for this character
   */
  analyzePost(actorId: string, proposedContent: string): RepetitionAnalysis {
    const history = this.characterHistories.get(actorId);

    if (!history || history.posts.length < MIN_POSTS_FOR_ANALYSIS) {
      return {
        isRepetitive: false,
        overusedOpenings: [],
        overusedWords: [],
        suggestions: [],
        repetitionScore: 0,
      };
    }

    const proposedOpening = this.extractOpening(proposedContent);
    const proposedWords = this.extractSignificantWords(proposedContent);

    // Count opening frequency
    const openingCounts = new Map<string, number>();
    for (const post of history.posts) {
      openingCounts.set(
        post.opening,
        (openingCounts.get(post.opening) || 0) + 1
      );
    }

    // Count word frequency
    const wordCounts = new Map<string, number>();
    for (const post of history.posts) {
      for (const word of post.words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    const totalPosts = history.posts.length;

    // Check if proposed opening is overused
    const proposedOpeningCount = openingCounts.get(proposedOpening) || 0;
    const openingFrequency = proposedOpeningCount / totalPosts;
    const overusedOpenings: string[] = [];
    if (openingFrequency >= OPENING_REPETITION_THRESHOLD) {
      overusedOpenings.push(proposedOpening);
    }

    // Check for overused words in proposed post
    const overusedWords: string[] = [];
    for (const word of proposedWords) {
      const wordCount = wordCounts.get(word) || 0;
      const wordFrequency = wordCount / totalPosts;
      if (wordFrequency >= VOCABULARY_REPETITION_THRESHOLD) {
        overusedWords.push(word);
      }
    }

    // Calculate overall repetition score
    let repetitionScore = 0;
    if (overusedOpenings.length > 0) {
      repetitionScore += 0.5 * openingFrequency;
    }
    if (overusedWords.length > 0) {
      const avgWordFreq =
        overusedWords.reduce((sum, w) => {
          const count = wordCounts.get(w) || 0;
          return sum + count / totalPosts;
        }, 0) / overusedWords.length;
      repetitionScore += 0.5 * avgWordFreq;
    }

    // Generate suggestions
    const suggestions: string[] = [];
    if (overusedOpenings.length > 0) {
      suggestions.push(
        `Avoid starting with "${proposedOpening}" - used in ${Math.round(openingFrequency * 100)}% of recent posts`
      );
    }
    if (overusedWords.length > 0) {
      suggestions.push(
        `Reduce use of: ${overusedWords.slice(0, 3).join(', ')}`
      );
    }

    const isRepetitive = repetitionScore > 0.3 || overusedOpenings.length > 0;

    return {
      isRepetitive,
      overusedOpenings,
      overusedWords,
      suggestions,
      repetitionScore: Math.min(1, repetitionScore),
    };
  }

  /**
   * Get avoided openings for a character (to include in prompt)
   */
  getAvoidedOpenings(actorId: string): string[] {
    const history = this.characterHistories.get(actorId);
    if (!history || history.posts.length < MIN_POSTS_FOR_ANALYSIS) {
      return [];
    }

    // Count opening frequency
    const openingCounts = new Map<string, number>();
    for (const post of history.posts) {
      openingCounts.set(
        post.opening,
        (openingCounts.get(post.opening) || 0) + 1
      );
    }

    const totalPosts = history.posts.length;
    const avoidedOpenings: string[] = [];

    for (const [opening, count] of openingCounts) {
      if (count / totalPosts >= OPENING_REPETITION_THRESHOLD * 0.75) {
        avoidedOpenings.push(opening);
      }
    }

    return avoidedOpenings.slice(0, 5); // Max 5 to not overwhelm prompt
  }

  /**
   * Get avoided vocabulary for a character
   */
  getAvoidedVocabulary(actorId: string): string[] {
    const history = this.characterHistories.get(actorId);
    if (!history || history.posts.length < MIN_POSTS_FOR_ANALYSIS) {
      return [];
    }

    // Count word frequency
    const wordCounts = new Map<string, number>();
    for (const post of history.posts) {
      for (const word of post.words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    const totalPosts = history.posts.length;
    const avoidedWords: string[] = [];

    for (const [word, count] of wordCounts) {
      if (count / totalPosts >= VOCABULARY_REPETITION_THRESHOLD * 0.75) {
        avoidedWords.push(word);
      }
    }

    return avoidedWords.slice(0, 8); // Max 8 to not overwhelm prompt
  }

  /**
   * Log repetition metrics for monitoring
   */
  logMetrics(actorId: string, content: string): void {
    const analysis = this.analyzePost(actorId, content);

    if (analysis.isRepetitive) {
      logger.warn(
        'Repetitive post detected',
        {
          actorId,
          repetitionScore: analysis.repetitionScore.toFixed(2),
          overusedOpenings: analysis.overusedOpenings,
          overusedWords: analysis.overusedWords.slice(0, 5),
          suggestions: analysis.suggestions,
        },
        'AntiRepetition'
      );
    }
  }

  /**
   * Clear history for a character (e.g., at start of new game)
   */
  clearHistory(actorId: string): void {
    this.characterHistories.delete(actorId);
  }

  /**
   * Clear all history
   */
  clearAllHistory(): void {
    this.characterHistories.clear();
  }

  /**
   * Get stats for debugging
   */
  getStats(): Record<string, { postCount: number; lastUpdated: string }> {
    const stats: Record<string, { postCount: number; lastUpdated: string }> =
      {};
    for (const [actorId, history] of this.characterHistories) {
      stats[actorId] = {
        postCount: history.posts.length,
        lastUpdated: history.lastUpdated.toISOString(),
      };
    }
    return stats;
  }
}

// Singleton instance
export const antiRepetitionService = new NPCAntiRepetitionService();

/**
 * Export for direct access to avoided patterns
 */
export function getAvoidedPatternsContext(actorId: string): string {
  const openings = antiRepetitionService.getAvoidedOpenings(actorId);
  const vocabulary = antiRepetitionService.getAvoidedVocabulary(actorId);

  if (openings.length === 0 && vocabulary.length === 0) {
    return '';
  }

  let context = "\n=== AVOID THESE (you've overused them) ===\n";

  if (openings.length > 0) {
    context += `Do NOT start with: ${openings.map((o) => `"${o}"`).join(', ')}\n`;
  }

  if (vocabulary.length > 0) {
    context += `Reduce these words: ${vocabulary.join(', ')}\n`;
  }

  return context;
}
