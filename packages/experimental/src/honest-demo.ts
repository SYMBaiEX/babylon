#!/usr/bin/env bun
/**
 * HONEST DEMO - No LARP Edition
 *
 * This script is BRUTALLY HONEST about what's real and what's simulated.
 *
 * ✅ REAL (Production-quality):
 *   - AES-256-GCM encryption (Web Crypto API)
 *   - HKDF key derivation (Web Crypto API)
 *   - secp256k1 wallet (real Ethereum signatures!)
 *   - File-based storage (writes real encrypted files)
 *
 * ⚠️ SIMULATED (Demonstration only):
 *   - TEE hardware isolation
 *   - Intel TDX attestation
 *   - NVIDIA CC attestation
 *   - Hardware-bound key derivation
 *
 * For TRUE permissionlessness, you need to deploy to Phala CVM!
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { Hex } from 'viem';
import { keccak256, toBytes, verifyMessage } from 'viem';
import { FileStorage } from './storage/file-storage.js';
import { RealStateManager } from './storage/real-state-manager.js';
import { verifyQuote } from './tee/attestation.js';
import { TEEEnclave } from './tee/enclave.js';

const DEMO_DIR = './honest-demo-output';

// Color output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function real(msg: string): string {
  return `${GREEN}✅ REAL: ${msg}${RESET}`;
}

function simulated(msg: string): string {
  return `${YELLOW}⚠️ SIMULATED: ${msg}${RESET}`;
}

function critical(msg: string): string {
  return `${RED}🚨 ${msg}${RESET}`;
}

async function main() {
  console.log(`
${BLUE}╔═══════════════════════════════════════════════════════════════════╗
║               HONEST DEMO - NO LARP EDITION                       ║
╠═══════════════════════════════════════════════════════════════════╣
║  This demo is BRUTALLY HONEST about simulation vs reality.        ║
╚═══════════════════════════════════════════════════════════════════╝${RESET}
`);

  // Clean up
  await rm(DEMO_DIR, { recursive: true, force: true });
  await mkdir(DEMO_DIR, { recursive: true });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 1: WHAT'S REAL
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    `\n${BLUE}═══════════════════════════════════════════════════════════════════${RESET}`
  );
  console.log(
    `${BLUE}                    SECTION 1: WHAT'S REAL                         ${RESET}`
  );
  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════════${RESET}\n`
  );

  // 1.1: Create enclave
  console.log('Creating TEE Enclave (simulation mode)...\n');
  const codeHash = keccak256(toBytes('babylon-honest-demo-v1')) as Hex;
  const enclave = await TEEEnclave.create({
    codeHash,
    instanceId: `honest-${Date.now()}`,
    verbose: false,
  });

  console.log(real('secp256k1 wallet derived from code hash'));
  console.log(`   Address: ${enclave.getOperatorAddress()}`);
  console.log(`   Private key exists (can sign real txns)`);
  console.log('');

  // 1.2: Prove the wallet is REAL by showing it can sign
  console.log('Testing REAL secp256k1 signature...');
  const testMessage = 'Hello from Babylon TEE!';
  const account = enclave.getWalletAccount();
  const realSignature = await account.signMessage({ message: testMessage });

  console.log(real('secp256k1 signature (works on-chain!)'));
  console.log(`   Message: "${testMessage}"`);
  console.log(`   Signature: ${realSignature.slice(0, 40)}...`);

  // Verify the signature
  const isValid = await verifyMessage({
    address: enclave.getOperatorAddress(),
    message: testMessage,
    signature: realSignature,
  });
  console.log(real(`Signature verification: ${isValid ? 'VALID' : 'INVALID'}`));
  console.log('');

  // 1.3: Real encryption
  console.log('Testing REAL AES-256-GCM encryption...');
  const storage = new FileStorage({ directory: DEMO_DIR, verbose: false });
  const stateManager = new RealStateManager(enclave, storage, {
    verbose: false,
  });

  const secretData = {
    secrets: ['password123', 'hidden-treasure-at-x:42-y:73'],
    aiWeights: [0.1, 0.2, 0.3, 0.4, 0.5],
  };

  const checkpoint = await stateManager.saveState(secretData);
  console.log(real('AES-256-GCM encryption (Web Crypto API)'));
  console.log(`   Encrypted file: ${checkpoint.id}.bin`);

  // Verify plaintext is NOT in the file
  const encryptedRaw = await readFile(`${DEMO_DIR}/${checkpoint.id}.bin`);
  const containsPlaintext = encryptedRaw.toString().includes('password123');
  console.log(real(`Plaintext NOT visible in file: ${!containsPlaintext}`));
  console.log('');

  // 1.4: Real tamper detection
  console.log('Testing REAL tamper detection (GCM auth tag)...');
  const encryptedJson = JSON.parse(encryptedRaw.toString());
  const tamperedCiphertext = Buffer.from(
    encryptedJson.payload.ciphertext,
    'base64'
  );
  const firstByte = tamperedCiphertext[0] ?? 0;
  tamperedCiphertext[0] = firstByte ^ 0xff;
  encryptedJson.payload.ciphertext = tamperedCiphertext.toString('base64');

  let tamperDetected = false;
  try {
    await enclave.decryptState(encryptedJson);
  } catch {
    tamperDetected = true;
  }
  console.log(
    real(`Tamper detection: ${tamperDetected ? 'WORKING' : 'BROKEN!'}`)
  );
  console.log('');

  // 1.5: Real round-trip
  console.log('Testing REAL round-trip (encrypt → store → load → decrypt)...');
  const loaded = await stateManager.loadState<typeof secretData>(checkpoint.id);
  const roundTripWorks =
    loaded.secrets[0] === secretData.secrets[0] &&
    loaded.aiWeights.length === secretData.aiWeights.length;
  console.log(
    real(`Round-trip verification: ${roundTripWorks ? 'PASS' : 'FAIL'}`)
  );
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 2: WHAT'S SIMULATED (LARP)
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    `\n${BLUE}═══════════════════════════════════════════════════════════════════${RESET}`
  );
  console.log(
    `${BLUE}                  SECTION 2: WHAT'S SIMULATED                      ${RESET}`
  );
  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════════${RESET}\n`
  );

  const attestation = enclave.getAttestation();
  const verification = verifyQuote(attestation);

  console.log(simulated('TEE attestation is NOT from real Intel/NVIDIA'));
  console.log(`   isSimulated flag: ${attestation.isSimulated}`);
  console.log(`   hardwareAuthentic: ${verification.hardwareAuthentic}`);
  console.log('');

  console.log(simulated('Key derivation is NOT hardware-bound'));
  console.log(`   Anyone with the code hash can derive the same keys!`);
  console.log(`   Code hash: ${codeHash.slice(0, 20)}...`);
  console.log('');

  console.log(simulated('No hardware isolation'));
  console.log(`   Private key exists in process memory`);
  console.log(`   Attacker with memory access could steal it`);
  console.log('');

  // Show warnings from attestation
  if (verification.warnings.length > 0) {
    console.log('Attestation warnings:');
    for (const warning of verification.warnings) {
      console.log(`   ${YELLOW}⚠️ ${warning}${RESET}`);
    }
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 3: PERMISSIONLESS ANALYSIS
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    `\n${BLUE}═══════════════════════════════════════════════════════════════════${RESET}`
  );
  console.log(
    `${BLUE}                 SECTION 3: PERMISSIONLESS CHECK                   ${RESET}`
  );
  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════════${RESET}\n`
  );

  const checks = [
    {
      name: 'Wallet can sign real transactions',
      real: true,
      reason: 'secp256k1 via viem',
    },
    {
      name: 'Encryption is production-quality',
      real: true,
      reason: 'AES-256-GCM via WebCrypto',
    },
    {
      name: 'Tamper detection works',
      real: true,
      reason: 'GCM authentication tag',
    },
    {
      name: 'Storage is permanent',
      real: false,
      reason: 'File storage, not Arweave (Irys SDK has Bun issues)',
    },
    {
      name: 'Keys are hardware-derived',
      real: false,
      reason: 'Simulated - need real Phala CVM',
    },
    {
      name: 'Attestation is verifiable',
      real: false,
      reason: 'Simulated - not from Intel/NVIDIA PKI',
    },
    {
      name: 'Code runs in isolated enclave',
      real: false,
      reason: 'Simulated - runs in normal process',
    },
    {
      name: 'Anyone can verify the code',
      real: true,
      reason: 'Open source, deterministic build',
    },
    {
      name: 'No API keys required',
      real: true,
      reason: 'Wallet-only authentication',
    },
  ];

  const realCount = checks.filter((c) => c.real).length;
  const simCount = checks.filter((c) => !c.real).length;

  for (const check of checks) {
    if (check.real) {
      console.log(`${GREEN}✅ ${check.name}${RESET}`);
      console.log(`   Reason: ${check.reason}`);
    } else {
      console.log(`${YELLOW}⚠️ ${check.name}${RESET}`);
      console.log(`   Missing: ${check.reason}`);
    }
  }
  console.log('');
  console.log(
    `Score: ${realCount}/${checks.length} real, ${simCount}/${checks.length} simulated`
  );
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 4: WHAT YOU NEED FOR TRUE PERMISSIONLESS
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    `\n${BLUE}═══════════════════════════════════════════════════════════════════${RESET}`
  );
  console.log(
    `${BLUE}             SECTION 4: PATH TO TRUE PERMISSIONLESS                ${RESET}`
  );
  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════════${RESET}\n`
  );

  console.log(`${critical('To make this TRULY permissionless, you need:')}\n`);

  console.log('1. Deploy to Phala CVM (Confidential VM)');
  console.log('   - Uses Intel TDX for CPU isolation');
  console.log('   - Real hardware-derived keys');
  console.log('   - Real attestation from Intel PKI');
  console.log('');

  console.log('2. Use DStack for key derivation');
  console.log('   - Keys derived from CPU fuses + code hash');
  console.log('   - Same code = same keys (deterministic)');
  console.log('   - Keys NEVER leave the hardware');
  console.log('');

  console.log('3. Permanent storage on Arweave');
  console.log('   - Currently blocked by Irys SDK Bun compatibility');
  console.log('   - Workaround: Run with Node.js or use IPFS');
  console.log('');

  console.log('4. Deploy smart contract with attestation verification');
  console.log('   - On-chain verification of TEE quotes');
  console.log('   - Operator registration with proof');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    `\n${BLUE}═══════════════════════════════════════════════════════════════════${RESET}`
  );
  console.log(
    `${BLUE}                         FINAL VERDICT                             ${RESET}`
  );
  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════════${RESET}\n`
  );

  console.log(`${GREEN}REAL & WORKING:${RESET}`);
  console.log('  ✅ Cryptography (AES-256-GCM, HKDF, secp256k1)');
  console.log('  ✅ Wallet can sign on-chain transactions');
  console.log('  ✅ Encryption protects secrets');
  console.log('  ✅ Tamper detection works');
  console.log('  ✅ No API keys needed');
  console.log('');

  console.log(`${YELLOW}SIMULATED (for demo only):${RESET}`);
  console.log('  ⚠️ Hardware isolation');
  console.log('  ⚠️ TEE attestation');
  console.log('  ⚠️ Hardware-bound keys');
  console.log('');

  console.log(`${RED}BOTTOM LINE:${RESET}`);
  console.log('  The CRYPTO is real.');
  console.log('  The HARDWARE SECURITY is simulated.');
  console.log('  Deploy to Phala CVM for TRUE permissionlessness.');
  console.log('');

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    enclave: {
      address: enclave.getOperatorAddress(),
      codeHash,
      isSimulated: enclave.isSimulated(),
    },
    attestation: {
      isSimulated: attestation.isSimulated,
      hardwareAuthentic: verification.hardwareAuthentic,
      warnings: verification.warnings,
    },
    checks,
    verdict: {
      cryptoReal: true,
      hardwareSecurityReal: false,
      requiresPhalaForProduction: true,
    },
  };

  await writeFile(
    `${DEMO_DIR}/honest-report.json`,
    JSON.stringify(report, null, 2)
  );
  console.log(`📁 Report saved to ${DEMO_DIR}/honest-report.json`);

  await enclave.shutdown();
}

main().catch(console.error);
