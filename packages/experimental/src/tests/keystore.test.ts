/**
 * TEE Keystore Tests
 *
 * Tests for the keystore with production crypto.
 */

import { describe, expect, it } from 'bun:test';
import { keccak256, toBytes } from 'viem';
import { TEEKeystore } from '../tee/keystore.js';

describe('TEEKeystore', () => {
  const testMeasurement = keccak256(toBytes('test-enclave-measurement'));

  it('should create keystore from measurement', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);

    expect(keystore).toBeDefined();
  });

  it('should reject invalid measurement', async () => {
    await expect(TEEKeystore.create('')).rejects.toThrow('Invalid');
    await expect(TEEKeystore.create('short')).rejects.toThrow('Invalid');
  });

  it('should derive consistent keys for same label', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);

    const key1 = await keystore.deriveKey('test-key');
    const key2 = await keystore.deriveKey('test-key');

    // CryptoKey objects should be the same (cached)
    expect(key1).toBe(key2);
  });

  it('should derive different keys for different labels', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);

    const bytes1 = await keystore.getRawKeyBytes('key1');
    const bytes2 = await keystore.getRawKeyBytes('key2');

    expect(bytes1).not.toEqual(bytes2);
  });

  it('should derive different keys for different versions', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);

    const bytes1 = await keystore.getRawKeyBytes('test', 1);
    const bytes2 = await keystore.getRawKeyBytes('test', 2);

    expect(bytes1).not.toEqual(bytes2);
  });

  it('should track key version', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);

    expect(keystore.getKeyVersion('new-key')).toBe(1);

    await keystore.deriveKey('new-key', 1);
    expect(keystore.getKeyVersion('new-key')).toBe(1);

    await keystore.deriveKey('new-key', 3);
    expect(keystore.getKeyVersion('new-key')).toBe(3);
  });

  it('should rotate key correctly', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);

    await keystore.deriveKey('rotate-test', 1);
    const oldBytes = await keystore.getRawKeyBytes('rotate-test', 1);

    const { oldVersion, newVersion } = await keystore.rotateKey('rotate-test');

    expect(oldVersion).toBe(1);
    expect(newVersion).toBe(2);
    expect(keystore.getKeyVersion('rotate-test')).toBe(2);

    const newBytes = await keystore.getRawKeyBytes('rotate-test', 2);
    expect(newBytes).not.toEqual(oldBytes);
  });

  it('should reject empty label', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);

    await expect(keystore.deriveKey('')).rejects.toThrow('empty');
  });

  it('should reject invalid version', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);

    await expect(keystore.deriveKey('test', 0)).rejects.toThrow('>= 1');
    await expect(keystore.deriveKey('test', -1)).rejects.toThrow('>= 1');
  });
});

describe('TEEKeystore Sealing', () => {
  const testMeasurement = keccak256(toBytes('test-enclave-sealing'));

  it('should seal and unseal data correctly', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);
    const data = new TextEncoder().encode('Secret data to seal');

    const sealed = await keystore.seal(data, 'test-label');
    const unsealed = await keystore.unseal(sealed);

    expect(unsealed).toEqual(data);
  });

  it('should seal and unseal JSON correctly', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);
    const data = {
      name: 'Test',
      value: 42,
      nested: { a: 1, b: [1, 2, 3] },
    };

    const sealed = await keystore.sealJSON(data, 'json-label');
    const unsealed = await keystore.unsealJSON(sealed);

    expect(unsealed).toEqual(data);
  });

  it('should include version in sealed data', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);
    const data = new TextEncoder().encode('Test data');

    const sealed = await keystore.seal(data, 'version-test');

    expect(sealed.version).toBe(1);
    expect(sealed.label).toBe('version-test');
  });

  it('should seal with rotated key correctly', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);
    const data = new TextEncoder().encode('Data for rotation test');

    // Seal with v1
    const sealed1 = await keystore.seal(data, 'rotate-seal-test');
    expect(sealed1.version).toBe(1);

    // Rotate key
    await keystore.rotateKey('rotate-seal-test');

    // Seal with v2
    const sealed2 = await keystore.seal(data, 'rotate-seal-test');
    expect(sealed2.version).toBe(2);

    // Both should decrypt correctly
    const unsealed1 = await keystore.unseal(sealed1, 1);
    const unsealed2 = await keystore.unseal(sealed2, 2);

    expect(unsealed1).toEqual(data);
    expect(unsealed2).toEqual(data);

    // Ciphertext should be different
    expect(sealed1.payload.ciphertext).not.toBe(sealed2.payload.ciphertext);
  });

  it('should reject empty data for sealing', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);

    await expect(keystore.seal(new Uint8Array(0), 'test')).rejects.toThrow(
      'empty'
    );
  });

  it('should fail to unseal with wrong version', async () => {
    const keystore = await TEEKeystore.create(testMeasurement);
    const data = new TextEncoder().encode('Test data');

    const sealed = await keystore.seal(data, 'wrong-version-test');

    // Try to unseal with wrong version
    await expect(keystore.unseal(sealed, 99)).rejects.toThrow();
  });
});

describe('TEEKeystore Determinism', () => {
  it('should derive same keys from same measurement', async () => {
    const measurement = keccak256(toBytes('deterministic-test'));

    const keystore1 = await TEEKeystore.create(measurement);
    const keystore2 = await TEEKeystore.create(measurement);

    const bytes1 = await keystore1.getRawKeyBytes('test-key');
    const bytes2 = await keystore2.getRawKeyBytes('test-key');

    expect(bytes1).toEqual(bytes2);
  });

  it('should derive different keys from different measurements', async () => {
    const measurement1 = keccak256(toBytes('measurement-1'));
    const measurement2 = keccak256(toBytes('measurement-2'));

    const keystore1 = await TEEKeystore.create(measurement1);
    const keystore2 = await TEEKeystore.create(measurement2);

    const bytes1 = await keystore1.getRawKeyBytes('same-label');
    const bytes2 = await keystore2.getRawKeyBytes('same-label');

    expect(bytes1).not.toEqual(bytes2);
  });
});
