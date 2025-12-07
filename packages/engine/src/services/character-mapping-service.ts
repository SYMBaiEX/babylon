/**
 * Character Mapping Service
 *
 * @description Handles find/replace of real names with parody names in text.
 * Uses StaticDataRegistry for mappings (no database calls). Supports
 * both character and organization mappings with priority-based replacement.
 *
 * NOTE: The characterMappings and organizationMappings database tables are
 * deprecated. All mappings are now generated from the static actor and
 * organization data in TypeScript.
 */

import { logger } from '@babylon/shared';
import {
  type CharacterMapping,
  type OrganizationMapping,
  StaticDataRegistry,
} from './static-data-registry';

/**
 * Text replacement result
 *
 * @description Contains transformed text with applied mappings and metadata
 * about which mappings were used.
 */
export interface TextReplacementResult {
  transformedText: string;
  characterMappings: Record<string, string>; // real -> parody
  organizationMappings: Record<string, string>; // real -> parody
  replacementCount: number;
}

/**
 * Extended mapping with isActive field for compatibility
 */
interface ActiveCharacterMapping extends CharacterMapping {
  isActive: boolean;
}

interface ActiveOrganizationMapping extends OrganizationMapping {
  isActive: boolean;
}

/**
 * Character Mapping Service Class
 *
 * @description Transforms text by replacing real names with parody equivalents.
 * Uses StaticDataRegistry for mappings (no database calls). All mappings are
 * derived from the hardcoded actor and organization data in TypeScript.
 */
export class CharacterMappingService {
  private characterMappingsCache: ActiveCharacterMapping[] = [];
  private organizationMappingsCache: ActiveOrganizationMapping[] = [];
  private initialized = false;

  /**
   * Load mappings from StaticDataRegistry (no database calls)
   *
   * @description Loads character and organization mappings from StaticDataRegistry.
   * Orders by priority (higher priority first) for proper replacement order.
   *
   * @returns {void}
   * @private
   */
  private loadMappings(): void {
    if (this.initialized) {
      return;
    }

    // Get mappings from StaticDataRegistry (no DB calls!)
    const charMappings = StaticDataRegistry.getAllCharacterMappings();
    const orgMappings = StaticDataRegistry.getAllOrganizationMappings();

    // Convert to active mappings and sort by priority
    this.characterMappingsCache = charMappings
      .map((m) => ({ ...m, isActive: true }))
      .sort((a, b) => b.priority - a.priority);

    this.organizationMappingsCache = orgMappings
      .map((m) => ({ ...m, isActive: true }))
      .sort((a, b) => b.priority - a.priority);

    this.initialized = true;
    logger.info(
      `Loaded ${this.characterMappingsCache.length} character mappings and ${this.organizationMappingsCache.length} organization mappings from StaticDataRegistry`,
      undefined,
      'CharacterMappingService'
    );
  }

  /**
   * Build word-to-word mapping from real name to parody name
   *
   * @example
   * buildWordMapping("Arthur Hayes", "Arthur HAIyes")
   * // Returns: { "arthur": "Arthur", "hayes": "HAIyes" }
   */
  private buildWordMapping(
    realName: string,
    parodyName: string
  ): Map<string, string> {
    const realWords = realName.split(/\s+/);
    const parodyWords = parodyName.split(/\s+/);
    const wordMap = new Map<string, string>();

    // Map corresponding words by position
    for (let i = 0; i < realWords.length && i < parodyWords.length; i++) {
      const realWord = realWords[i];
      const parodyWord = parodyWords[i];
      if (realWord && parodyWord) {
        wordMap.set(realWord.toLowerCase(), parodyWord);
      }
    }

    return wordMap;
  }

  /**
   * Preserve the case pattern of the original text in the replacement
   *
   * Only transforms case for:
   * - ALL LOWERCASE input → all lowercase output
   * - ALL UPPERCASE input → all uppercase output
   *
   * For mixed case (like "Hayes"), keeps the parody name's original casing ("HAIyes")
   * to preserve intentional AI-pun styling.
   *
   * @example
   * preserveCase("hayes", "HAIyes") → "haiyes"
   * preserveCase("HAYES", "HAIyes") → "HAIYES"
   * preserveCase("Hayes", "HAIyes") → "HAIyes" (keeps parody casing)
   */
  private preserveCase(original: string, replacement: string): string {
    if (!original || !replacement) return replacement;

    // Check if original is all lowercase → lowercase output
    if (original === original.toLowerCase()) {
      return replacement.toLowerCase();
    }

    // Check if original is all uppercase → uppercase output
    if (original === original.toUpperCase()) {
      return replacement.toUpperCase();
    }

    // For mixed case (title case, etc.), keep parody name's original casing
    // This preserves intentional AI-pun styling like "HAIyes", "AIlon", "FrAInk"
    return replacement;
  }

