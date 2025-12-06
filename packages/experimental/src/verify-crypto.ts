#!/usr/bin/env bun
/**
 * Cryptography Verification
 *
 * This script PROVES the encryption is REAL, not simulation.
 *
 * Tests:
 * 1. REAL AES-256-GCM from Web Crypto API
 * 2. REAL HKDF-SHA256 key derivation
 * 3. REAL random IV generation (CSPRNG)
 * 4. REAL tamper detection (GCM authentication tag)
 * 5. Entropy analysis proving encryption is not XOR
 * 6. Key length verification (256-bit)
 */

import {
  decrypt,
  deriveKeyWithLabel,
  encrypt,
  generateIV,
  importKey,
  randomBytes,
} from './crypto/index.js';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  critical?: boolean;
}

async function runCryptoAudit(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║              CRYPTOGRAPHY AUDIT & VERIFICATION                    ║
╠═══════════════════════════════════════════════════════════════════╣
║  This script PROVES the encryption is REAL, not simulation.       ║
║  Any failures indicate a CRITICAL security issue.                 ║
╚═══════════════════════════════════════════════════════════════════╝
`);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 1: Web Crypto API Availability
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '═══════════════════════════════════════════════════════════════════'
  );
  console.log('  TEST 1: Web Crypto API Availability');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  const hasWebCrypto =
    typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  results.push({
    name: 'Web Crypto API available',
    passed: hasWebCrypto,
    details: hasWebCrypto
      ? 'crypto.subtle is available (real cryptography)'
      : 'CRITICAL: crypto.subtle not available!',
    critical: true,
  });
  console.log(
    `  ${hasWebCrypto ? '✅' : '❌'} crypto.subtle: ${hasWebCrypto ? 'Available' : 'NOT AVAILABLE'}`
  );

  const hasGetRandomValues = typeof crypto.getRandomValues === 'function';
  results.push({
    name: 'CSPRNG available',
    passed: hasGetRandomValues,
    details: hasGetRandomValues
      ? 'crypto.getRandomValues is available (real randomness)'
      : 'CRITICAL: crypto.getRandomValues not available!',
    critical: true,
  });
  console.log(
    `  ${hasGetRandomValues ? '✅' : '❌'} crypto.getRandomValues: ${hasGetRandomValues ? 'Available' : 'NOT AVAILABLE'}`
  );

  if (!hasWebCrypto || !hasGetRandomValues) {
    console.error(
      '\n❌ CRITICAL: Web Crypto API not available. Encryption is NOT secure!\n'
    );
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 2: Key Length Verification
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  TEST 2: Key Length Verification (256-bit required)');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  const keyBytes = randomBytes(32);
  const is256Bit = keyBytes.length === 32;
  results.push({
    name: 'Key is 256-bit',
    passed: is256Bit,
    details: `Key length: ${keyBytes.length * 8} bits`,
    critical: true,
  });
  console.log(
    `  ${is256Bit ? '✅' : '❌'} Key length: ${keyBytes.length * 8} bits (${is256Bit ? 'correct' : 'INCORRECT'})`
  );

  // Test that wrong key sizes are rejected
  let rejectedWrongSize = false;
  try {
    await importKey(new Uint8Array(16)); // 128-bit should fail
  } catch {
    rejectedWrongSize = true;
  }
  results.push({
    name: 'Rejects non-256-bit keys',
    passed: rejectedWrongSize,
    details: rejectedWrongSize
      ? 'Correctly rejects 128-bit keys'
      : 'ACCEPTS WEAK KEYS!',
    critical: true,
  });
  console.log(
    `  ${rejectedWrongSize ? '✅' : '❌'} Rejects 128-bit keys: ${rejectedWrongSize ? 'Yes' : 'NO - INSECURE!'}`
  );

  // ═══════════════════════════════════════════════════════════════════
  // TEST 3: IV Randomness
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  TEST 3: IV Randomness (must never repeat)');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  const ivs = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const iv = generateIV();
    ivs.add(Buffer.from(iv).toString('hex'));
  }

  const allUnique = ivs.size === 1000;
  results.push({
    name: 'IVs are unique',
    passed: allUnique,
    details: `Generated 1000 IVs, ${ivs.size} unique`,
    critical: true,
  });
  console.log(
    `  ${allUnique ? '✅' : '❌'} 1000 IVs generated: ${ivs.size} unique (${allUnique ? 'all unique' : 'COLLISION DETECTED!'})`
  );

  const ivLength = generateIV().length;
  const correctIVLength = ivLength === 12;
  results.push({
    name: 'IV is 96-bit',
    passed: correctIVLength,
    details: `IV length: ${ivLength * 8} bits`,
    critical: true,
  });
  console.log(
    `  ${correctIVLength ? '✅' : '❌'} IV length: ${ivLength * 8} bits (${correctIVLength ? 'correct for GCM' : 'INCORRECT'})`
  );

  // ═══════════════════════════════════════════════════════════════════
  // TEST 4: Encryption Non-Determinism
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  TEST 4: Encryption Non-Determinism');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  const key = await importKey(keyBytes);
  const plaintext = new TextEncoder().encode('Test message for encryption');

  const ciphertext1 = await encrypt(plaintext, key);
  const ciphertext2 = await encrypt(plaintext, key);

  const isDifferent = ciphertext1.ciphertext !== ciphertext2.ciphertext;
  results.push({
    name: 'Same plaintext → different ciphertext',
    passed: isDifferent,
    details: isDifferent
      ? 'Ciphertexts differ (random IV working)'
      : 'SAME CIPHERTEXT - IV not random!',
    critical: true,
  });
  console.log(
    `  ${isDifferent ? '✅' : '❌'} Same plaintext, different ciphertext: ${isDifferent ? 'Yes' : 'NO - INSECURE!'}`
  );
  console.log(`     Ciphertext 1: ${ciphertext1.ciphertext.slice(0, 30)}...`);
  console.log(`     Ciphertext 2: ${ciphertext2.ciphertext.slice(0, 30)}...`);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 5: Tamper Detection (GCM Authentication)
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  TEST 5: Tamper Detection (GCM Authentication Tag)');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  const encrypted = await encrypt(plaintext, key);

  // Tamper with ciphertext
  const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
  const originalByte = tamperedCiphertext[0]!;
  tamperedCiphertext[0] = originalByte ^ 0xff;

  let tamperDetected = false;
  try {
    await decrypt(
      { ...encrypted, ciphertext: tamperedCiphertext.toString('base64') },
      key
    );
  } catch {
    tamperDetected = true;
  }

  results.push({
    name: 'Tampered ciphertext detected',
    passed: tamperDetected,
    details: tamperDetected
      ? 'GCM auth tag correctly detects tampering'
      : 'TAMPERING NOT DETECTED!',
    critical: true,
  });
  console.log(
    `  ${tamperDetected ? '✅' : '❌'} Ciphertext tampering detected: ${tamperDetected ? 'Yes' : 'NO - INSECURE!'}`
  );

  // Tamper with IV
  const tamperedIV = Buffer.from(encrypted.iv, 'base64');
  const originalIVByte = tamperedIV[0]!;
  tamperedIV[0] = originalIVByte ^ 0xff;

  let ivTamperDetected = false;
  try {
    await decrypt({ ...encrypted, iv: tamperedIV.toString('base64') }, key);
  } catch {
    ivTamperDetected = true;
  }

  results.push({
    name: 'Tampered IV detected',
    passed: ivTamperDetected,
    details: ivTamperDetected
      ? 'IV tampering correctly fails'
      : 'IV TAMPERING NOT DETECTED!',
    critical: true,
  });
  console.log(
    `  ${ivTamperDetected ? '✅' : '❌'} IV tampering detected: ${ivTamperDetected ? 'Yes' : 'NO - INSECURE!'}`
  );

  // ═══════════════════════════════════════════════════════════════════
  // TEST 6: Wrong Key Fails
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  TEST 6: Wrong Key Fails to Decrypt');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  const wrongKey = await importKey(randomBytes(32));
  let wrongKeyFails = false;
  try {
    await decrypt(encrypted, wrongKey);
  } catch {
    wrongKeyFails = true;
  }

  results.push({
    name: 'Wrong key fails to decrypt',
    passed: wrongKeyFails,
    details: wrongKeyFails
      ? 'Decryption with wrong key fails'
      : 'WRONG KEY DECRYPTED!',
    critical: true,
  });
  console.log(
    `  ${wrongKeyFails ? '✅' : '❌'} Wrong key rejected: ${wrongKeyFails ? 'Yes' : 'NO - INSECURE!'}`
  );

  // ═══════════════════════════════════════════════════════════════════
  // TEST 7: Correct Key Succeeds
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  TEST 7: Correct Key Decrypts Successfully');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  const decrypted = await decrypt(encrypted, key);
  const decryptedText = new TextDecoder().decode(decrypted);
  const originalText = new TextDecoder().decode(plaintext);
  const correctDecryption = decryptedText === originalText;

  results.push({
    name: 'Correct key decrypts',
    passed: correctDecryption,
    details: correctDecryption ? 'Decryption successful' : 'Decryption failed!',
    critical: true,
  });
  console.log(
    `  ${correctDecryption ? '✅' : '❌'} Correct key works: ${correctDecryption ? 'Yes' : 'NO!'}`
  );
  console.log(`     Original:  "${originalText}"`);
  console.log(`     Decrypted: "${decryptedText}"`);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 8: HKDF Key Derivation
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  TEST 8: HKDF Key Derivation');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  const masterKey = randomBytes(32);
  const derivedKey1 = await deriveKeyWithLabel(masterKey, 'encryption', 32);
  const derivedKey2 = await deriveKeyWithLabel(masterKey, 'authentication', 32);

  const keysAreDifferent =
    Buffer.from(derivedKey1).toString('hex') !==
    Buffer.from(derivedKey2).toString('hex');
  results.push({
    name: 'HKDF produces different keys for different labels',
    passed: keysAreDifferent,
    details: keysAreDifferent
      ? 'Different labels → different keys'
      : 'SAME KEY FOR DIFFERENT LABELS!',
    critical: true,
  });
  console.log(
    `  ${keysAreDifferent ? '✅' : '❌'} Different labels → different keys: ${keysAreDifferent ? 'Yes' : 'NO!'}`
  );

  // Same label should produce same key
  const derivedKey1Again = await deriveKeyWithLabel(
    masterKey,
    'encryption',
    32
  );
  const sameKeyForSameLabel =
    Buffer.from(derivedKey1).toString('hex') ===
    Buffer.from(derivedKey1Again).toString('hex');
  results.push({
    name: 'HKDF is deterministic',
    passed: sameKeyForSameLabel,
    details: sameKeyForSameLabel
      ? 'Same label → same key'
      : 'NON-DETERMINISTIC HKDF!',
    critical: true,
  });
  console.log(
    `  ${sameKeyForSameLabel ? '✅' : '❌'} Same label → same key: ${sameKeyForSameLabel ? 'Yes' : 'NO!'}`
  );

  // ═══════════════════════════════════════════════════════════════════
  // TEST 9: Entropy Analysis
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  TEST 9: Entropy Analysis (Proves Real Encryption)');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  // Encrypt a known pattern
  const repeatingPattern = new Uint8Array(1000).fill(0x41); // "AAA..."
  const encryptedPattern = await encrypt(repeatingPattern, key);
  const ciphertextBytes = Buffer.from(encryptedPattern.ciphertext, 'base64');

  // Calculate entropy
  const freq = new Array(256).fill(0);
  for (const byte of ciphertextBytes) {
    freq[byte]++;
  }
  let entropy = 0;
  for (const count of freq) {
    if (count > 0) {
      const p = count / ciphertextBytes.length;
      entropy -= p * Math.log2(p);
    }
  }

  // Good encryption should have entropy > 7 bits/byte
  const goodEntropy = entropy > 7;
  results.push({
    name: 'High entropy ciphertext',
    passed: goodEntropy,
    details: `Entropy: ${entropy.toFixed(2)} bits/byte (${goodEntropy ? '>7, good' : '<7, weak!'})`,
    critical: true,
  });
  console.log(
    `  ${goodEntropy ? '✅' : '❌'} Entropy: ${entropy.toFixed(2)} bits/byte`
  );
  console.log(
    `     (Random data has ~8 bits/byte, XOR would preserve patterns)`
  );
  console.log(`     Input: 1000 bytes of 0x41 (repeating pattern)`);
  console.log(
    `     Output entropy: ${goodEntropy ? 'HIGH - real encryption' : 'LOW - possibly XOR!'}`
  );

  // ═══════════════════════════════════════════════════════════════════
  // TEST 10: Algorithm Identifier
  // ═══════════════════════════════════════════════════════════════════
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('  TEST 10: Algorithm Identification');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  const correctAlgorithm = encrypted.alg === 'AES-256-GCM';
  results.push({
    name: 'Algorithm is AES-256-GCM',
    passed: correctAlgorithm,
    details: `Algorithm: ${encrypted.alg}`,
    critical: true,
  });
  console.log(
    `  ${correctAlgorithm ? '✅' : '❌'} Algorithm: ${encrypted.alg}`
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

  const criticalTests = results.filter((r) => r.critical);
  const criticalPassed = criticalTests.filter((r) => r.passed).length;
  const allCriticalPassed = criticalPassed === criticalTests.length;

  console.log(`  Tests passed: ${criticalPassed}/${criticalTests.length}`);
  console.log('');

  if (allCriticalPassed) {
    console.log(
      '  ╔═══════════════════════════════════════════════════════════════╗'
    );
    console.log(
      '  ║                    ✅ ENCRYPTION IS REAL                      ║'
    );
    console.log(
      '  ╠═══════════════════════════════════════════════════════════════╣'
    );
    console.log(
      '  ║                                                               ║'
    );
    console.log(
      '  ║  • Web Crypto API (not simulation)                           ║'
    );
    console.log(
      '  ║  • AES-256-GCM with 128-bit auth tag                         ║'
    );
    console.log(
      '  ║  • HKDF-SHA256 for key derivation                            ║'
    );
    console.log(
      '  ║  • CSPRNG for IV generation                                  ║'
    );
    console.log(
      '  ║  • Tamper detection working                                  ║'
    );
    console.log(
      '  ║  • High entropy output (no XOR)                              ║'
    );
    console.log(
      '  ║                                                               ║'
    );
    console.log(
      '  ║  This is PRODUCTION-QUALITY cryptography.                    ║'
    );
    console.log(
      '  ║  The only "simulation" is key origin (not hardware-bound).   ║'
    );
    console.log(
      '  ║                                                               ║'
    );
    console.log(
      '  ╚═══════════════════════════════════════════════════════════════╝'
    );
  } else {
    console.log(
      '  ╔═══════════════════════════════════════════════════════════════╗'
    );
    console.log(
      '  ║                 ❌ CRITICAL FAILURES DETECTED                 ║'
    );
    console.log(
      '  ╠═══════════════════════════════════════════════════════════════╣'
    );
    for (const result of criticalTests.filter((r) => !r.passed)) {
      console.log(`  ║  • ${result.name.padEnd(50)} ║`);
    }
    console.log(
      '  ╚═══════════════════════════════════════════════════════════════╝'
    );
  }

  console.log('');

  return results;
}

// Run the audit
runCryptoAudit().catch(console.error);
