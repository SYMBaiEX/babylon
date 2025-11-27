#!/usr/bin/env bun

/**
 * Status Commands
 *
 * Commands:
 *   game    - Game status (running/paused, tick info)
 *   wallet  - Wallet status (balance, nonce, pending txs)
 *   agent0  - Agent0 registration and configuration
 *   all     - Show all status (default)
 */

import { execSync } from 'child_process';
import { ethers } from 'ethers';
import { db, closeDatabase } from '@babylon/db';
import { parseArgs, wantsHelp } from '../lib/args.js';
import { logger } from '../lib/logger.js';

function printHelp(): void {
  console.log(`
System Status

USAGE:
  babylon status [target]

TARGETS:
  game      Game status (running/paused, tick info)
  wallet    Wallet status (balance, nonce, pending txs)
  agent0    Agent0 registration and configuration
  all       Show all status (default)

EXAMPLES:
  babylon status           Show all status
  babylon status game      Game status only
  babylon status wallet    Wallet status only
`);
}

async function checkGameStatus(): Promise<void> {
  logger.header('🎮 Game Status');

  try {
    await db.$connect();
    logger.success('Database connected');
  } catch {
    logger.fail('Database connection failed');
    process.exit(1);
  }

  const actorCount = await db.actor.count();
  console.log(`Actors: ${actorCount}`);

  if (actorCount === 0) {
    logger.warn('No actors in database! Run: babylon db seed');
  }

  const questionCount = await db.question.count();
  const activeQuestions = await db.question.count({
    where: { status: 'active' },
  });
  console.log(`Questions: ${questionCount} total, ${activeQuestions} active`);

  const postCount = await db.post.count();
  const recentPosts = await db.post.count({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 5 * 60 * 1000),
      },
    },
  });
  console.log(`Posts: ${postCount} total, ${recentPosts} in last 5 minutes`);

  if (recentPosts === 0 && postCount > 0) {
    logger.warn('No recent posts - game tick might not be running');
  } else if (recentPosts > 0) {
    logger.success('Content is being generated');
  }

  const game = await db.game.findFirst({ where: { isContinuous: true } });
  if (game) {
    console.log('\nGame State:');
    console.log(`  Status: ${game.isRunning ? '✅ RUNNING' : '⏸️  PAUSED'}`);
    console.log(`  Current Day: ${game.currentDay}`);
    console.log(`  Current Date: ${game.currentDate.toLocaleString()}`);
    console.log(`  Active Questions: ${game.activeQuestions}`);
    console.log(`  Speed: ${game.speed}ms between ticks`);
    console.log(`  Last Tick: ${game.lastTickAt ? game.lastTickAt.toLocaleString() : 'Never'}`);

    if (!game.isRunning) {
      console.log('\n💡 To start: bun run game:start');
    }
  } else {
    logger.warn('No game state found');
  }

  const eventCount = await db.worldEvent.count();
  const recentEvents = await db.worldEvent.count({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 5 * 60 * 1000),
      },
    },
  });
  console.log(`\nEvents: ${eventCount} total, ${recentEvents} in last 5 minutes`);

  const orgCount = await db.organization.count();
  const companiesWithPrices = await db.organization.count({
    where: {
      type: 'company',
      currentPrice: { not: null },
    },
  });
  console.log(`Organizations: ${orgCount} total, ${companiesWithPrices} companies with prices`);
}

