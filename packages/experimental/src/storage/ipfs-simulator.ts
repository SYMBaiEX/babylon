/**
 * IPFS Simulator
 *
 * Content-addressed storage simulation.
 * Provides IPFS-like functionality for storing and retrieving data.
 */

import { keccak256, toBytes } from 'viem';

export interface StoredObject {
  cid: string;
  content: string;
  contentHash: string;
  encrypted: boolean;
  timestamp: number;
  size: number;
  metadata?: Record<string, unknown>;
}

export interface StoreOptions {
  encrypted?: boolean;
  metadata?: Record<string, unknown>;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

export interface StorageStats {
  objectCount: number;
  totalSize: number;
  encryptedCount: number;
  publicCount: number;
}

/**
 * Simulates IPFS content-addressed storage
 */
export class IPFSSimulator {
  private storage: Map<string, StoredObject> = new Map();

  /**
   * Store content and return CID
   */
  store(content: string, options: StoreOptions = {}): StoredObject {
    if (!content || content.length === 0) {
      throw new Error('Cannot store empty content');
    }

    // Generate content hash
    const contentHash = keccak256(toBytes(content));

    // Generate CID (simplified IPFS-style)
    const cid = `Qm${contentHash.slice(2, 48)}`;

    const obj: StoredObject = {
      cid,
      content,
      contentHash,
      encrypted: options.encrypted ?? false,
      timestamp: Date.now(),
      size: content.length,
      metadata: options.metadata,
    };

    this.storage.set(cid, obj);

    return obj;
  }

  /**
   * Retrieve content by CID
   */
  retrieve(cid: string): StoredObject | null {
    return this.storage.get(cid) ?? null;
  }

  /**
   * Check if content exists
   */
  has(cid: string): boolean {
    return this.storage.has(cid);
  }

  /**
   * Verify content integrity
   */
  verify(cid: string): VerificationResult {
    const obj = this.storage.get(cid);

    if (!obj) {
      return { valid: false, error: 'Object not found' };
    }

    // Verify content hash
    const computedHash = keccak256(toBytes(obj.content));
    if (computedHash !== obj.contentHash) {
      return { valid: false, error: 'Content hash mismatch' };
    }

    // Verify CID matches hash
    const expectedCid = `Qm${computedHash.slice(2, 48)}`;
    if (expectedCid !== obj.cid) {
      return { valid: false, error: 'CID mismatch' };
    }

    return { valid: true };
  }

  /**
   * List all stored objects
   */
  list(): StoredObject[] {
    return Array.from(this.storage.values());
  }

  /**
   * List encrypted objects
   */
  listEncrypted(): StoredObject[] {
    return this.list().filter((obj) => obj.encrypted);
  }

  /**
   * List public (non-encrypted) objects
   */
  listPublic(): StoredObject[] {
    return this.list().filter((obj) => !obj.encrypted);
  }

  /**
   * Delete an object
   */
  delete(cid: string): boolean {
    return this.storage.delete(cid);
  }

  /**
   * Clear all storage
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Get storage statistics
   */
  getStats(): StorageStats {
    let totalSize = 0;
    let encryptedCount = 0;
    let publicCount = 0;

    for (const obj of this.storage.values()) {
      totalSize += obj.size;
      if (obj.encrypted) {
        encryptedCount++;
      } else {
        publicCount++;
      }
    }

    return {
      objectCount: this.storage.size,
      totalSize,
      encryptedCount,
      publicCount,
    };
  }

  /**
   * Pin content (mark as important - simulated)
   */
  pin(cid: string): boolean {
    const obj = this.storage.get(cid);
    if (!obj) return false;

    obj.metadata = {
      ...obj.metadata,
      pinned: true,
      pinnedAt: Date.now(),
    };

    return true;
  }

  /**
   * Check if content is pinned
   */
  isPinned(cid: string): boolean {
    const obj = this.storage.get(cid);
    return obj?.metadata?.pinned === true;
  }
}
