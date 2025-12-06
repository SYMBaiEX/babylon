/**
 * TEE Enclave Tests
 */

import { afterEach, describe, expect, it } from 'bun:test';
import { keccak256, toBytes } from 'viem';
import { TEEEnclave } from '../tee/enclave.js';

describe('TEEEnclave', () => {
  const testConfig = {
    codeHash: keccak256(toBytes('test-code-v1')) as `0x${string}`,
    instanceId: 'test-instance',
  };

  let enclave: TEEEnclave | null = null;

  afterEach(async () => {
    if (enclave) {
      await enclave.shutdown();
      enclave = null;
    }
  });

  it('should create and boot enclave', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const status = enclave.getStatus();
    expect(status.running).toBe(true);
    expect(status.address).toBeDefined();
    expect(status.attestationValid).toBe(true);
  });

  it('should reject invalid code hash', async () => {
    await expect(
      TEEEnclave.create({
        codeHash: 'invalid' as `0x${string}`,
        instanceId: 'test',
      })
    ).rejects.toThrow('Invalid code hash');
  });

  it('should reject empty instance ID', async () => {
    await expect(
      TEEEnclave.create({
        codeHash: testConfig.codeHash,
        instanceId: '',
      })
    ).rejects.toThrow('Invalid instance ID');
  });

  it('should derive deterministic wallet address', async () => {
    const enclave1 = await TEEEnclave.create(testConfig);
    const enclave2 = await TEEEnclave.create(testConfig);

    expect(enclave1.getOperatorAddress()).toBe(enclave2.getOperatorAddress());

    await enclave1.shutdown();
    await enclave2.shutdown();
    enclave = null;
  });

  it('should derive different addresses for different instances', async () => {
    const enclave1 = await TEEEnclave.create({
      ...testConfig,
      instanceId: 'instance-1',
    });
    const enclave2 = await TEEEnclave.create({
      ...testConfig,
      instanceId: 'instance-2',
    });

    expect(enclave1.getOperatorAddress()).not.toBe(
      enclave2.getOperatorAddress()
    );

    await enclave1.shutdown();
    await enclave2.shutdown();
    enclave = null;
  });

  it('should generate valid attestation', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const attestation = enclave.getAttestation();

    expect(attestation.mrEnclave).toBe(testConfig.codeHash);
    expect(attestation.operatorAddress).toBe(enclave.getOperatorAddress());
    expect(attestation.timestamp).toBeLessThanOrEqual(Date.now());
  });
});

describe('TEEEnclave State', () => {
  const testConfig = {
    codeHash: keccak256(toBytes('state-test-code')) as `0x${string}`,
    instanceId: 'state-test',
  };

  let enclave: TEEEnclave | null = null;

  afterEach(async () => {
    if (enclave) {
      await enclave.shutdown();
      enclave = null;
    }
  });

  it('should encrypt and decrypt state', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const state = {
      game: { score: 100 },
      players: ['alice', 'bob'],
    };

    const { cid, hash } = await enclave.encryptState(state);

    expect(cid).toMatch(/^Qm[a-f0-9]+$/);
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);

    const sealed = enclave.getSealedState();
    expect(sealed).not.toBeNull();

    const decrypted = await enclave.decryptState(sealed!);
    expect(decrypted).toEqual(state);
  });

  it('should update state hash after encryption', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const status1 = enclave.getStatus();
    expect(status1.stateVersion).toBe(0);

    await enclave.encryptState({ value: 1 });

    const status2 = enclave.getStatus();
    expect(status2.stateVersion).toBe(1);
    expect(status2.lastUpdate).toBeGreaterThan(0);
  });

  it('should rotate state encryption key', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const state = { important: 'data' };
    await enclave.encryptState(state);

    const sealed1 = enclave.getSealedState();
    expect(sealed1?.version).toBe(1);

    const { oldVersion, newVersion, newCid } = await enclave.rotateStateKey();

    expect(oldVersion).toBe(1);
    expect(newVersion).toBe(2);
    expect(newCid).toBeDefined();

    const sealed2 = enclave.getSealedState();
    expect(sealed2?.version).toBe(2);

    // Can still decrypt the new state
    const decrypted = await enclave.decryptState(sealed2!);
    expect(decrypted).toEqual(state);
  });

  it('should fail to rotate without state', async () => {
    enclave = await TEEEnclave.create(testConfig);

    await expect(enclave.rotateStateKey()).rejects.toThrow('No state');
  });

  it('should load sealed state', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const state = { loaded: true };
    await enclave.encryptState(state);

    const sealed = enclave.getSealedState();

    // Create new enclave and load state
    const enclave2 = await TEEEnclave.create(testConfig);
    enclave2.loadSealedState(sealed!);

    const decrypted = await enclave2.decryptState(sealed!);
    expect(decrypted).toEqual(state);

    await enclave2.shutdown();
  });
});

