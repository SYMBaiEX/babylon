/**
 * Crypto Module Tests
 *
 * Tests for production-quality cryptographic primitives.
 */

import { describe, expect, it } from 'bun:test';
import {
  bytesToHex,
  constantTimeEqual,
  decrypt,
  decryptString,
  deriveKey,
  deriveKeyWithLabel,
  encrypt,
  encryptString,
  hexToBytes,
  importKey,
  randomBytes,
} from '../crypto/index.js';

describe('AES-GCM Encryption', () => {
  it('should encrypt and decrypt data correctly', async () => {
    const keyBytes = randomBytes(32);
    const key = await importKey(keyBytes);
    const plaintext = new TextEncoder().encode('Hello, World!');

    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted, key);

    expect(decrypted).toEqual(plaintext);
  });

  it('should encrypt and decrypt strings correctly', async () => {
    const keyBytes = randomBytes(32);
    const key = await importKey(keyBytes);
    const message = 'This is a test message with unicode: 你好世界';

    const encrypted = await encryptString(message, key);
    const decrypted = await decryptString(encrypted, key);

    expect(decrypted).toBe(message);
  });

  it('should produce different ciphertext for same plaintext (random IV)', async () => {
    const keyBytes = randomBytes(32);
    const key = await importKey(keyBytes);
    const plaintext = new TextEncoder().encode('Same message');

    const encrypted1 = await encrypt(plaintext, key);
    const encrypted2 = await encrypt(plaintext, key);

    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });

  it('should fail to decrypt with wrong key', async () => {
    const key1 = await importKey(randomBytes(32));
    const key2 = await importKey(randomBytes(32));
    const plaintext = new TextEncoder().encode('Secret data');

    const encrypted = await encrypt(plaintext, key1);

    await expect(decrypt(encrypted, key2)).rejects.toThrow();
  });

  it('should fail to decrypt tampered ciphertext', async () => {
    const key = await importKey(randomBytes(32));
    const plaintext = new TextEncoder().encode('Important data');

    const encrypted = await encrypt(plaintext, key);

    // Tamper with ciphertext
    const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
    if (tamperedCiphertext[10] !== undefined) {
      tamperedCiphertext[10] ^= 0xff;
    }
    encrypted.ciphertext = tamperedCiphertext.toString('base64');

    await expect(decrypt(encrypted, key)).rejects.toThrow();
  });

  it('should reject invalid key length', async () => {
    const shortKey = randomBytes(16); // AES-128, but we require AES-256

    await expect(importKey(shortKey)).rejects.toThrow('Invalid key length');
  });
});

describe('HKDF Key Derivation', () => {
  it('should derive consistent keys from same input', async () => {
    const ikm = randomBytes(32);

    const key1 = await deriveKey({
      ikm,
      info: new TextEncoder().encode('test'),
      length: 32,
    });

    const key2 = await deriveKey({
      ikm,
      info: new TextEncoder().encode('test'),
      length: 32,
    });

    expect(key1).toEqual(key2);
  });

  it('should derive different keys for different info', async () => {
    const ikm = randomBytes(32);

    const key1 = await deriveKey({
      ikm,
      info: new TextEncoder().encode('purpose1'),
      length: 32,
    });

    const key2 = await deriveKey({
      ikm,
      info: new TextEncoder().encode('purpose2'),
      length: 32,
    });

    expect(key1).not.toEqual(key2);
  });

  it('should derive different keys for different salt', async () => {
    const ikm = randomBytes(32);
    const info = new TextEncoder().encode('test');

    const key1 = await deriveKey({
      ikm,
      salt: randomBytes(32),
      info,
      length: 32,
    });

    const key2 = await deriveKey({
      ikm,
      salt: randomBytes(32),
      info,
      length: 32,
    });

    expect(key1).not.toEqual(key2);
  });

  it('should derive keys of requested length', async () => {
    const ikm = randomBytes(32);
    const info = new TextEncoder().encode('test');

    const key16 = await deriveKey({ ikm, info, length: 16 });
    const key32 = await deriveKey({ ikm, info, length: 32 });
    const key64 = await deriveKey({ ikm, info, length: 64 });

    expect(key16.length).toBe(16);
    expect(key32.length).toBe(32);
    expect(key64.length).toBe(64);
  });

  it('should derive key with label helper', async () => {
    const masterKey = randomBytes(32);

    const key1 = await deriveKeyWithLabel(masterKey, 'wallet');
    const key2 = await deriveKeyWithLabel(masterKey, 'encryption');

    expect(key1.length).toBe(32);
    expect(key2.length).toBe(32);
    expect(key1).not.toEqual(key2);
  });

  it('should reject empty IKM', async () => {
    await expect(
      deriveKey({
        ikm: new Uint8Array(0),
        info: new TextEncoder().encode('test'),
        length: 32,
      })
    ).rejects.toThrow('empty');
  });
});

describe('Utility Functions', () => {
  it('should generate random bytes of correct length', () => {
    const bytes16 = randomBytes(16);
    const bytes32 = randomBytes(32);
    const bytes64 = randomBytes(64);

    expect(bytes16.length).toBe(16);
    expect(bytes32.length).toBe(32);
    expect(bytes64.length).toBe(64);
  });

  it('should generate different random bytes each time', () => {
    const bytes1 = randomBytes(32);
    const bytes2 = randomBytes(32);

    expect(bytes1).not.toEqual(bytes2);
  });

  it('should reject non-positive length for randomBytes', () => {
    expect(() => randomBytes(0)).toThrow('positive');
    expect(() => randomBytes(-1)).toThrow('positive');
  });

  it('should compare equal arrays correctly', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 4, 5]);

    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('should compare unequal arrays correctly', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 4, 6]);

    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('should compare different length arrays correctly', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3, 4]);

    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('should convert bytes to hex correctly', () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0xf0, 0xff]);
    expect(bytesToHex(bytes)).toBe('000ff0ff');
  });

  it('should convert hex to bytes correctly', () => {
    const hex = '000ff0ff';
    const bytes = hexToBytes(hex);

    expect(bytes).toEqual(new Uint8Array([0x00, 0x0f, 0xf0, 0xff]));
  });

  it('should handle 0x prefix in hex', () => {
    const hex = '0x000ff0ff';
    const bytes = hexToBytes(hex);

    expect(bytes).toEqual(new Uint8Array([0x00, 0x0f, 0xf0, 0xff]));
  });

  it('should reject odd-length hex strings', () => {
    expect(() => hexToBytes('0f0')).toThrow('even length');
  });
});
