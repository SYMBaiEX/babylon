/**
 * Message Quality Checker Service
 * 
 * Validates message quality based on:
 * - Length (not too short, not too long)
 * - Uniqueness (not duplicate of recent messages)
 * - Content quality (not spam, not gibberish)
 * 
 * Returns a quality score (0-1) that affects:
 * - Following chances
 * - Group chat invite chances
 * - Risk of being booted from group chats
 */

import { prisma } from '@/lib/database-service';

export interface QualityCheckResult {
  score: number; // 0-1, where 1 is perfect
  passed: boolean; // Whether message meets minimum standards
  warnings: string[]; // Non-blocking issues
  errors: string[]; // Blocking issues
  factors: {
    length: number; // 0-1
    uniqueness: number; // 0-1
    contentQuality: number; // 0-1
  };
}

export class MessageQualityChecker {
  // Length thresholds
  private static readonly MIN_LENGTH = 10;
  private static readonly IDEAL_MIN_LENGTH = 30;
  private static readonly IDEAL_MAX_LENGTH = 200;
  private static readonly MAX_LENGTH = 500;

  // Similarity threshold for duplicate detection
  private static readonly DUPLICATE_THRESHOLD = 0.85;

  /**
   * Check message quality
   */
  static async checkQuality(
    message: string,
    userId: string,
    contextType: 'reply' | 'groupchat' | 'dm',
    contextId: string // postId, chatId, or empty for game chats
  ): Promise<QualityCheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Check length
    const lengthScore = this.checkLength(message, errors, warnings);

    // 2. Check for duplicates
    const uniquenessScore = await this.checkUniqueness(
      message,
      userId,
      contextType,
      contextId,
      errors,
      warnings
    );

    // 3. Check content quality
    const contentScore = this.checkContent(message, errors, warnings);

    // Calculate overall score (weighted average)
    const score = lengthScore * 0.3 + uniquenessScore * 0.4 + contentScore * 0.3;

    return {
      score,
      passed: errors.length === 0 && score >= 0.5,
      warnings,
      errors,
      factors: {
        length: lengthScore,
        uniqueness: uniquenessScore,
        contentQuality: contentScore,
      },
    };
  }

  /**
   * Check message length
   */
  private static checkLength(
    message: string,
    errors: string[],
    warnings: string[]
  ): number {
    const length = message.trim().length;

    if (length < this.MIN_LENGTH) {
      errors.push(`Message too short (min ${this.MIN_LENGTH} characters)`);
      return 0;
    }

    if (length > this.MAX_LENGTH) {
      errors.push(`Message too long (max ${this.MAX_LENGTH} characters)`);
      return 0;
    }

    if (length < this.IDEAL_MIN_LENGTH) {
      warnings.push('Message is a bit short for best quality score');
      return 0.6;
    }

    if (length > this.IDEAL_MAX_LENGTH) {
      warnings.push('Message is a bit long for best quality score');
      return 0.8;
    }

    // Perfect length
    return 1.0;
  }

  /**
   * Check for duplicate/similar messages
   */
  private static async checkUniqueness(
    message: string,
    userId: string,
    contextType: 'reply' | 'groupchat' | 'dm',
    contextId: string,
    errors: string[],
    warnings: string[]
  ): Promise<number> {
    // Skip uniqueness check for game chats (empty contextId)
    if (!contextId) {
      return 1.0; // Perfect score for game chats
    }

    // Get recent messages from this user
    let recentMessages: string[] = [];

    if (contextType === 'reply') {
      // Check comments from this user on any post
      const recentComments = await prisma.comment.findMany({
        where: {
          authorId: userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20,
        select: {
          content: true,
        },
      });
      recentMessages = recentComments.map((c) => c.content);
    } else if (contextType === 'dm' || contextType === 'groupchat') {
      // Check messages from this user in this chat (works for both DMs and group chats)
      const recentChatMessages = await prisma.message.findMany({
        where: {
          chatId: contextId,
          senderId: userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20,
        select: {
          content: true,
        },
      });
      recentMessages = recentChatMessages.map((m) => m.content);
    }

    // Check similarity with recent messages
    const normalizedMessage = this.normalizeText(message);
    let highestSimilarity = 0;

    for (const recentMessage of recentMessages) {
      const similarity = this.calculateSimilarity(
        normalizedMessage,
        this.normalizeText(recentMessage)
      );
      highestSimilarity = Math.max(highestSimilarity, similarity);

      if (similarity >= this.DUPLICATE_THRESHOLD) {
        errors.push('Message is too similar to a recent message you posted');
        return 0;
      }
    }

    if (highestSimilarity > 0.7) {
      warnings.push('Message is somewhat similar to a recent message');
      return 0.7;
    }

    return 1.0;
  }

  /**
   * Check content quality
   */
  private static checkContent(
    message: string,
    errors: string[],
    warnings: string[]
  ): number {
    const trimmed = message.trim();

    // Check for all caps (spam indicator)
    const capsRatio = (trimmed.match(/[A-Z]/g) || []).length / trimmed.length;
    if (capsRatio > 0.7 && trimmed.length > 20) {
      warnings.push('Excessive caps usage may lower quality score');
      return 0.6;
    }

    // Check for repeated characters (spammy)
    if (/(.)\1{4,}/.test(trimmed)) {
      warnings.push('Repeated characters detected');
      return 0.7;
    }

    // Check for excessive punctuation
    const punctuationRatio =
      (trimmed.match(/[!?.,;:]/g) || []).length / trimmed.length;
    if (punctuationRatio > 0.3) {
      warnings.push('Excessive punctuation usage');
      return 0.7;
    }

    // Check word count (need actual words)
    const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
    if (words.length < 3) {
      errors.push('Message must contain at least 3 words');
      return 0;
    }

    // Check for URL spam (multiple URLs)
    const urlCount = (trimmed.match(/https?:\/\//gi) || []).length;
    if (urlCount > 2) {
      errors.push('Too many URLs in message');
      return 0;
    }

    return 1.0;
  }

  /**
   * Normalize text for comparison
   */
  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate similarity between two texts (Jaccard similarity)
   */
  private static calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Get user's quality statistics
   */
  static async getUserQualityStats(userId: string) {
    const interactions = await prisma.userInteraction.findMany({
      where: {
        userId,
      },
      select: {
        qualityScore: true,
      },
    });

    if (interactions.length === 0) {
      return {
        averageScore: 0,
        totalMessages: 0,
        highQualityCount: 0,
        lowQualityCount: 0,
      };
    }

    const averageScore =
      interactions.reduce((sum, i) => sum + i.qualityScore, 0) /
      interactions.length;
    const highQualityCount = interactions.filter((i) => i.qualityScore >= 0.8)
      .length;
    const lowQualityCount = interactions.filter((i) => i.qualityScore < 0.5)
      .length;

    return {
      averageScore,
      totalMessages: interactions.length,
      highQualityCount,
      lowQualityCount,
    };
  }
}