async function checkWalletStatus(): Promise<void> {
  logger.header('💳 Wallet Status');

  const gamePrivateKey = process.env.BABYLON_GAME_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  const gameWalletAddress = process.env.BABYLON_GAME_WALLET_ADDRESS;

  if (!gamePrivateKey || !gameWalletAddress) {
    logger.fail('Missing BABYLON_GAME_PRIVATE_KEY or BABYLON_GAME_WALLET_ADDRESS');
    return;
  }

  const rpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL ||
    process.env.SEPOLIA_RPC_URL ||
    'https://ethereum-sepolia-rpc.publicnode.com';

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(gamePrivateKey, provider);

  console.log(`Wallet: ${wallet.address}`);
  console.log(`Expected: ${gameWalletAddress}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`\n💰 Balance: ${ethers.formatEther(balance)} ETH`);

  const nonce = await provider.getTransactionCount(wallet.address, 'latest');
  const pendingNonce = await provider.getTransactionCount(wallet.address, 'pending');

  console.log(`📊 Nonce (confirmed): ${nonce}`);
  console.log(`📊 Nonce (pending): ${pendingNonce}`);

  if (pendingNonce > nonce) {
    logger.warn(`${pendingNonce - nonce} pending transaction(s) detected`);
  } else {
    logger.success('No pending transactions');
  }

  const feeData = await provider.getFeeData();
  console.log('\n⛽ Current Gas Price:');
  console.log(`   Max Fee: ${feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') : 'N/A'} gwei`);
  console.log(`   Max Priority Fee: ${feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') : 'N/A'} gwei`);

  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  console.log('\n🌐 Network Status:');
  console.log(`   Latest Block: ${blockNumber}`);
  console.log(`   Block Time: ${new Date(block!.timestamp * 1000).toISOString()}`);
  console.log(`   Base Fee: ${block!.baseFeePerGas ? ethers.formatUnits(block!.baseFeePerGas, 'gwei') : 'N/A'} gwei`);
}

async function checkAgent0Status(): Promise<void> {
  logger.header('🤖 Agent0 Status');

  console.log('Environment Variables:');
  console.log(`  AGENT0_ENABLED: ${process.env.AGENT0_ENABLED || 'not set'}`);
  console.log(`  AGENT0_NETWORK: ${process.env.AGENT0_NETWORK || 'not set'}`);
  console.log(`  BABYLON_REGISTRY_REGISTERED: ${process.env.BABYLON_REGISTRY_REGISTERED || 'not set'}`);
  console.log(`  BABYLON_GAME_WALLET_ADDRESS: ${process.env.BABYLON_GAME_WALLET_ADDRESS || 'not set'}`);
  console.log(`  PINATA_JWT: ${process.env.PINATA_JWT ? '✅ Set' : '❌ Not set'}`);

  try {
    const config = await db.gameConfig.findUnique({
      where: { key: 'agent0_registration' },
    });

    if (config?.value && typeof config.value === 'object' && 'tokenId' in config.value) {
      const regValue = config.value as {
        tokenId: unknown;
        metadataCID?: unknown;
        registeredAt?: unknown;
      };

      console.log('\n✅ Database Registration Found:');
      console.log(`   Token ID: ${regValue.tokenId}`);
      console.log(`   Metadata CID: ${regValue.metadataCID}`);
      console.log(`   Registered At: ${regValue.registeredAt}`);

      const tokenId = Number(regValue.tokenId);
      const registryAddress = '0x8004a6090Cd10A7288092483047B097295Fb8847';
      const rpcUrl =
        process.env.NEXT_PUBLIC_RPC_URL ||
        process.env.SEPOLIA_RPC_URL ||
        'https://ethereum-sepolia-rpc.publicnode.com';

      console.log('\n🔗 Checking On-Chain Registration:');
      console.log(`   Registry: ${registryAddress}`);
      console.log(`   Token ID: ${tokenId}`);

      try {
        const owner = execSync(
          `cast call ${registryAddress} "ownerOf(uint256)(address)" ${tokenId} --rpc-url ${rpcUrl}`,
          { encoding: 'utf-8' }
        ).trim();

        logger.success('On-chain registration confirmed');
        console.log(`   Owner: ${owner}`);

        if (owner.toLowerCase() === process.env.BABYLON_GAME_WALLET_ADDRESS?.toLowerCase()) {
          logger.success('Owner matches BABYLON_GAME_WALLET_ADDRESS');
        } else {
          logger.warn('Owner does NOT match BABYLON_GAME_WALLET_ADDRESS');
        }

        const tokenURI = execSync(
          `cast call ${registryAddress} "tokenURI(uint256)(string)" ${tokenId} --rpc-url ${rpcUrl}`,
          { encoding: 'utf-8' }
        ).trim().replace(/"/g, '');

        console.log('\n📄 Token URI:');
        console.log(`   ${tokenURI}`);

        const cid = tokenURI.replace('ipfs://', '');
        console.log('\n🌐 View metadata:');
        console.log(`   https://ipfs.io/ipfs/${cid}`);
      } catch {
        logger.warn('Could not verify on-chain registration');
      }
    } else {
      logger.warn('No registration found in database');
      console.log("   Run: bun run agent0:setup");
    }
  } catch {
    logger.warn('Database not available');
  }
}

async function showAllStatus(): Promise<void> {
  await checkGameStatus();
  await checkWalletStatus();
  await checkAgent0Status();

  logger.header('✅ Status Check Complete');
}

export async function runStatusCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (wantsHelp(parsed)) {
    printHelp();
    process.exit(0);
  }

  try {
    switch (parsed.command || 'all') {
      case 'game':
        await checkGameStatus();
        break;

      case 'wallet':
        await checkWalletStatus();
        break;

      case 'agent0':
        await checkAgent0Status();
        break;

      case 'all':
        await showAllStatus();
        break;

      default:
        logger.fail(`Unknown target: ${parsed.command}`);
        printHelp();
        process.exit(1);
    }
  } finally {
    await closeDatabase();
  }
}

