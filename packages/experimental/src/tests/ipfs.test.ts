/**
 * IPFS Simulator Tests
 *
 * Tests the in-memory IPFS simulator used for development.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { IPFSSimulator } from '../storage/ipfs-simulator.js';

describe('IPFSSimulator', () => {
  let ipfs: IPFSSimulator;

  beforeEach(() => {
    ipfs = new IPFSSimulator();
  });

  describe('storage', () => {
    it('stores content and returns CID', () => {
      const content = 'Hello, IPFS!';
      const obj = ipfs.store(content);

      expect(obj.cid).toMatch(/^Qm[a-f0-9]+$/);
      expect(obj.content).toBe(content);
      expect(obj.size).toBe(content.length);
      expect(obj.encrypted).toBe(false);
    });

    it('generates deterministic CID for same content', () => {
      const content = 'Deterministic content';

      const obj1 = ipfs.store(content);
      const obj2 = ipfs.store(content);

      expect(obj1.cid).toBe(obj2.cid);
    });

    it('generates different CID for different content', () => {
      const obj1 = ipfs.store('Content 1');
      const obj2 = ipfs.store('Content 2');

      expect(obj1.cid).not.toBe(obj2.cid);
    });

    it('marks content as encrypted when specified', () => {
      const obj = ipfs.store('Encrypted data', { encrypted: true });
      expect(obj.encrypted).toBe(true);
    });

    it('stores metadata', () => {
      const metadata = { version: 1, type: 'test' };
      const obj = ipfs.store('Content', { metadata });

      expect(obj.metadata).toEqual(metadata);
    });

    it('rejects empty content', () => {
      expect(() => ipfs.store('')).toThrow('Cannot store empty content');
    });
  });

  describe('retrieval', () => {
    it('retrieves stored content', () => {
      const content = 'Retrievable content';
      const stored = ipfs.store(content);

      const retrieved = ipfs.retrieve(stored.cid);

      expect(retrieved?.content).toBe(content);
    });

    it('returns null for non-existent CID', () => {
      expect(ipfs.retrieve('QmNonExistent12345')).toBeNull();
    });

    it('checks existence with has()', () => {
      const obj = ipfs.store('Test');

      expect(ipfs.has(obj.cid)).toBe(true);
      expect(ipfs.has('QmNonExistent')).toBe(false);
    });
  });

  describe('verification', () => {
    it('verifies valid content', () => {
      const obj = ipfs.store('Valid content');
      const result = ipfs.verify(obj.cid);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('fails verification for non-existent CID', () => {
      const result = ipfs.verify('QmNonExistent');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('listing', () => {
    it('lists all stored objects', () => {
      ipfs.store('Content 1');
      ipfs.store('Content 2');
      ipfs.store('Content 3');

      expect(ipfs.list()).toHaveLength(3);
    });

    it('lists only encrypted objects', () => {
      ipfs.store('Public 1', { encrypted: false });
      ipfs.store('Encrypted 1', { encrypted: true });
      ipfs.store('Public 2', { encrypted: false });
      ipfs.store('Encrypted 2', { encrypted: true });

      const encrypted = ipfs.listEncrypted();
      expect(encrypted).toHaveLength(2);
      expect(encrypted.every((o) => o.encrypted)).toBe(true);
    });

    it('lists only public objects', () => {
      ipfs.store('Public 1', { encrypted: false });
      ipfs.store('Encrypted 1', { encrypted: true });
      ipfs.store('Public 2', { encrypted: false });

      const publicObjs = ipfs.listPublic();
      expect(publicObjs).toHaveLength(2);
      expect(publicObjs.every((o) => !o.encrypted)).toBe(true);
    });
  });

  describe('management', () => {
    it('deletes objects', () => {
      const obj = ipfs.store('To be deleted');
      expect(ipfs.has(obj.cid)).toBe(true);

      const deleted = ipfs.delete(obj.cid);
      expect(deleted).toBe(true);
      expect(ipfs.has(obj.cid)).toBe(false);
    });

    it('returns false when deleting non-existent', () => {
      expect(ipfs.delete('QmNonExistent')).toBe(false);
    });

    it('clears all storage', () => {
      ipfs.store('Content 1');
      ipfs.store('Content 2');
      expect(ipfs.list()).toHaveLength(2);

      ipfs.clear();
      expect(ipfs.list()).toHaveLength(0);
    });

    it('tracks storage statistics', () => {
      ipfs.store('Public data', { encrypted: false });
      ipfs.store('More public', { encrypted: false });
      ipfs.store('Secret data', { encrypted: true });

      const stats = ipfs.getStats();
      expect(stats.objectCount).toBe(3);
      expect(stats.encryptedCount).toBe(1);
      expect(stats.publicCount).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it('pins and unpins content', () => {
      const obj = ipfs.store('Important content');

      expect(ipfs.isPinned(obj.cid)).toBe(false);

      ipfs.pin(obj.cid);
      expect(ipfs.isPinned(obj.cid)).toBe(true);
    });
  });
});
