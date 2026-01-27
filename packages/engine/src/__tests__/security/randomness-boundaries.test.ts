/**
 * Randomness Boundaries Security Tests
 *
 * @description
 * Validates that the codebase correctly uses cryptographic randomness for
 * game-critical operations while allowing Math.random() for non-critical tasks.
 *
 * **Security Requirements**:
 * 1. Question outcomes use crypto.randomBytes (via entropy.ts)
 * 2. Oracle salts use crypto.randomBytes
 * 3. Prediction market seeding uses crypto.randomBytes
 * 4. Math.random() is only used for:
 *    - Content variety (NPC post selection, shuffling)
 *    - UI/UX timing (jitter, delays)
 *    - Perp market simulation (independent of prediction outcomes)
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Get the src directory path
const srcDir = join(__dirname, '../../');

/**
 * Read a file and return its contents
 */
function readSourceFile(relativePath: string): string {
  const fullPath = join(srcDir, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Source file not found: ${fullPath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

/**
 * Find all usages of a pattern in source files.
 * Includes surrounding context lines to handle multiline expressions.
 */
function findUsages(
  pattern: RegExp,
  content: string,
  contextLines = 3
): string[] {
  const matches: string[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i] ?? '')) {
      // Include context from surrounding lines to handle multiline expressions
      const startLine = Math.max(0, i - contextLines);
      const endLine = Math.min(lines.length - 1, i + contextLines);
      const contextText = lines
        .slice(startLine, endLine + 1)
        .map((l) => l.trim())
        .join(' ');
      matches.push(`Line ${i + 1}: ${contextText}`);
    }
  }
  return matches;
}

