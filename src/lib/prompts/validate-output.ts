/**
 * Output Validation Utilities
 * 
 * Validates generated feed content to ensure it follows all rules:
 * - No real names (only parody names)
 * - No hashtags
 * - No emojis
 * - Character limits respected
 */

import { getForbiddenRealNames } from '@/prompts';

export interface ValidationResult {
  isValid: boolean;
  violations: string[];
  warnings: string[];
}

/**
 * Forbidden real-name patterns that should NEVER appear in generated content.
 * These patterns catch common variations and misspellings.
 */
const FORBIDDEN_PATTERNS = [
  // OpenAI variations
  /\bopenai\b/i,
  /\bopen\s*ai\b/i,
  /\bopen-ai\b/i,
  /\bopen_ai\b/i,

  // People
  /\belon\s*musk\b/i,
  /\bsam\s*altman\b/i,
  /\bmark\s*zuckerberg\b/i,
  /\bjeff\s*bezos\b/i,
  /\bbill\s*gates\b/i,
  /\bsteve\s*jobs\b/i,
  /\btim\s*cook\b/i,
  /\bsatya\s*nadella\b/i,
  /\bsundar\s*pichai\b/i,
  /\bjensen\s*huang\b/i,
  /\bvitalik\s*buterin\b/i,

  // Companies (exact matches with word boundaries)
  /\bmeta\s*platforms\b/i,
  /\bfacebook\s*inc\b/i,
  /\bmicrosoft\s*corp/i,
  /\bgoogle\s*llc/i,
  /\bamazon\s*com/i,
  /\bapple\s*inc/i,
  /\btesla\s*inc/i,
  /\banthropic\s*ai/i,
  /\bnvidia\s*corp/i,
];

/**
 * Validates that text doesn't contain real names
 */
export function validateNoRealNames(text: string): string[] {
  const violations: string[] = [];

  // Pattern-based detection (catches variations and common misspellings)
  FORBIDDEN_PATTERNS.forEach((pattern) => {
    const match = pattern.exec(text);
    if (match) {
      violations.push(`FORBIDDEN: Contains real-name pattern "${match[0]}" (matched by ${pattern})`);
    }
  });

  // Original exact-match detection from database
  const forbiddenNames = getForbiddenRealNames();
  forbiddenNames.forEach((realName: string) => {
    // Case insensitive check to catch variations
    const regex = new RegExp(`\\b${escapeRegex(realName)}\\b`, 'i');
    if (regex.test(text)) {
      violations.push(`FORBIDDEN: Contains real name "${realName}"`);
    }
  });

  return violations;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates that text doesn't contain hashtags
 */
export function validateNoHashtags(text: string): string[] {
  const violations: string[] = [];
  const hashtagRegex = /#\w+/g;
  const hashtags = text.match(hashtagRegex);
  
  if (hashtags && hashtags.length > 0) {
    violations.push(`FORBIDDEN: Contains hashtags: ${hashtags.join(', ')}`);
  }

  return violations;
}

/**
 * Validates that text doesn't contain emojis
 */
export function validateNoEmojis(text: string): string[] {
  const violations: string[] = [];
  // Regex to match most common emoji ranges
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu;
  const emojis = text.match(emojiRegex);
  
  if (emojis && emojis.length > 0) {
    violations.push(`FORBIDDEN: Contains emojis: ${emojis.join(' ')}`);
  }

  return violations;
}

/**
 * Validates character count
 */
export function validateCharacterLimit(
  text: string,
  maxLength: number,
  postType: string
): string[] {
  const violations: string[] = [];
  
  if (text.length > maxLength) {
    violations.push(
      `EXCEEDED: ${postType} is ${text.length} chars (max: ${maxLength})`
    );
  }

  return violations;
}

/**
 * Comprehensive validation of feed post content
 */
export function validateFeedPost(
  text: string,
  options: {
    maxLength: number;
    postType: string;
  }
): ValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  // Critical validations (must pass)
  violations.push(...validateNoRealNames(text));
  violations.push(...validateNoHashtags(text));
  violations.push(...validateNoEmojis(text));
  violations.push(...validateCharacterLimit(text, options.maxLength, options.postType));

  // Warnings (should pass but not critical)
  if (text.length < 20) {
    warnings.push(`Post is very short (${text.length} chars)`);
  }

  // Check for common mistakes
  if (text.includes('AIlon') || text.includes('Sam AIltman') || text.includes('Mark Zuckerborg')) {
    violations.push('CRITICAL: Contains partial real name - use full parody name');
  }

  return {
    isValid: violations.length === 0,
    violations,
    warnings,
  };
}

/**
 * Character limits by post type
 */
export const CHARACTER_LIMITS = {
  AMBIENT: 280,
  JOURNALIST: 280,
  COMPANY: 140,
  GOVERNMENT: 140,
  REPLY: 140,
  REACTION: 140,
  COMMENTARY: 140,
  MEDIA: 140,
  CONSPIRACY: 140,
  EXPERT: 140,
  MINUTE_AMBIENT: 200,
  STOCK_TICKER: 150,
  ANALYST: 250,
} as const;

/**
 * Validate a batch of posts
 */
export function validatePostBatch(
  posts: Array<{ post: string; type: keyof typeof CHARACTER_LIMITS }>
): {
  allValid: boolean;
  results: Array<ValidationResult & { post: string }>;
} {
  const results = posts.map(({ post, type }) => ({
    post,
    ...validateFeedPost(post, {
      maxLength: CHARACTER_LIMITS[type],
      postType: type,
    }),
  }));

  return {
    allValid: results.every(r => r.isValid),
    results,
  };
}

/**
 * Example usage:
 * 
 * const result = validateFeedPost(generatedPost, {
 *   maxLength: CHARACTER_LIMITS.AMBIENT,
 *   postType: 'AMBIENT'
 * });
 * 
 * if (!result.isValid) {
 *   console.error('Validation failed:', result.violations);
 *   // Regenerate or reject the post
 * }
 * 
 * if (result.warnings.length > 0) {
 *   console.warn('Warnings:', result.warnings);
 * }
 */