  /**
   * Generate username from a name (removes spaces, lowercases)
   *
   * @example
   * generateUsername("Elon Musk") → "elonmusk"
   * generateUsername("AIlon Musk") → "ailonmusk"
   */
  private generateUsername(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '');
  }

  /**
   * Get the appropriate replacement for a search term
   *
   * If searchName is the full realName, use full parodyName.
   * If searchName is a partial match (alias), find corresponding parody word.
   *
   * @example
   * getReplacementForTerm("Hayes", "Arthur Hayes", "Arthur HAIyes")
   * // Returns: "HAIyes"
   *
   * getReplacementForTerm("Arthur Hayes", "Arthur Hayes", "Arthur HAIyes")
   * // Returns: "Arthur HAIyes"
   */
  private getReplacementForTerm(
    searchName: string,
    realName: string,
    parodyName: string
  ): string {
    // If searching for the full name, return full parody name
    if (searchName.toLowerCase() === realName.toLowerCase()) {
      return parodyName;
    }

    // Build word mapping and look for the search term
    const wordMap = this.buildWordMapping(realName, parodyName);
    const searchLower = searchName.toLowerCase();

    // Check if searchName is a single word that maps
    if (wordMap.has(searchLower)) {
      return wordMap.get(searchLower)!;
    }

    // For multi-word aliases, try to map each word
    const searchWords = searchName.split(/\s+/);
    if (searchWords.length > 1) {
      const mappedWords = searchWords.map((word) => {
        const mapped = wordMap.get(word.toLowerCase());
        return mapped || word; // Keep original if no mapping
      });
      return mappedWords.join(' ');
    }

    // Fallback: return the full parody name (shouldn't happen often)
    return parodyName;
  }

  /**
   * Transform text by replacing real names with parody names
   *
   * @description Transforms text by replacing real names with parody equivalents.
   * Uses case-insensitive whole-word matching and preserves original case pattern.
   *
   * Processing order:
   * 1. Usernames first (@elonmusk → @ailonmusk)
   * 2. Character names (Elon Musk → AIlon Musk)
   * 3. Organization names (Tesla → TeslAI)
   *
   * Case preservation:
   * - "hayes" → "haiyes" (lowercase preserved)
   * - "HAYES" → "HAIYES" (uppercase preserved)
   * - "Hayes" → "HAIyes" (original parody case)
   *
   * Word-to-word mapping:
   * - "Arthur Hayes" → "Arthur HAIyes" (full name)
   * - "Hayes" → "HAIyes" (just the word, not full name)
   *
   * @param {string} text - Text to transform
   * @returns {Promise<TextReplacementResult>} Transformation result with mappings applied
   */
  async transformText(text: string): Promise<TextReplacementResult> {
    this.loadMappings();

    let transformedText = text;
    const characterMappingsResult: Record<string, string> = {};
    const organizationMappingsResult: Record<string, string> = {};
    let replacementCount = 0;

    // PHASE 1: Replace usernames FIRST (e.g., @elonmusk → @ailonmusk)
    // This must happen before name replacements to avoid partial matches
    for (const mapping of this.characterMappingsCache) {
      const realUsername = this.generateUsername(mapping.realName);
      const parodyUsername = this.generateUsername(mapping.parodyName);

      // Skip if usernames are the same
      if (realUsername === parodyUsername) continue;

      // Skip if parody username already in text
      if (transformedText.toLowerCase().includes(parodyUsername)) continue;

      // Match @username pattern (case-insensitive)
      const usernameRegex = new RegExp(
        `@${escapeRegex(realUsername)}\\b`,
        'gi'
      );

      if (usernameRegex.test(transformedText)) {
        transformedText = transformedText.replace(usernameRegex, (match) => {
          // Extract the matched username without @
          const matchedUsername = match.slice(1);
          // Preserve case of the original username
          const casedReplacement = this.preserveCase(
            matchedUsername,
            parodyUsername
          );
          characterMappingsResult[`@${realUsername}`] = `@${casedReplacement}`;
          replacementCount++;
          return `@${casedReplacement}`;
        });
      }
    }

    // PHASE 2: Replace character names
    for (const mapping of this.characterMappingsCache) {
      const searchNames = [mapping.realName, ...mapping.aliases];

      for (const searchName of searchNames) {
        // Get the appropriate replacement (word-to-word mapping)
        const replacement = this.getReplacementForTerm(
          searchName,
          mapping.realName,
          mapping.parodyName
        );

        // Skip if this specific replacement is already in the text
        if (transformedText.toLowerCase().includes(replacement.toLowerCase())) {
          continue;
        }

        // Create regex for case-insensitive whole-word matching
        const regex = new RegExp(
          `(?:^|\\s|[^a-zA-Z@])${escapeRegex(searchName)}(?:$|\\s|[^a-zA-Z])`,
          'gi'
        );

        const matches = transformedText.match(regex);
        if (matches) {
          transformedText = transformedText.replace(regex, (match) => {
            // Extract the actual matched name (excluding leading/trailing chars)
            const matchLower = match.toLowerCase();
            const searchLower = searchName.toLowerCase();

            const leadingChar = !matchLower.startsWith(searchLower[0] ?? '')
              ? match[0]
              : '';
            const trailingChar = !matchLower.endsWith(
              searchLower[searchLower.length - 1] ?? ''
            )
              ? match[match.length - 1]
              : '';

            // Extract the actual matched text (without leading/trailing chars)
            const actualMatch = match.slice(
              leadingChar ? 1 : 0,
              trailingChar ? -1 : undefined
            );

            // Preserve the case of the original text
            const casedReplacement = this.preserveCase(
              actualMatch,
              replacement
            );

            characterMappingsResult[searchName] = casedReplacement;
            replacementCount++;

            return `${leadingChar}${casedReplacement}${trailingChar}`;
          });
        }
      }
    }

    // PHASE 3: Replace organization names
    for (const mapping of this.organizationMappingsCache) {
      const searchNames = [mapping.realName, ...mapping.aliases];

      for (const searchName of searchNames) {
        // Get the appropriate replacement (word-to-word mapping)
        const replacement = this.getReplacementForTerm(
          searchName,
          mapping.realName,
          mapping.parodyName
        );

        // Skip if this specific replacement is already in the text
        if (transformedText.toLowerCase().includes(replacement.toLowerCase())) {
          continue;
        }

        const regex = new RegExp(
          `(?:^|\\s|[^a-zA-Z@])${escapeRegex(searchName)}(?:$|\\s|[^a-zA-Z])`,
          'gi'
        );

        const matches = transformedText.match(regex);
        if (matches) {
          transformedText = transformedText.replace(regex, (match) => {
            const matchLower = match.toLowerCase();
            const searchLower = searchName.toLowerCase();

            const leadingChar = !matchLower.startsWith(searchLower[0] ?? '')
              ? match[0]
              : '';
            const trailingChar = !matchLower.endsWith(
              searchLower[searchLower.length - 1] ?? ''
            )
              ? match[match.length - 1]
              : '';

            // Extract the actual matched text
            const actualMatch = match.slice(
              leadingChar ? 1 : 0,
              trailingChar ? -1 : undefined
            );

            // Preserve the case of the original text
            const casedReplacement = this.preserveCase(
              actualMatch,
              replacement
            );

            organizationMappingsResult[searchName] = casedReplacement;
            replacementCount++;

            return `${leadingChar}${casedReplacement}${trailingChar}`;
          });
        }
      }
    }

    return {
      transformedText,
      characterMappings: characterMappingsResult,
      organizationMappings: organizationMappingsResult,
      replacementCount,
    };
  }

  /**
   * Check if text contains any real names that should be replaced
   * Useful for validation
   */
  async detectRealNames(text: string): Promise<string[]> {
    this.loadMappings();

    const foundNames: string[] = [];

    // Check characters
    for (const mapping of this.characterMappingsCache) {
      const searchNames = [mapping.realName, ...mapping.aliases];

      for (const searchName of searchNames) {
        const regex = new RegExp(`\\b${escapeRegex(searchName)}\\b`, 'i');

        if (regex.test(text)) {
          foundNames.push(searchName);
        }
      }
    }

    // Check organizations
    for (const mapping of this.organizationMappingsCache) {
      const searchNames = [mapping.realName, ...mapping.aliases];

      for (const searchName of searchNames) {
        const regex = new RegExp(`\\b${escapeRegex(searchName)}\\b`, 'i');

        if (regex.test(text)) {
          foundNames.push(searchName);
        }
      }
    }

    return foundNames;
  }

  /**
   * Get all active character mappings
   */
  async getCharacterMappings(): Promise<ActiveCharacterMapping[]> {
    this.loadMappings();
    return this.characterMappingsCache;
  }

  /**
   * Get all active organization mappings
   */
  async getOrganizationMappings(): Promise<ActiveOrganizationMapping[]> {
    this.loadMappings();
    return this.organizationMappingsCache;
  }

  /**
   * Refresh cache (call after updating static data - rare)
   */
  refreshCache(): void {
    this.initialized = false;
    StaticDataRegistry.clearCache();
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Singleton instance
export const characterMappingService = new CharacterMappingService();
