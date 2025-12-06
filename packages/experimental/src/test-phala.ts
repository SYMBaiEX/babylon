#!/usr/bin/env bun
/**
 * Phala Cloud TEE Test
 *
 * ARCHITECTURE:
 *
 * Phala Cloud is NOT 100% permissionless.
 *
 * REQUIRES API KEY:
 * - CVM provisioning
 * - Node selection
 * - Getting KMS contract addresses
 * - Account management
 *
 * PERMISSIONLESS (once you have contract address):
 * - On-chain app auth deployment
 *
 * PAYMENT:
 * - Via Phala Cloud account credits (not direct wallet)
 *
 * For fully permissionless TEE from wallet, use Marlin Oyster (test-marlin.ts).
 */

import { createClient, getAvailableNodes, getKmsList } from '@phala/cloud';
import type { Hex } from 'viem';
import { createPublicClient, formatEther, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex | undefined;
const PHALA_API_KEY = process.env.PHALA_CLOUD_API_KEY;

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  requiresApiKey: boolean;
}

async function main() {
  console.log('\nPhala Cloud Test\n');
  console.log('─'.repeat(50));

  const results: TestResult[] = [];

  // Test 1: Wallet setup
  console.log('1. Wallet');
  if (!PRIVATE_KEY) {
    console.log('   ✗ PRIVATE_KEY not set');
    results.push({
      name: 'Wallet',
      passed: false,
      details: 'PRIVATE_KEY not set',
      requiresApiKey: false,
    });
  } else {
    const key = (
      PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`
    ) as Hex;
    const account = privateKeyToAccount(key);
    console.log(`   Address: ${account.address}`);

    const baseClient = createPublicClient({ chain: base, transport: http() });
    const balance = await baseClient.getBalance({ address: account.address });
    const ethBalance = Number(formatEther(balance));
    console.log(`   Base ETH: ${ethBalance.toFixed(6)}`);

    results.push({
      name: 'Wallet',
      passed: true,
      details: `${ethBalance.toFixed(6)} ETH`,
      requiresApiKey: false,
    });
  }

  // Test 2: API Key check
  console.log('\n2. API Key');
  if (!PHALA_API_KEY) {
    console.log('   ✗ PHALA_CLOUD_API_KEY not set');
    console.log('   → Get API key at cloud.phala.network');
    results.push({
      name: 'API Key',
      passed: false,
      details: 'Not set',
      requiresApiKey: true,
    });
  } else {
    console.log('   ✓ API key configured');
    results.push({
      name: 'API Key',
      passed: true,
      details: 'Configured',
      requiresApiKey: true,
    });
  }

  // Test 3: Cloud API - Get KMS list
  console.log('\n3. KMS Contracts (API Required)');
  if (!PHALA_API_KEY) {
    console.log('   ⚠ Skipped - needs API key');
    results.push({
      name: 'KMS Contracts',
      passed: false,
      details: 'Needs API key',
      requiresApiKey: true,
    });
  } else {
    try {
      const client = createClient({ apiKey: PHALA_API_KEY });
      const kmsResult = await getKmsList(client);
      const kmsList = kmsResult.kms_list || [];

      console.log(`   ✓ Found ${kmsList.length} KMS instances`);
      for (const kms of kmsList.slice(0, 3)) {
        console.log(`     - ${kms.id}: chain=${kms.chain_id}`);
        if (kms.kms_contract_address) {
          console.log(`       contract: ${kms.kms_contract_address}`);
        }
      }

      results.push({
        name: 'KMS Contracts',
        passed: true,
        details: `${kmsList.length} KMS instances`,
        requiresApiKey: true,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`   ✗ Failed: ${msg}`);
      results.push({
        name: 'KMS Contracts',
        passed: false,
        details: msg.slice(0, 40),
        requiresApiKey: true,
      });
    }
  }

  // Test 4: Available nodes
  console.log('\n4. Available Nodes (API Required)');
  if (!PHALA_API_KEY) {
    console.log('   ⚠ Skipped - needs API key');
    results.push({
      name: 'Available Nodes',
      passed: false,
      details: 'Needs API key',
      requiresApiKey: true,
    });
  } else {
    try {
      const client = createClient({ apiKey: PHALA_API_KEY });
      const nodesResult = await getAvailableNodes(client);
      const nodes = nodesResult.nodes || [];

      const gpuNodes = nodes.filter(
        (n) =>
          n.gpu_count !== null && n.gpu_count !== undefined && n.gpu_count > 0
      );
      const cpuOnly = nodes.filter((n) => !n.gpu_count || n.gpu_count === 0);

      console.log(`   ✓ Total nodes: ${nodes.length}`);
      console.log(`   ✓ GPU nodes: ${gpuNodes.length}`);
      console.log(`   ✓ CPU-only nodes: ${cpuOnly.length}`);

      if (gpuNodes.length > 0) {
        const gpu = gpuNodes[0];
        console.log(
          `   First GPU: node_id=${gpu.node_id}, GPUs=${gpu.gpu_count}`
        );
      }

      results.push({
        name: 'Available Nodes',
        passed: true,
        details: `${nodes.length} nodes (${gpuNodes.length} GPU)`,
        requiresApiKey: true,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`   ✗ Failed: ${msg}`);
      results.push({
        name: 'Available Nodes',
        passed: false,
        details: msg.slice(0, 40),
        requiresApiKey: true,
      });
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  console.log('Summary:\n');

  const walletTests = results.filter((r) => !r.requiresApiKey);
  const apiTests = results.filter((r) => r.requiresApiKey);

  console.log('Wallet-Only:');
  for (const r of walletTests) {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}: ${r.details}`);
  }

  console.log('\nAPI Key Required:');
  for (const r of apiTests) {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}: ${r.details}`);
  }

  const apiPassCount = apiTests.filter((r) => r.passed).length;
  const walletPassCount = walletTests.filter((r) => r.passed).length;

  console.log('\n' + '─'.repeat(50));
  console.log(`Wallet-Only: ${walletPassCount}/${walletTests.length}`);
  console.log(`API Required: ${apiPassCount}/${apiTests.length}`);

  console.log('\n⚠ IMPORTANT:');
  console.log('  Phala Cloud requires API key for CVM provisioning.');
  console.log('  For 100% permissionless TEE, use Marlin Oyster instead.');
  console.log('  See: bun run src/test-marlin.ts\n');

  const hasApiKey = !!PHALA_API_KEY;
  const allPassed = hasApiKey
    ? results.every((r) => r.passed)
    : walletTests.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
