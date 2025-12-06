/**
 * Attestation Tests
 *
 * Tests for remote attestation simulation.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { type Address, type Hex, keccak256, toBytes } from 'viem';
import {
  type AttestationQuote,
  formatQuoteForDisplay,
  generateQuote,
  setExpectedMeasurement,
  verifyQuote,
} from '../tee/attestation.js';

describe('Attestation Generation', () => {
  const codeHash = keccak256(toBytes('test-code-v1')) as Hex;
  const operatorAddress =
    '0x1234567890123456789012345678901234567890' as Address;

  it('should generate valid attestation quote', () => {
    setExpectedMeasurement(codeHash);
    const quote = generateQuote(codeHash, operatorAddress);

    expect(quote.mrEnclave).toBe(codeHash);
    expect(quote.operatorAddress).toBe(operatorAddress);
    expect(quote.cpuSignature).toMatch(/^0x[a-f0-9]{64}$/);
    expect(quote.gpuSignature).toMatch(/^0x[a-f0-9]{64}$/);
    expect(quote.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('should include custom report data when provided', () => {
    const customData = keccak256(toBytes('custom-report-data')) as Hex;
    const quote = generateQuote(codeHash, operatorAddress, customData);

    expect(quote.reportData).toBe(customData);
  });

  it('should generate different quotes for different operators', () => {
    const operator1 = '0x1111111111111111111111111111111111111111' as Address;
    const operator2 = '0x2222222222222222222222222222222222222222' as Address;

    const quote1 = generateQuote(codeHash, operator1);
    const quote2 = generateQuote(codeHash, operator2);

    expect(quote1.operatorAddress).toBe(operator1);
    expect(quote2.operatorAddress).toBe(operator2);
    expect(quote1.cpuSignature).not.toBe(quote2.cpuSignature);
  });

  it('should generate different quotes for different code hashes', () => {
    const codeHash1 = keccak256(toBytes('code-v1')) as Hex;
    const codeHash2 = keccak256(toBytes('code-v2')) as Hex;

    setExpectedMeasurement(codeHash1);
    const quote1 = generateQuote(codeHash1, operatorAddress);

    setExpectedMeasurement(codeHash2);
    const quote2 = generateQuote(codeHash2, operatorAddress);

    expect(quote1.mrEnclave).not.toBe(quote2.mrEnclave);
    expect(quote1.cpuSignature).not.toBe(quote2.cpuSignature);
    expect(quote1.gpuSignature).not.toBe(quote2.gpuSignature);
  });
});

describe('Attestation Verification', () => {
  const codeHash = keccak256(toBytes('verified-code')) as Hex;
  const operatorAddress =
    '0x1234567890123456789012345678901234567890' as Address;

  beforeEach(() => {
    setExpectedMeasurement(codeHash);
  });

  it('should verify valid quote', () => {
    const quote = generateQuote(codeHash, operatorAddress);
    const result = verifyQuote(quote);

    expect(result.valid).toBe(true);
    expect(result.codeIntegrity).toBe(true);
    expect(result.hardwareAuthentic).toBe(true);
    expect(result.operatorAddress).toBe(operatorAddress);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject quote with tampered CPU signature', () => {
    const quote = generateQuote(codeHash, operatorAddress);
    const tamperedQuote: AttestationQuote = {
      ...quote,
      cpuSignature: keccak256(toBytes('tampered')) as Hex,
    };

    const result = verifyQuote(tamperedQuote);

    expect(result.valid).toBe(false);
    expect(result.hardwareAuthentic).toBe(false);
    expect(result.errors).toContain('Invalid CPU/TDX signature');
  });

  it('should reject quote with tampered GPU signature', () => {
    const quote = generateQuote(codeHash, operatorAddress);
    const tamperedQuote: AttestationQuote = {
      ...quote,
      gpuSignature: keccak256(toBytes('tampered')) as Hex,
    };

    const result = verifyQuote(tamperedQuote);

    expect(result.valid).toBe(false);
    expect(result.hardwareAuthentic).toBe(false);
    expect(result.errors).toContain('Invalid GPU/CC signature');
  });

  it('should reject quote with wrong code measurement', () => {
    const wrongCodeHash = keccak256(toBytes('malicious-code')) as Hex;
    const quote = generateQuote(wrongCodeHash, operatorAddress);

    const result = verifyQuote(quote);

    expect(result.valid).toBe(false);
    expect(result.codeIntegrity).toBe(false);
    expect(
      result.errors.some((e) => e.includes('Code measurement mismatch'))
    ).toBe(true);
  });

  it('should reject stale quote', () => {
    const quote = generateQuote(codeHash, operatorAddress);
    const staleQuote: AttestationQuote = {
      ...quote,
      timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    };

    const result = verifyQuote(staleQuote);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('stale'))).toBe(true);
  });

  it('should still verify hardware authenticity even if code is wrong', () => {
    const wrongCodeHash = keccak256(toBytes('wrong-code')) as Hex;
    const quote = generateQuote(wrongCodeHash, operatorAddress);

    const result = verifyQuote(quote);

    // Hardware signatures are still valid, just wrong code
    expect(result.hardwareAuthentic).toBe(true);
    expect(result.codeIntegrity).toBe(false);
  });
});

describe('Attestation Display', () => {
  it('should format quote for display', () => {
    const codeHash = keccak256(toBytes('display-test')) as Hex;
    const operatorAddress =
      '0x1234567890123456789012345678901234567890' as Address;

    setExpectedMeasurement(codeHash);
    const quote = generateQuote(codeHash, operatorAddress);
    const display = formatQuoteForDisplay(quote);

    expect(display).toContain('TEE ATTESTATION REPORT');
    expect(display).toContain(quote.mrEnclave);
    expect(display).toContain(quote.operatorAddress);
    expect(display).toContain(quote.cpuSignature);
    expect(display).toContain(quote.gpuSignature);
  });
});
