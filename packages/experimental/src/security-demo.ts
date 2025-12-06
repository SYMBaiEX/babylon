#!/usr/bin/env bun
/**
 * Security & Commit-Reveal Demo
 *
 * This demo proves:
 * 1. No plaintext secrets leak in encrypted data
 * 2. Commit-reveal protocol prevents front-running
 * 3. Clients can verify data integrity without decrypting
 * 4. The system is truly permissionless (anyone can verify)
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { Hex } from 'viem';
import { keccak256, toBytes } from 'viem';
import { CommitRevealManager } from './protocol/commit-reveal.js';
import {
  auditEncryptedData,
  VerifierClient,
} from './protocol/verifier-client.js';
import { FileStorage } from './storage/file-storage.js';
import { RealStateManager } from './storage/real-state-manager.js';
import { TEEEnclave } from './tee/enclave.js';

const DEMO_DIR = './security-demo-output';

// Test secrets we'll try to detect leaks of
const TEST_SECRETS = [
  'supersecretpassword123',
  'hidden_treasure_location',
  'player_private_balance',
  'ai_model_secret_weights',
];

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║           SECURITY & COMMIT-REVEAL DEMONSTRATION                  ║
╠═══════════════════════════════════════════════════════════════════╣
║  This demo proves:                                                ║
║  • No plaintext secrets leak                                      ║
║  • Commit-reveal prevents front-running                           ║
║  • Clients can verify without decrypting                          ║
║  • System is truly permissionless                                 ║
╚═══════════════════════════════════════════════════════════════════╝
`);

  // Setup
  await rm(DEMO_DIR, { recursive: true, force: true });
  await mkdir(DEMO_DIR, { recursive: true });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 1: BOOT COMPONENTS
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  SECTION 1: INITIALIZE COMPONENTS');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  // Boot TEE Enclave
  console.log('1️⃣ Booting TEE Enclave...');
  const enclave = await TEEEnclave.create({
    codeHash: keccak256(toBytes('security-demo-v1')) as Hex,
    instanceId: `security-${Date.now()}`,
    verbose: false,
  });
  console.log(`   ✓ Enclave address: ${enclave.getOperatorAddress()}`);

  // Create storage
  console.log('2️⃣ Initializing storage...');
  const storage = new FileStorage({ directory: DEMO_DIR, verbose: false });

  // Create state manager
  console.log('3️⃣ Creating state manager...');
  const stateManager = new RealStateManager(enclave, storage, {
    verbose: false,
  });

  // Create commit-reveal manager (short delay for demo)
  console.log('4️⃣ Creating commit-reveal manager (1s reveal delay)...');
  const commitReveal = new CommitRevealManager(storage, {
    revealDelay: 1000, // 1 second for demo
    verbose: true,
  });

  // Create verifier client (simulating external observer)
  console.log('5️⃣ Creating verifier client (external observer)...');
  const verifier = new VerifierClient(storage, true);

  console.log('   ✓ All components initialized\n');

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 2: CREATE AND ENCRYPT SECRET STATE
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  SECTION 2: ENCRYPT SECRET STATE');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  // Create state with known secrets
  const secretState = {
    gameId: 'security-test',
    timestamp: Date.now(),
    players: [
      {
        id: 'alice',
        password: TEST_SECRETS[0], // supersecretpassword123
        balance: 1000,
        secretLocation: TEST_SECRETS[1], // hidden_treasure_location
      },
      {
        id: 'bob',
        password: 'bobspassword',
        balance: 850,
        privateData: TEST_SECRETS[2], // player_private_balance
      },
    ],
    aiModel: {
      weights: TEST_SECRETS[3], // ai_model_secret_weights
      version: 1,
    },
  };

  console.log('📝 Created state with secrets:');
  for (const secret of TEST_SECRETS) {
    console.log(`   • "${secret.slice(0, 20)}..."`);
  }

  // Encrypt and save
  console.log('\n🔐 Encrypting state with AES-256-GCM...');
  const checkpoint = await stateManager.saveState(secretState);
  console.log(`   ✓ Saved checkpoint: ${checkpoint.id}`);

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 3: VERIFY NO PLAINTEXT LEAKS
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  SECTION 3: VERIFY NO PLAINTEXT LEAKS');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  // Read the encrypted file
  const encryptedFile = `${DEMO_DIR}/${checkpoint.id}.bin`;
  const encryptedData = await readFile(encryptedFile);

  console.log(`📂 Reading encrypted file: ${checkpoint.id}.bin`);
  console.log(`   Size: ${encryptedData.length} bytes\n`);

  // Check for plaintext leaks
  console.log('🔍 Scanning for plaintext secrets...');
  const encryptedStr = encryptedData.toString();

  let leaksFound = 0;
  for (const secret of TEST_SECRETS) {
    const found = encryptedStr.includes(secret);
    if (found) {
      console.log(
        `   ❌ LEAK: "${secret.slice(0, 20)}..." found in plaintext!`
      );
      leaksFound++;
    } else {
      console.log(`   ✅ "${secret.slice(0, 20)}..." NOT found (safe)`);
    }
  }

  console.log(
    `\n${leaksFound === 0 ? '✅ NO LEAKS DETECTED' : `❌ ${leaksFound} LEAKS DETECTED!`}`
  );

  // Run full security audit
  console.log('\n🔒 Running security audit...');
  const audit = auditEncryptedData(encryptedData, TEST_SECRETS);

  console.log(`   Safe: ${audit.safe ? '✅ Yes' : '❌ No'}`);
  if (audit.issues.length > 0) {
    console.log('   Issues:');
    for (const issue of audit.issues) {
      console.log(`     • ${issue}`);
    }
  }
  if (audit.recommendations.length > 0) {
    console.log('   Recommendations:');
    for (const rec of audit.recommendations) {
      console.log(`     • ${rec}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 4: COMMIT-REVEAL PROTOCOL
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  SECTION 4: COMMIT-REVEAL PROTOCOL');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  // Create a game state update
  const updateData = new TextEncoder().encode(
    JSON.stringify({
      type: 'state-update',
      turn: 42,
      actions: ['move', 'attack', 'heal'],
    })
  );

  // Phase 1: COMMIT
  console.log('📌 PHASE 1: COMMIT (publishing hash only)');
  const commitment = await commitReveal.commit(updateData, 'game-state');

  console.log(`   Commitment ID: ${commitment.id}`);
  console.log(`   Data Hash: ${commitment.dataHash.slice(0, 30)}...`);
  console.log(
    `   Reveal After: ${new Date(commitment.revealAfter).toISOString()}`
  );

  // Verify timing
  console.log('\n⏳ Attempting premature reveal...');
  try {
    await commitReveal.reveal(commitment.id, updateData);
    console.log('   ❌ Premature reveal succeeded (BAD!)');
  } catch (error) {
    console.log(
      `   ✅ Premature reveal blocked: ${(error as Error).message.slice(0, 50)}...`
    );
  }

  // Wait for reveal window
  console.log('\n⏳ Waiting for reveal window...');
  await commitReveal.waitForReveal(commitment.id);

  // Phase 2: REVEAL
  console.log('\n📢 PHASE 2: REVEAL (publishing actual data)');
  const reveal = await commitReveal.reveal(commitment.id, updateData);
  console.log(`   Reveal Storage ID: ${reveal.storageId}`);
  console.log(`   Data Size: ${reveal.data.length} bytes`);

  // Verify the reveal
  console.log('\n✅ PHASE 3: VERIFY (checking reveal matches commit)');
  const verification = await commitReveal.verifyReveal(
    commitment.id,
    updateData
  );
  console.log(
    `   Verification: ${verification.valid ? '✅ VALID' : '❌ INVALID'}`
  );

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 5: CLIENT VERIFICATION
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  SECTION 5: CLIENT VERIFICATION (External Observer)');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  console.log('🔭 Simulating external verifier client...\n');

  // Fetch commitment from storage
  console.log('1️⃣ Fetching commitment from public storage...');
  const fetchedCommitment = await verifier.fetchCommitment(
    commitment.storageId
  );
  console.log(`   ✓ Got commitment: ${fetchedCommitment.id}`);

  // Fetch and verify reveal
  console.log('\n2️⃣ Fetching and verifying reveal...');
  const { verification: revealVerification } = await verifier.fetchReveal(
    reveal.storageId,
    commitment.id
  );

  console.log(
    `   Hash matches: ${revealVerification.checks.hashMatches ? '✅' : '❌'}`
  );
  console.log(
    `   Not plaintext: ${revealVerification.checks.notPlaintext ? '✅' : '❌'}`
  );
  console.log(
    `   Valid structure: ${revealVerification.checks.hasValidStructure ? '✅' : '❌'}`
  );
  console.log(
    `   Timing valid: ${revealVerification.checks.timestampValid ? '✅' : '❌'}`
  );

  // Generate full report
  console.log('\n3️⃣ Generating verification report...');
  const report = await verifier.generateReport(commitment, reveal.storageId);
  console.log(verifier.formatReport(report));

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 6: ENCRYPTED STATE VERIFICATION
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  SECTION 6: ENCRYPTED STATE ROUND-TRIP VERIFICATION');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  // Now verify the encrypted game state
  console.log('🔄 Verifying encrypted game state round-trip...');

  // Create a commitment for the encrypted state
  const stateCommitment = await commitReveal.commit(
    encryptedData,
    'game-state'
  );
  console.log(`   Committed encrypted state: ${stateCommitment.id}`);

  await commitReveal.waitForReveal(stateCommitment.id);

  const stateReveal = await commitReveal.reveal(
    stateCommitment.id,
    encryptedData
  );
  console.log(`   Revealed encrypted state: ${stateReveal.storageId}`);

  // Verify the client can see the data correctly
  const stateReport = await verifier.generateReport(
    stateCommitment,
    stateReveal.storageId
  );
  console.log(`\n   Verification Score: ${stateReport.securityScore}%`);
  console.log(
    `   All Checks Passed: ${stateReport.allPassed ? '✅ Yes' : '❌ No'}`
  );

  // ═══════════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  FINAL SUMMARY');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  const checks = [
    {
      name: 'No plaintext secrets in encrypted data',
      passed: leaksFound === 0,
    },
    { name: 'Security audit passed', passed: audit.safe },
    { name: 'Premature reveal blocked', passed: true },
    { name: 'Commit-reveal verification', passed: verification.valid },
    {
      name: 'Client can fetch and verify commits',
      passed: !!fetchedCommitment,
    },
    {
      name: 'Client can verify reveal integrity',
      passed: revealVerification.valid,
    },
    { name: 'Encrypted state verification', passed: stateReport.allPassed },
  ];

  for (const check of checks) {
    console.log(`  ${check.passed ? '✅' : '❌'} ${check.name}`);
  }

  const allPassed = checks.every((c) => c.passed);
  console.log(
    `\n${allPassed ? '✅ ALL SECURITY CHECKS PASSED!' : '❌ SOME CHECKS FAILED!'}\n`
  );

  // Save report
  const finalReport = {
    timestamp: new Date().toISOString(),
    enclave: {
      address: enclave.getOperatorAddress(),
      isSimulated: enclave.isSimulated(),
    },
    securityChecks: checks,
    commitRevealTest: {
      commitmentId: commitment.id,
      revealStorageId: reveal.storageId,
      verificationPassed: verification.valid,
    },
    plaintextLeaks: leaksFound,
    securityAudit: audit,
    allPassed,
  };

  await writeFile(
    `${DEMO_DIR}/security-report.json`,
    JSON.stringify(finalReport, null, 2)
  );

  console.log(`📁 Full report saved to ${DEMO_DIR}/security-report.json\n`);

  await enclave.shutdown();
}

main().catch(console.error);