describe('Randomness Boundaries', () => {
  describe('Cryptographic Randomness for Game-Critical Operations', () => {
    test('entropy.ts uses crypto.randomBytes', () => {
      const entropy = readSourceFile('utils/entropy.ts');

      // Must import from crypto
      expect(entropy).toContain("from 'crypto'");

      // Must use randomBytes for secure random
      expect(entropy).toContain('randomBytes');

      // Should NOT use Math.random for its core functions (excluding comments)
      // First, remove multi-line comment blocks (/* ... */)
      const withoutBlockComments = entropy.replace(/\/\*[\s\S]*?\*\//g, '');

      // Filter out lines that are single-line comments (start with // or *)
      const codeLines = withoutBlockComments
        .split('\n')
        .filter(
          (line) =>
            !line.trim().startsWith('//') && !line.trim().startsWith('*')
        );
      const codeContent = codeLines.join('\n');
      const mathRandomUsages = findUsages(/Math\.random\(\)/, codeContent);
      expect(mathRandomUsages.length).toBe(0);
    });

    test('oracle-commitment-store uses crypto for salts', () => {
      const oracleStore = readSourceFile('services/oracle-commitment-store.ts');

      // Must import from crypto
      expect(oracleStore).toContain("from 'crypto'");

      // Must use randomBytes for salt generation
      expect(oracleStore).toContain('randomBytes');

      // Should NOT use Math.random
      const mathRandomUsages = findUsages(/Math\.random\(\)/, oracleStore);
      expect(mathRandomUsages.length).toBe(0);
    });

    test('oracle-commitment-store requires encryption key', () => {
      const oracleStore = readSourceFile('services/oracle-commitment-store.ts');

      // Must NOT have a default encryption key in production code
      expect(oracleStore).not.toContain(
        "|| 'default-key-change-in-production-32'"
      );

      // Should require ORACLE_ENCRYPTION_KEY from environment
      expect(oracleStore).toContain('ORACLE_ENCRYPTION_KEY');
    });
  });

  describe('Math.random() Usage Boundaries', () => {
    test('game-tick.ts Math.random() is only for non-critical operations', () => {
      const gameTick = readSourceFile('game-tick.ts');
      const mathRandomUsages = findUsages(/Math\.random\(\)/, gameTick);

      // Document each usage for audit trail
      for (const usage of mathRandomUsages) {
        // HEURISTIC AUDIT NOTE: This is a heuristic-based check that matches by keyword.
        // Simple keyword matching may be insufficient to detect all unsafe usages or may
        // produce false positives. Usages flagged via console.warn below require periodic
        // manual review by an engineer to verify they are truly non-critical.
        //
        // Each usage should be in acceptable context:
        // - Score calculations (trending)
        // - Array shuffling (content variety)
        // - Jitter/timing (cosmetic)
        // - Perp market simulation (not prediction outcomes)
        // - Direction/magnitude for price movements
        const isAcceptable =
          usage.includes('score') ||
          usage.includes('sort') ||
          usage.includes('Jitter') ||
          usage.includes('jitter') ||
          usage.includes('volatility') ||
          usage.includes('momentum') ||
          usage.includes('fatTail') ||
          usage.includes('move') ||
          usage.includes('direction') ||
          usage.includes('Direction');

        if (!isAcceptable) {
          console.warn(`Potentially unsafe Math.random() usage: ${usage}`);
        }
      }

      // Collect unsafe usages and fail if any exist
      const unsafeUsages = mathRandomUsages.filter((usage) => {
        return !(
          usage.includes('score') ||
          usage.includes('sort') ||
          usage.includes('Jitter') ||
          usage.includes('jitter') ||
          usage.includes('volatility') ||
          usage.includes('momentum') ||
          usage.includes('fatTail') ||
          usage.includes('move') ||
          usage.includes('direction') ||
          usage.includes('Direction')
        );
      });

      expect(unsafeUsages).toEqual([]);

      // Should have some Math.random usages (for content variety)
      expect(mathRandomUsages.length).toBeGreaterThan(0);
    });

    test('QuestionManager does NOT use Math.random for outcomes', () => {
      const questionManager = readSourceFile('QuestionManager.ts');

      // Math.random should not appear in outcome-related code
      const outcomePatterns = [
        /outcome.*Math\.random/i,
        /Math\.random.*outcome/i,
        /pointsToward.*Math\.random/i,
        /Math\.random.*pointsToward/i,
      ];

      for (const pattern of outcomePatterns) {
        expect(pattern.test(questionManager)).toBe(false);
      }
    });
  });

  describe('Randomization Utility Separation', () => {
    test('randomization.ts is separate from entropy.ts', () => {
      const randomization = readSourceFile('utils/randomization.ts');
      const entropy = readSourceFile('utils/entropy.ts');

      // randomization.ts uses Math.random (acceptable for content variety)
      expect(randomization).toContain('Math.random');

      // entropy.ts uses crypto.randomBytes (required for security)
      expect(entropy).toContain('randomBytes');

      // They should be separate modules
      expect(randomization).not.toBe(entropy);
    });

    test('entropy.ts exports secure random functions', () => {
      const entropy = readSourceFile('utils/entropy.ts');

      // Should export secure random functions
      expect(entropy).toContain('export');
      expect(entropy).toContain('secureRandom');
    });
  });

  describe('Oracle Security', () => {
    test('oracle service uses commitment store for salts', () => {
      const oracleService = readSourceFile('services/oracle/oracle-service.ts');

      // Must import CommitmentStore
      expect(oracleService).toContain('CommitmentStore');
    });

    test('no hardcoded salts in oracle code', () => {
      const oracleService = readSourceFile('services/oracle/oracle-service.ts');
      const oracleStore = readSourceFile('services/oracle-commitment-store.ts');

      // No hardcoded hex strings that could be salts (64+ chars with 0x prefix)
      const hardcodedSaltPattern = /['"]0x[a-fA-F0-9]{64,}['"]/;

      // No hardcoded base64 blobs (long base64 strings, 32+ chars)
      const hardcodedBase64Pattern = /['"][A-Za-z0-9+/]{32,}(?:={0,2})?['"]/;

      // No hardcoded hex strings without 0x prefix (64+ hex chars)
      const hardcodedHexPattern = /['"][a-fA-F0-9]{64,}['"]/;

      // Check 0x-prefixed hex salts
      expect(hardcodedSaltPattern.test(oracleService)).toBe(false);
      expect(hardcodedSaltPattern.test(oracleStore)).toBe(false);

      // Check base64 blobs
      expect(hardcodedBase64Pattern.test(oracleService)).toBe(false);
      expect(hardcodedBase64Pattern.test(oracleStore)).toBe(false);

      // Check non-0x hex strings
      expect(hardcodedHexPattern.test(oracleService)).toBe(false);
      expect(hardcodedHexPattern.test(oracleStore)).toBe(false);
    });
  });
});
