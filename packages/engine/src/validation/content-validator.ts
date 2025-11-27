/**
 * Content Validator
 *
 * @description Canonical validation service for all generated content.
 * Consolidates scattered validation logic into fail-fast assertions.
 */

import { logger } from '@babylon/shared';

/**
 * Content Validator Class
 *
 * @description Static class providing validation methods for various content
 * types. Uses type assertions to ensure type safety after validation.
 */
export class ContentValidator {
  private static readonly MAX_POST_LENGTH = 5000;
  private static readonly MAX_EVENT_DESCRIPTION = 250;
  private static readonly MAX_QUESTION_TEXT = 500;

  /**
   * Validate post content
   */
  static validatePostContent(
    content: unknown,
    context?: string
  ): asserts content is string {
    const ctx = context || 'post';

    if (content === null || content === undefined) {
      throw new Error(`${ctx}: content is null or undefined`);
    }

    if (typeof content !== 'string') {
      throw new Error(`${ctx}: content must be string, got ${typeof content}`);
    }

    if (content.trim().length === 0) {
      throw new Error(`${ctx}: content cannot be empty`);
    }

    if (content.length > ContentValidator.MAX_POST_LENGTH) {
      logger.warn(
        `${ctx}: content exceeds max length`,
        {
          length: content.length,
          max: ContentValidator.MAX_POST_LENGTH,
        },
        'ContentValidator'
      );
      throw new Error(
        `${ctx}: content exceeds maximum length (${ContentValidator.MAX_POST_LENGTH} chars)`
      );
    }
  }

  /**
   * Validate event description
   */
  static validateEventDescription(
    description: unknown,
    context?: string
  ): asserts description is string {
    const ctx = context || 'event';

    if (description === null || description === undefined) {
      throw new Error(`${ctx}: description is null or undefined`);
    }

    if (typeof description !== 'string') {
      throw new Error(
        `${ctx}: description must be string, got ${typeof description}`
      );
    }

    if (description.trim().length === 0) {
      throw new Error(`${ctx}: description cannot be empty`);
    }

    if (description.length > ContentValidator.MAX_EVENT_DESCRIPTION) {
      logger.warn(
        `${ctx}: description too long, will truncate`,
        {
          length: description.length,
          max: ContentValidator.MAX_EVENT_DESCRIPTION,
        },
        'ContentValidator'
      );
    }
  }

  /**
   * Validate question text
   */
  static validateQuestionText(
    text: unknown,
    context?: string
  ): asserts text is string {
    const ctx = context || 'question';

    if (text === null || text === undefined) {
      throw new Error(`${ctx}: text is null or undefined`);
    }

    if (typeof text !== 'string') {
      throw new Error(`${ctx}: text must be string, got ${typeof text}`);
    }

    if (text.trim().length === 0) {
      throw new Error(`${ctx}: text cannot be empty`);
    }

    if (text.length > ContentValidator.MAX_QUESTION_TEXT) {
      throw new Error(
        `${ctx}: text exceeds maximum length (${ContentValidator.MAX_QUESTION_TEXT} chars)`
      );
    }
  }

  /**
   * Validate entity name (actor, organization)
   */
  static validateEntityName(
    name: unknown,
    context?: string
  ): asserts name is string {
    const ctx = context || 'entity';

    if (name === null || name === undefined) {
      throw new Error(`${ctx}: name is null or undefined`);
    }

    if (typeof name !== 'string') {
      throw new Error(`${ctx}: name must be string, got ${typeof name}`);
    }

    if (name.trim().length === 0) {
      throw new Error(`${ctx}: name cannot be empty`);
    }
  }

  /**
   * Validate day number (1-30)
   */
  static validateDayNumber(
    day: unknown,
    context?: string
  ): asserts day is number {
    const ctx = context || 'day';

    if (typeof day !== 'number') {
      throw new Error(`${ctx}: day must be number, got ${typeof day}`);
    }

    if (!Number.isFinite(day)) {
      throw new Error(`${ctx}: day must be finite number`);
    }

    if (day < 1 || day > 30) {
      throw new Error(`${ctx}: day must be between 1 and 30, got ${day}`);
    }
  }

  /**
   * Validate timestamp
   */
  static validateTimestamp(timestamp: unknown, context?: string): void {
    const ctx = context || 'timestamp';

    if (!timestamp) {
      throw new Error(`${ctx}: timestamp is required`);
    }

    let date: Date;

    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      throw new Error(
        `${ctx}: timestamp must be Date or ISO string, got ${typeof timestamp}`
      );
    }

    if (isNaN(date.getTime())) {
      throw new Error(`${ctx}: timestamp is invalid date`);
    }
  }

  /**
   * Validate array is not empty
   */
  static validateNotEmpty<T>(arr: T[], context: string): void {
    if (!Array.isArray(arr)) {
      throw new Error(`${context}: must be an array`);
    }

    if (arr.length === 0) {
      throw new Error(`${context}: cannot be empty`);
    }
  }

  /**
   * Truncate content to maximum length
   */
  static truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    logger.warn(
      'Truncating content',
      {
        originalLength: content.length,
        maxLength,
      },
      'ContentValidator'
    );

    return content.substring(0, maxLength - 3) + '...';
  }

  /**
   * Sanitize content (remove invalid characters, trim)
   */
  static sanitizeContent(content: string): string {
    return content
      .trim()
      .replace(/\u0000/g, '')
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
}

