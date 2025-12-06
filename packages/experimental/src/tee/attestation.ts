/**
 * Simulated TEE Attestation
 *
 * In a real Phala TEE with Intel TDX + NVIDIA H200:
 * - CPU produces a TDX quote (signed measurement of enclave code)
 * - GPU produces a CC attestation (proves GPU memory is encrypted)
 * - Combined quote proves both CPU and GPU are genuine and running expected code
 *
 * This simulation demonstrates the concept.
 */

import { type Address, type Hex, keccak256, toBytes } from 'viem';

export interface AttestationQuote {
  // Measurement of the code running in the enclave
  mrEnclave: Hex;

  // Report data (can include operator address, git commit, etc.)
  reportData: Hex;

  // Simulated signature from "Intel" + "NVIDIA"
  cpuSignature: Hex;
  gpuSignature: Hex;

  // Timestamp when quote was generated
  timestamp: number;

  // TEE operator's Ethereum address (embedded in quote)
  operatorAddress: Address;
}

export interface VerificationResult {
  valid: boolean;
  codeIntegrity: boolean;
  hardwareAuthentic: boolean;
  operatorAddress: Address;
  errors: string[];
}

// Simulated "Intel" signing key (in reality, this is Intel's PKI)
const INTEL_ROOT_KEY = keccak256(toBytes('INTEL_TDX_ROOT_KEY_SIMULATED'));

// Simulated "NVIDIA" signing key
const NVIDIA_ROOT_KEY = keccak256(toBytes('NVIDIA_CC_ROOT_KEY_SIMULATED'));

// Expected code measurement (hash of the game code)
let EXPECTED_MEASUREMENT: Hex | null = null;

/**
 * Set the expected code measurement for verification
 * In production: this would be the known-good hash of the game container
 */
export function setExpectedMeasurement(measurement: Hex): void {
  EXPECTED_MEASUREMENT = measurement;
  console.log(
    `[Attestation] Expected measurement set: ${measurement.slice(0, 16)}...`
  );
}

/**
 * Generate an attestation quote
 * In real TEE: this calls Intel's attestation API and NVIDIA's CC attestation
 */
export function generateQuote(
  codeHash: Hex,
  operatorAddress: Address,
  customReportData?: Hex
): AttestationQuote {
  const timestamp = Date.now();

  // Report data includes operator address and any custom data
  const reportData =
    customReportData ?? keccak256(toBytes(`${operatorAddress}:${timestamp}`));

  // Generate CPU signature (simulated Intel TDX quote)
  const cpuQuoteMaterial = new Uint8Array([
    ...toBytes(codeHash),
    ...toBytes(reportData),
    ...toBytes(INTEL_ROOT_KEY),
  ]);
  const cpuSignature = keccak256(cpuQuoteMaterial);

  // Generate GPU signature (simulated NVIDIA CC attestation)
  const gpuQuoteMaterial = new Uint8Array([
    ...toBytes(codeHash),
    ...toBytes(reportData),
    ...toBytes(NVIDIA_ROOT_KEY),
  ]);
  const gpuSignature = keccak256(gpuQuoteMaterial);

  const quote: AttestationQuote = {
    mrEnclave: codeHash,
    reportData,
    cpuSignature,
    gpuSignature,
    timestamp,
    operatorAddress,
  };

  console.log(`[Attestation] Generated quote for ${operatorAddress}`);
  return quote;
}

/**
 * Verify an attestation quote
 * In real system: verifies against Intel/NVIDIA PKI roots
 */
export function verifyQuote(quote: AttestationQuote): VerificationResult {
  const errors: string[] = [];

  // Verify CPU signature
  const expectedCpuSig = keccak256(
    new Uint8Array([
      ...toBytes(quote.mrEnclave),
      ...toBytes(quote.reportData),
      ...toBytes(INTEL_ROOT_KEY),
    ])
  );
  const cpuValid = expectedCpuSig === quote.cpuSignature;
  if (!cpuValid) {
    errors.push('Invalid CPU/TDX signature');
  }

  // Verify GPU signature
  const expectedGpuSig = keccak256(
    new Uint8Array([
      ...toBytes(quote.mrEnclave),
      ...toBytes(quote.reportData),
      ...toBytes(NVIDIA_ROOT_KEY),
    ])
  );
  const gpuValid = expectedGpuSig === quote.gpuSignature;
  if (!gpuValid) {
    errors.push('Invalid GPU/CC signature');
  }

  // Check code integrity against expected measurement
  let codeIntegrity = true;
  if (EXPECTED_MEASUREMENT && quote.mrEnclave !== EXPECTED_MEASUREMENT) {
    codeIntegrity = false;
    errors.push(
      `Code measurement mismatch: expected ${EXPECTED_MEASUREMENT.slice(0, 16)}..., got ${quote.mrEnclave.slice(0, 16)}...`
    );
  }

  // Check quote freshness (must be within 1 hour)
  const maxAge = 60 * 60 * 1000; // 1 hour
  if (Date.now() - quote.timestamp > maxAge) {
    errors.push('Attestation quote is stale (> 1 hour old)');
  }

  return {
    valid: cpuValid && gpuValid && codeIntegrity && errors.length === 0,
    codeIntegrity,
    hardwareAuthentic: cpuValid && gpuValid,
    operatorAddress: quote.operatorAddress,
    errors,
  };
}

/**
 * Format quote for display (e.g., Trust Center page)
 */
export function formatQuoteForDisplay(quote: AttestationQuote): string {
  return `
╔══════════════════════════════════════════════════════════════╗
║                    TEE ATTESTATION REPORT                      ║
╠══════════════════════════════════════════════════════════════╣
║ Code Measurement (mrEnclave):                                  ║
║   ${quote.mrEnclave}
║                                                                ║
║ Operator Address:                                              ║
║   ${quote.operatorAddress}
║                                                                ║
║ Report Data:                                                   ║
║   ${quote.reportData}
║                                                                ║
║ CPU (Intel TDX) Signature:                                     ║
║   ${quote.cpuSignature}
║                                                                ║
║ GPU (NVIDIA CC) Signature:                                     ║
║   ${quote.gpuSignature}
║                                                                ║
║ Timestamp: ${new Date(quote.timestamp).toISOString()}
╚══════════════════════════════════════════════════════════════╝`;
}
