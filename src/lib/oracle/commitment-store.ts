/**
 * Commitment Storage
 * 
 * Securely stores salts and commitments for commit-reveal pattern
 * 
 * SECURITY NOTE:
 * - Salts are encrypted before storage
 * - In production, use KMS or secure key vault
 * - This implementation uses simple encryption for demonstration
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { db, oracleCommitments, eq, asc } from '@/db'
import { logger } from '../logger'
import type { StoredCommitment } from './types'

const ENCRYPTION_KEY = process.env.ORACLE_ENCRYPTION_KEY || 'default-key-change-in-production-32'
const ALGORITHM = 'aes-256-cbc'

export class CommitmentStore {
  /**
   * Generate a cryptographically secure random salt
   */
  static generateSalt(): string {
    return '0x' + randomBytes(32).toString('hex')
  }

  /**
   * Encrypt salt for storage
   */
  private static encryptSalt(salt: string): string {
    const iv = randomBytes(16)
    const cipher = createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
      iv
    )

    let encrypted = cipher.update(salt, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    return iv.toString('hex') + ':' + encrypted
  }

  /**
   * Decrypt salt from storage
   */
  private static decryptSalt(encryptedSalt: string): string {
    const parts = encryptedSalt.split(':')
    const iv = Buffer.from(parts[0]!, 'hex')
    const encrypted = parts[1]!

    const decipher = createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
      iv
    )

    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }

  /**
   * Store commitment with encrypted salt (upsert to handle updates)
   * Returns the stored commitment record
   */
  static async store(commitment: StoredCommitment): Promise<{ id: string; questionId: string }> {
    const encryptedSalt = this.encryptSalt(commitment.salt)

    // Check if exists
    const existing = await db.select({ id: oracleCommitments.id })
      .from(oracleCommitments)
      .where(eq(oracleCommitments.questionId, commitment.questionId))
      .limit(1)

    let result: { id: string; questionId: string }

    if (existing.length > 0) {
      // Update existing
      const updated = await db.update(oracleCommitments)
        .set({
          sessionId: commitment.sessionId,
          saltEncrypted: encryptedSalt,
          commitment: commitment.commitment,
        })
        .where(eq(oracleCommitments.questionId, commitment.questionId))
        .returning({ id: oracleCommitments.id, questionId: oracleCommitments.questionId })

      result = updated[0]!
    } else {
      // Create new
      const created = await db.insert(oracleCommitments)
        .values({
          id: `commitment-${commitment.questionId}-${Date.now()}`,
          questionId: commitment.questionId,
          sessionId: commitment.sessionId,
          saltEncrypted: encryptedSalt,
          commitment: commitment.commitment,
          createdAt: commitment.createdAt,
        })
        .returning({ id: oracleCommitments.id, questionId: oracleCommitments.questionId })

      result = created[0]!
    }

    logger.info(
      `Stored commitment for question ${commitment.questionId}`,
      { 
        sessionId: commitment.sessionId,
        recordId: result.id,
        wasCreated: existing.length === 0,
        operation: 'upsert'
      },
      'CommitmentStore'
    )

    return result
  }

  /**
   * Retrieve commitment and decrypt salt
   */
  static async retrieve(questionId: string): Promise<StoredCommitment | null> {
    logger.info(
      `Retrieving commitment for question ${questionId}`,
      undefined,
      'CommitmentStore'
    )

    const result = await db.select()
      .from(oracleCommitments)
      .where(eq(oracleCommitments.questionId, questionId))
      .limit(1)

    const stored = result[0]

    if (!stored) {
      logger.warn(
        `No commitment found for question ${questionId}`,
        undefined,
        'CommitmentStore'
      )
      return null
    }

    logger.info(
      `Found commitment for question ${questionId}`,
      { 
        recordId: stored.id,
        sessionId: stored.sessionId,
        hasCommitment: !!stored.commitment,
        hasSalt: !!stored.saltEncrypted
      },
      'CommitmentStore'
    )

    const salt = this.decryptSalt(stored.saltEncrypted)

    return {
      questionId: stored.questionId,
      sessionId: stored.sessionId,
      salt,
      commitment: stored.commitment,
      createdAt: stored.createdAt
    }
  }

  /**
   * Delete commitment after reveal (cleanup)
   * Idempotent - won't fail if commitment already deleted
   */
  static async delete(questionId: string): Promise<void> {
    const result = await db.delete(oracleCommitments)
      .where(eq(oracleCommitments.questionId, questionId))
      .returning({ id: oracleCommitments.id })

    if (result.length > 0) {
      logger.info(`Deleted commitment for question ${questionId}`, undefined, 'CommitmentStore')
    } else {
      logger.info(`Commitment already deleted for question ${questionId}`, undefined, 'CommitmentStore')
    }
  }

  /**
   * List all pending commitments (for recovery/debugging)
   */
  static async listPending(): Promise<StoredCommitment[]> {
    const stored = await db.select()
      .from(oracleCommitments)
      .orderBy(asc(oracleCommitments.createdAt))

    return stored.map(s => ({
      questionId: s.questionId,
      sessionId: s.sessionId,
      salt: this.decryptSalt(s.saltEncrypted),
      commitment: s.commitment,
      createdAt: s.createdAt
    }))
  }
}
