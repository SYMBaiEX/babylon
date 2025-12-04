/**
 * IPFS Simulator Tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { IPFSSimulator } from '../storage/ipfs-simulator.js';

describe('IPFSSimulator Storage', () => {
  let ipfs: IPFSSimulator;

  beforeEach(() => {
    ipfs = new IPFSSimulator();
  });

  it('should store content and return CID', () => {
    const content = 'Hello, IPFS!';
    const obj = ipfs.store(content);

    expect(obj.cid).toMatch(/^Qm[a-f0-9]+$/);
    expect(obj.content).toBe(content);
    expect(obj.size).toBe(content.length);
    expect(obj.encrypted).toBe(false);
  });

  it('should generate deterministic CID for same content', () => {
    const content = 'Deterministic content';

    const obj1 = ipfs.store(content);
    const obj2 = ipfs.store(content);

    expect(obj1.cid).toBe(obj2.cid);
  });

  it('should generate different CID for different content', () => {
    const obj1 = ipfs.store('Content 1');
    const obj2 = ipfs.store('Content 2');

    expect(obj1.cid).not.toBe(obj2.cid);
  });

  it('should mark content as encrypted when specified', () => {
    const obj = ipfs.store('Encrypted data', { encrypted: true });

    expect(obj.encrypted).toBe(true);
  });

  it('should store metadata', () => {
    const metadata = { version: 1, type: 'test' };
    const obj = ipfs.store('Content', { metadata });

    expect(obj.metadata).toEqual(metadata);
  });

  it('should reject empty content', () => {
    expect(() => ipfs.store('')).toThrow('Cannot store empty content');
  });
});

describe('IPFSSimulator Retrieval', () => {
  let ipfs: IPFSSimulator;

  beforeEach(() => {
    ipfs = new IPFSSimulator();
  });

  it('should retrieve stored content', () => {
    const content = 'Retrievable content';
    const stored = ipfs.store(content);

    const retrieved = ipfs.retrieve(stored.cid);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe(content);
  });

  it('should return null for non-existent CID', () => {
    const retrieved = ipfs.retrieve('QmNonExistent12345');

    expect(retrieved).toBeNull();
  });

  it('should check existence with has()', () => {
    const obj = ipfs.store('Test');

    expect(ipfs.has(obj.cid)).toBe(true);
    expect(ipfs.has('QmNonExistent')).toBe(false);
  });
});

describe('IPFSSimulator Verification', () => {
  let ipfs: IPFSSimulator;

  beforeEach(() => {
    ipfs = new IPFSSimulator();
  });

  it('should verify valid content', () => {
    const obj = ipfs.store('Valid content');
    const result = ipfs.verify(obj.cid);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should fail verification for non-existent CID', () => {
    const result = ipfs.verify('QmNonExistent');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('IPFSSimulator Listing', () => {
  let ipfs: IPFSSimulator;

  beforeEach(() => {
    ipfs = new IPFSSimulator();
  });

  it('should list all stored objects', () => {
    ipfs.store('Content 1');
    ipfs.store('Content 2');
    ipfs.store('Content 3');

    const list = ipfs.list();
    expect(list).toHaveLength(3);
  });

  it('should list only encrypted objects', () => {
    ipfs.store('Public 1', { encrypted: false });
    ipfs.store('Encrypted 1', { encrypted: true });
    ipfs.store('Public 2', { encrypted: false });
    ipfs.store('Encrypted 2', { encrypted: true });

    const encrypted = ipfs.listEncrypted();
    expect(encrypted).toHaveLength(2);
    expect(encrypted.every((o) => o.encrypted)).toBe(true);
  });

  it('should list only public objects', () => {
    ipfs.store('Public 1', { encrypted: false });
    ipfs.store('Encrypted 1', { encrypted: true });
    ipfs.store('Public 2', { encrypted: false });

    const publicObjs = ipfs.listPublic();
    expect(publicObjs).toHaveLength(2);
    expect(publicObjs.every((o) => !o.encrypted)).toBe(true);
  });
});

describe('IPFSSimulator Management', () => {
  let ipfs: IPFSSimulator;

  beforeEach(() => {
    ipfs = new IPFSSimulator();
  });

  it('should delete objects', () => {
    const obj = ipfs.store('To be deleted');
    expect(ipfs.has(obj.cid)).toBe(true);

    const deleted = ipfs.delete(obj.cid);
    expect(deleted).toBe(true);
    expect(ipfs.has(obj.cid)).toBe(false);
  });

  it('should return false when deleting non-existent', () => {
    const deleted = ipfs.delete('QmNonExistent');
    expect(deleted).toBe(false);
  });

  it('should clear all storage', () => {
    ipfs.store('Content 1');
    ipfs.store('Content 2');
    expect(ipfs.list()).toHaveLength(2);

    ipfs.clear();
    expect(ipfs.list()).toHaveLength(0);
  });

  it('should track storage statistics', () => {
    ipfs.store('Public data', { encrypted: false });
    ipfs.store('More public', { encrypted: false });
    ipfs.store('Secret data', { encrypted: true });

    const stats = ipfs.getStats();
    expect(stats.objectCount).toBe(3);
    expect(stats.encryptedCount).toBe(1);
    expect(stats.publicCount).toBe(2);
    expect(stats.totalSize).toBeGreaterThan(0);
  });

  it('should pin and unpin content', () => {
    const obj = ipfs.store('Important content');

    expect(ipfs.isPinned(obj.cid)).toBe(false);

    ipfs.pin(obj.cid);
    expect(ipfs.isPinned(obj.cid)).toBe(true);
  });
});