describe('TEEEnclave Signing', () => {
  const testConfig = {
    codeHash: keccak256(toBytes('signing-test')) as `0x${string}`,
    instanceId: 'signing-test',
  };

  let enclave: TEEEnclave | null = null;

  afterEach(async () => {
    if (enclave) {
      await enclave.shutdown();
      enclave = null;
    }
  });

  it('should sign messages', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const signed = enclave.signMessage('Hello, World!');

    expect(signed.message).toBe('Hello, World!');
    expect(signed.address).toBe(enclave.getOperatorAddress());
    expect(signed.signature).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('should produce consistent signatures for same message', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const signed1 = enclave.signMessage('Same message');
    const signed2 = enclave.signMessage('Same message');

    expect(signed1.signature).toBe(signed2.signature);
  });

  it('should produce different signatures for different messages', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const signed1 = enclave.signMessage('Message 1');
    const signed2 = enclave.signMessage('Message 2');

    expect(signed1.signature).not.toBe(signed2.signature);
  });

  it('should sign transactions', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const tx = enclave.signTransaction(
      '0x1234567890123456789012345678901234567890',
      '0xabcdef',
      100n
    );

    expect(tx.from).toBe(enclave.getOperatorAddress());
    expect(tx.to).toBe('0x1234567890123456789012345678901234567890');
    expect(tx.data).toBe('0xabcdef');
    expect(tx.value).toBe(100n);
    expect(tx.nonce).toBe(0);
  });

  it('should increment transaction nonce', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const tx1 = enclave.signTransaction(
      '0x1234567890123456789012345678901234567890',
      '0x00'
    );
    const tx2 = enclave.signTransaction(
      '0x1234567890123456789012345678901234567890',
      '0x00'
    );

    expect(tx1.nonce).toBe(0);
    expect(tx2.nonce).toBe(1);
  });

  it('should generate heartbeat', async () => {
    enclave = await TEEEnclave.create(testConfig);

    const heartbeat = enclave.generateHeartbeat();

    expect(heartbeat.timestamp).toBeLessThanOrEqual(Date.now());
    expect(heartbeat.stateHash).toBeNull(); // No state yet
    expect(heartbeat.signature).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('should include state hash in heartbeat after encryption', async () => {
    enclave = await TEEEnclave.create(testConfig);

    await enclave.encryptState({ test: true });
    const heartbeat = enclave.generateHeartbeat();

    expect(heartbeat.stateHash).not.toBeNull();
    expect(heartbeat.stateHash).toMatch(/^0x[a-f0-9]{64}$/);
  });
});

describe('TEEEnclave Lifecycle', () => {
  it('should fail operations after shutdown', async () => {
    const enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('lifecycle-test')) as `0x${string}`,
      instanceId: 'lifecycle',
    });

    await enclave.shutdown();

    const status = enclave.getStatus();
    expect(status.running).toBe(false);

    expect(() => enclave.getOperatorAddress()).toThrow('not running');
    expect(() => enclave.signMessage('test')).toThrow('not running');
  });
});
