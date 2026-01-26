/**
 * Commitment Storage
 *
 * Securely stores salts and commitments for commit-reveal pattern
 *
 * SECURITY NOTE:
 * - Salts are encrypted before storage
 * - In production, use KMS or secure key vault
 * - ORACLE_ENCRYPTION_KEY must be set in environment (no default)
 */

import { asc, db, eq, oracleCommitments } from '@babylon/db';
import { logger } from '@babylon/shared';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { first } from '../utils/array-utils';
import type { StoredCommitment } from './oracle/types';

const ALGORITHM = 'aes-256-cbc';

/**
 * Get the encryption key from environment.
 * Throws on first use if not configured - fail fast for security.
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ORACLE_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ORACLE_ENCRYPTION_KEY environment variable is required. ' +
        'Generate a 32-character key for AES-256 encryption.'
    );
  }
  // Ensure exactly 32 bytes for AES-256
  return Buffer.from(key.padEnd(32).slice(0, 32));
}

export class CommitmentStore {
  /**
   * Generate a cryptographically secure random salt
   */
  static generateSalt(): string {
    return '0x' + randomBytes(32).toString('hex');
  }

  /**
   * Encrypt salt for storage
   */
  private static encryptSalt(salt: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);

    let encrypted = cipher.update(salt, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt salt from storage
   */
  private static decryptSalt(encryptedSalt: string): string {
    const parts = encryptedSalt.split(':');
    const ivHex = first(parts);
    const encrypted = parts[1];

    if (!ivHex || !encrypted) {
      throw new Error('Invalid encrypted salt format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Store commitment with encrypted salt (upsert to handle updates)
   * Returns the stored commitment record
   */
  static async store(
    commitment: StoredCommitment
  ): Promise<{ id: string; questionId: string }> {
    const encryptedSalt = CommitmentStore.encryptSalt(commitment.salt);

    // Check if exists
    const existing = await db
      .select({ id: oracleCommitments.id })
      .from(oracleCommitments)
      .where(eq(oracleCommitments.questionId, commitment.questionId))
      .limit(1);

    let result: { id: string; questionId: string };

    if (existing.length > 0) {
      // Update existing
      const updated = await db
        .update(oracleCommitments)
        .set({
          sessionId: commitment.sessionId,
          saltEncrypted: encryptedSalt,
          commitment: commitment.commitment,
        })
        .where(eq(oracleCommitments.questionId, commitment.questionId))
        .returning({
          id: oracleCommitments.id,
          questionId: oracleCommitments.questionId,
        });

      const updatedRecord = first(updated);
      if (!updatedRecord) {
        throw new Error(
          `Failed to update commitment for question ${commitment.questionId}`
        );
      }
      result = updatedRecord;
    } else {
      // Create new
      const created = await db
        .insert(oracleCommitments)
        .values({
          id: `commitment-${commitment.questionId}-${Date.now()}`,
          questionId: commitment.questionId,
          sessionId: commitment.sessionId,
          saltEncrypted: encryptedSalt,
          commitment: commitment.commitment,
          createdAt: commitment.createdAt,
        })
        .returning({
          id: oracleCommitments.id,
          questionId: oracleCommitments.questionId,
        });

      const createdRecord = first(created);
      if (!createdRecord) {
        throw new Error(
          `Failed to create commitment for question ${commitment.questionId}`
        );
      }
      result = createdRecord;
    }

    logger.info(
      `Stored commitment for question ${commitment.questionId}`,
      {
        sessionId: commitment.sessionId,
        recordId: result.id,
        wasCreated: existing.length === 0,
        operation: 'upsert',
      },
      'CommitmentStore'
    );

    return result;
  }

  /**
   * Retrieve commitment and decrypt salt
   */
  static async retrieve(questionId: string): Promise<StoredCommitment | null> {
    logger.info(
      `Retrieving commitment for question ${questionId}`,
      undefined,
      'CommitmentStore'
    );

    const result = await db
      .select()
      .from(oracleCommitments)
      .where(eq(oracleCommitments.questionId, questionId))
      .limit(1);

    const stored = result[0];

    if (!stored) {
      logger.warn(
        `No commitment found for question ${questionId}`,
        undefined,
        'CommitmentStore'
      );
      return null;
    }

    logger.info(
      `Found commitment for question ${questionId}`,
      {
        recordId: stored.id,
        sessionId: stored.sessionId,
        hasCommitment: !!stored.commitment,
        hasSalt: !!stored.saltEncrypted,
      },
      'CommitmentStore'
    );

    const salt = CommitmentStore.decryptSalt(stored.saltEncrypted);

    return {
      questionId: stored.questionId,
      sessionId: stored.sessionId,
      salt,
      commitment: stored.commitment,
      createdAt: stored.createdAt,
    };
  }

  /**
   * Delete commitment after reveal (cleanup)
   * Idempotent - won't fail if commitment already deleted
   */
  static async delete(questionId: string): Promise<void> {
    const result = await db
      .delete(oracleCommitments)
      .where(eq(oracleCommitments.questionId, questionId))
      .returning({ id: oracleCommitments.id });

    if (result.length > 0) {
      logger.info(
        `Deleted commitment for question ${questionId}`,
        undefined,
        'CommitmentStore'
      );
    } else {
      logger.info(
        `Commitment already deleted for question ${questionId}`,
        undefined,
        'CommitmentStore'
      );
    }
  }

  /**
   * List all pending commitments for recovery and monitoring
   */
  static async listPending(): Promise<StoredCommitment[]> {
    const stored = await db
      .select()
      .from(oracleCommitments)
      .orderBy(asc(oracleCommitments.createdAt));

    return stored.map((s) => ({
      questionId: s.questionId,
      sessionId: s.sessionId,
      salt: CommitmentStore.decryptSalt(s.saltEncrypted),
      commitment: s.commitment,
      createdAt: s.createdAt,
    }));
  }
}
