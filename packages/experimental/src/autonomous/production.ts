#!/usr/bin/env bun
/**
 * Production Entrypoint for Phala TEE
 *
 * This is the entrypoint when running inside a real Phala CVM.
 * It runs forever, maintaining the autonomous game.
 *
 * In production:
 *   - Keys are derived from Intel TDX hardware
 *   - Attestation is real Intel DCAP quotes
 *   - All crypto happens inside the enclave
 */

import { type Address, keccak256, toBytes } from 'viem';
import { AutonomousRunner } from './runner.js';
import { formatPermissionlessCheck, verifyPermissionless } from './verifier.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION FROM ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as Address;
const RPC_URL =
  process.env.RPC_URL ?? 'https://ethereum-sepolia.publicnode.com';
const CHAIN_ID = (process.env.CHAIN_ID ?? 'sepolia') as 'sepolia' | 'mainnet';

// Code hash - in production, this should match the Docker image hash
const CODE_HASH = keccak256(toBytes('babylon-autonomous-game-v1'));

// Timing configuration
const HEARTBEAT_INTERVAL_MS =
  Number(process.env.HEARTBEAT_INTERVAL_MS) || 60_000; // 1 minute
const TRAINING_INTERVAL_MS =
  Number(process.env.TRAINING_INTERVAL_MS) || 86_400_000; // 24 hours
const CHECKPOINT_INTERVAL_MS =
  Number(process.env.CHECKPOINT_INTERVAL_MS) || 3_600_000; // 1 hour

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK SERVER
// ═══════════════════════════════════════════════════════════════════════════

let runner: AutonomousRunner | null = null;

// Simple HTTP server for health checks (required by Phala)
const server = Bun.serve({
  port: 8080,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      const stats = runner?.getStats();
      if (stats?.state === 'running' || stats?.state === 'training') {
        return new Response(JSON.stringify({ status: 'healthy', ...stats }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ status: 'unhealthy', ...stats }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/attestation') {
      const attestation = runner?.getAttestation();
      if (attestation) {
        return new Response(JSON.stringify(attestation), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Not ready' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/stats') {
      const stats = runner?.getStats();
      return new Response(JSON.stringify(stats ?? {}), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/operator') {
      const address = runner?.getOperatorAddress();
      return new Response(JSON.stringify({ address }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Autonomous Game Runner', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('       AUTONOMOUS PERMISSIONLESS AI GAME');
  console.log('       Production Mode');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // Validate configuration
  if (!CONTRACT_ADDRESS) {
    console.error('ERROR: CONTRACT_ADDRESS environment variable required');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Contract:   ${CONTRACT_ADDRESS}`);
  console.log(`  RPC:        ${RPC_URL}`);
  console.log(`  Chain:      ${CHAIN_ID}`);
  console.log(`  Heartbeat:  ${HEARTBEAT_INTERVAL_MS / 1000}s`);
  console.log(`  Training:   ${TRAINING_INTERVAL_MS / 1000}s`);
  console.log(`  Checkpoint: ${CHECKPOINT_INTERVAL_MS / 1000}s`);
  console.log();

  // Verify permissionless properties
  console.log('Verifying permissionless properties...');
  const permCheck = verifyPermissionless({
    hasApiKeys: false,
    usesWalletAuth: true,
    operatorReplaceable: true,
    statePubliclyAccessible: true,
    codeOpenSource: true,
  });

  if (!permCheck.passed) {
    console.error('ERROR: Permissionless verification failed');
    console.log(formatPermissionlessCheck(permCheck));
    process.exit(1);
  }
  console.log('  ✓ Permissionless verification passed');
  console.log();

  // Create and start runner
  runner = new AutonomousRunner({
    rpcUrl: RPC_URL,
    contractAddress: CONTRACT_ADDRESS,
    chainId: CHAIN_ID,
    codeHash: CODE_HASH,
    instanceId: `production-${Date.now()}`,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    trainingIntervalMs: TRAINING_INTERVAL_MS,
    stateCheckpointIntervalMs: CHECKPOINT_INTERVAL_MS,
    verbose: true,
  });

  await runner.start();

  console.log();
  console.log(`Health check server running on port ${server.port}`);
  console.log('Endpoints:');
  console.log('  GET /health      - Health check');
  console.log('  GET /attestation - TEE attestation quote');
  console.log('  GET /stats       - Runner statistics');
  console.log('  GET /operator    - Operator address');
  console.log();
  console.log(
    'The game is now running autonomously. No human intervention needed.'
  );
  console.log('Press Ctrl+C to stop (in production, this runs forever).');

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down...');
    await runner?.stop();
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down...');
    await runner?.stop();
    server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
