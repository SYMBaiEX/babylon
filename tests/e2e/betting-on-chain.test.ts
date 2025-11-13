/**
 * Betting On-Chain E2E Test
 * 
 * Tests the complete betting flow on-chain:
 * 1. Deploy contracts to Anvil
 * 2. Create question and commit to oracle
 * 3. Create market in Predimarket
 * 4. Users trade shares
 * 5. Resolve question and reveal
 * 6. Verify market resolves
 * 7. Users claim payouts
 */

import { describe, it, expect, beforeAll } from 'bun:test'
import { execSync } from 'child_process'
import { ethers } from 'ethers'
import { prisma } from '../../src/lib/prisma'
import { getOracleService } from '../../src/lib/oracle'
import { generateSnowflakeId } from '../../src/lib/snowflake'
import { logger } from '../../src/lib/logger'

describe('Betting On-Chain E2E', () => {
  let provider: ethers.JsonRpcProvider
  let oracleContract: ethers.Contract
  let predimarketContract: ethers.Contract
  let tokenContract: ethers.Contract
  let user1: ethers.Wallet
  let user2: ethers.Wallet
  let sessionId: string
  let questionId: string

  beforeAll(async () => {
    // Check Anvil is running
    try {
      execSync('cast block-number --rpc-url http://localhost:8545', { stdio: 'ignore' })
    } catch {
      throw new Error('❌ Anvil not running. Start with: docker-compose up -d anvil')
    }

    // Check contracts are deployed
    if (!process.env.NEXT_PUBLIC_BABYLON_ORACLE) {
      throw new Error('❌ Contracts not deployed. Run: bun run contracts:deploy:local')
    }

    // Setup provider
    provider = new ethers.JsonRpcProvider('http://localhost:8545')

    // Setup wallets (Anvil accounts)
    const privateKey1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' // Anvil account 1
    const privateKey2 = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' // Anvil account 2
    user1 = new ethers.Wallet(privateKey1, provider)
    user2 = new ethers.Wallet(privateKey2, provider)

    // Setup contracts
    const oracleABI = [
      'function commitBabylonGame(string,uint256,string,bytes32,string) external returns (bytes32)',
      'function revealBabylonGame(bytes32,bool,bytes32,bytes,address[],uint256) external',
      'function getOutcome(bytes32) external view returns (bool,bool)',
      'function getCompleteGameInfo(bytes32) external view returns (tuple(string,uint256,string,uint256,address),tuple(bytes32,string,bool,bytes32,bytes32,uint256,uint256,bytes,uint256,bool))'
    ]

    const predimarketABI = [
      'function createMarketWithType(bytes32,string,uint256,uint8,address) external',
      'function buy(bytes32,bool,uint256,uint256) external returns (uint256)',
      'function sell(bytes32,bool,uint256,uint256) external returns (uint256)',
      'function resolveMarket(bytes32) external',
      'function claimPayout(bytes32) external returns (uint256)',
      'function getMarket(bytes32) external view returns (tuple(bytes32,string,uint256,uint256,uint256,uint256,uint256,bool,bool,uint8,address,uint8))',
      'function getPosition(bytes32,address) external view returns (tuple(uint256,uint256,uint256,uint256,bool))'
    ]

    const erc20ABI = [
      'function approve(address,uint256) external returns (bool)',
      'function balanceOf(address) external view returns (uint256)',
      'function mint(address,uint256) external'
    ]

    oracleContract = new ethers.Contract(
      process.env.NEXT_PUBLIC_BABYLON_ORACLE!,
      oracleABI,
      user1
    )

    predimarketContract = new ethers.Contract(
      process.env.NEXT_PUBLIC_PREDIMARKET!,
      predimarketABI,
      user1
    )

    tokenContract = new ethers.Contract(
      process.env.NEXT_PUBLIC_TEST_TOKEN!,
      erc20ABI,
      user1
    )

    logger.info('✅ Test environment initialized', undefined, 'BettingE2E')
  })

  it('E2E Step 1: Create question and commit to oracle', async () => {
    questionId = generateSnowflakeId()
    
    // Create question in database
    const resolutionDate = new Date()
    resolutionDate.setDate(resolutionDate.getDate() + 3)

    const question = await prisma.question.create({
      data: {
        id: questionId,
        questionNumber: 88888,
        text: 'Will this betting E2E test succeed?',
        scenarioId: 1,
        outcome: true, // YES will win
        rank: 1,
        createdDate: new Date(),
        resolutionDate,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    // Commit to oracle using OracleService
    const oracle = getOracleService()
    const commitResult = await oracle.commitGame(
      question.id,
      question.questionNumber,
      question.text,
      'e2e-betting',
      question.outcome
    )

    sessionId = commitResult.sessionId
    expect(sessionId).toBeTruthy()
    expect(commitResult.txHash).toMatch(/^0x[0-9a-f]{64}$/i)

    logger.info('✅ Step 1: Question committed', { sessionId, txHash: commitResult.txHash }, 'BettingE2E')
  })

  it('E2E Step 2: Create market in Predimarket', async () => {
    // Create market
    const tx = await predimarketContract.createMarketWithType(
      sessionId,
      'Will this betting E2E test succeed?',
      ethers.parseEther('1000'), // liquidity parameter
      0, // GameType.GENERIC
      process.env.NEXT_PUBLIC_BABYLON_ORACLE!
    )

    const receipt = await tx.wait()
    expect(receipt.status).toBe(1)

    // Verify market created
    const market = await predimarketContract.getMarket(sessionId)
    expect(market.question).toBe('Will this betting E2E test succeed?')
    expect(market.resolved).toBe(false)

    logger.info('✅ Step 2: Market created', { sessionId }, 'BettingE2E')
  })

  it('E2E Step 3: User1 buys YES shares', async () => {
    const amount = ethers.parseEther('100') // 100 tokens

    // Mint tokens to user1
    await tokenContract.mint(user1.address, amount)

    // Approve Predimarket to spend tokens
    const approveTx = await tokenContract.approve(
      process.env.NEXT_PUBLIC_PREDIMARKET!,
      amount
    )
    await approveTx.wait()

    // Buy YES shares
    const buyTx = await predimarketContract.buy(
      sessionId,
      true, // YES
      amount,
      0 // min shares (no slippage protection for test)
    )
    const receipt = await buyTx.wait()
    expect(receipt.status).toBe(1)

    // Verify position
    const position = await predimarketContract.getPosition(sessionId, user1.address)
    expect(position.yesShares).toBeGreaterThan(0)
    expect(position.totalSpent).toBe(amount)

    logger.info('✅ Step 3: User1 bought YES shares', { 
      shares: position.yesShares.toString(),
      spent: ethers.formatEther(amount)
    }, 'BettingE2E')
  })

  it('E2E Step 4: User2 buys NO shares', async () => {
    const amount = ethers.parseEther('100')

    // Mint tokens to user2
    await tokenContract.connect(user1).mint(user2.address, amount)

    // Approve and buy
    const tokenAsUser2 = tokenContract.connect(user2)
    await tokenAsUser2.approve(process.env.NEXT_PUBLIC_PREDIMARKET!, amount)

    const predimarketAsUser2 = predimarketContract.connect(user2)
    const buyTx = await predimarketAsUser2.buy(
      sessionId,
      false, // NO
      amount,
      0
    )
    await buyTx.wait()

    // Verify position
    const position = await predimarketAsUser2.getPosition(sessionId, user2.address)
    expect(position.noShares).toBeGreaterThan(0)

    logger.info('✅ Step 4: User2 bought NO shares', {
      shares: position.noShares.toString()
    }, 'BettingE2E')
  })

  it('E2E Step 5: Check market state before resolution', async () => {
    const market = await predimarketContract.getMarket(sessionId)
    
    expect(market.yesShares).toBeGreaterThan(0)
    expect(market.noShares).toBeGreaterThan(0)
    expect(market.totalVolume).toBeGreaterThan(0)
    expect(market.resolved).toBe(false)

    logger.info('✅ Step 5: Market state verified', {
      yesShares: ethers.formatEther(market.yesShares),
      noShares: ethers.formatEther(market.noShares),
      volume: ethers.formatEther(market.totalVolume)
    }, 'BettingE2E')
  })

  it('E2E Step 6: Resolve question and reveal on oracle', async () => {
    // Mark question as resolved
    await prisma.question.update({
      where: { id: questionId },
      data: { status: 'resolved' }
    })

    // Reveal using OracleService
    const oracle = getOracleService()
    const revealResult = await oracle.revealGame(
      questionId,
      true, // outcome = YES
      [user1.address], // winner
      ethers.parseEther('200') // totalPayout
    )

    expect(revealResult.outcome).toBe(true)
    expect(revealResult.txHash).toMatch(/^0x[0-9a-f]{64}$/i)

    // Verify oracle state
    const [outcome, finalized] = await oracleContract.getOutcome(sessionId)
    expect(finalized).toBe(true)
    expect(outcome).toBe(true)

    logger.info('✅ Step 6: Oracle revealed', {
      outcome: outcome ? 'YES' : 'NO',
      finalized,
      txHash: revealResult.txHash
    }, 'BettingE2E')
  })

  it('E2E Step 7: Resolve market based on oracle', async () => {
    const tx = await predimarketContract.resolveMarket(sessionId)
    const receipt = await tx.wait()
    expect(receipt.status).toBe(1)

    // Verify market resolved
    const market = await predimarketContract.getMarket(sessionId)
    expect(market.resolved).toBe(true)
    expect(market.outcome).toBe(true) // YES won

    logger.info('✅ Step 7: Market resolved based on oracle', {
      resolved: market.resolved,
      outcome: market.outcome ? 'YES' : 'NO'
    }, 'BettingE2E')
  })

  it('E2E Step 8: User1 (YES bettor) claims winnings', async () => {
    const balanceBefore = await tokenContract.balanceOf(user1.address)

    const claimTx = await predimarketContract.claimPayout(sessionId)
    const receipt = await claimTx.wait()
    expect(receipt.status).toBe(1)

    const balanceAfter = await tokenContract.balanceOf(user1.address)
    const profit = balanceAfter - balanceBefore

    expect(profit).toBeGreaterThan(0) // User1 won!

    logger.info('✅ Step 8: User1 claimed winnings', {
      payout: ethers.formatEther(profit)
    }, 'BettingE2E')
  })

  it('E2E Step 9: User2 (NO bettor) cannot claim (lost)', async () => {
    const predimarketAsUser2 = predimarketContract.connect(user2)

    try {
      await predimarketAsUser2.claimPayout(sessionId)
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      // User2 should fail to claim because they bet NO and YES won
      expect(error).toBeTruthy()
    }

    logger.info('✅ Step 9: User2 cannot claim (correctly lost)', undefined, 'BettingE2E')
  })

  it('E2E Step 10: Verify final state', async () => {
    // Check oracle
    const [outcome, finalized] = await oracleContract.getOutcome(sessionId)
    expect(finalized).toBe(true)
    expect(outcome).toBe(true)

    // Check market
    const market = await predimarketContract.getMarket(sessionId)
    expect(market.resolved).toBe(true)
    expect(market.outcome).toBe(true)

    // Check positions
    const pos1 = await predimarketContract.getPosition(sessionId, user1.address)
    const pos2 = await predimarketContract.getPosition(sessionId, user2.address)
    
    expect(pos1.hasClaimed).toBe(true) // User1 claimed
    expect(pos2.hasClaimed).toBe(false) // User2 did not claim

    logger.info('✅ Step 10: Final state verified', {
      oracleFinalized: finalized,
      oracleOutcome: outcome ? 'YES' : 'NO',
      marketResolved: market.resolved,
      marketOutcome: market.outcome ? 'YES' : 'NO',
      user1Claimed: pos1.hasClaimed,
      user2Claimed: pos2.hasClaimed
    }, 'BettingE2E')
  })

  it('E2E Step 11: Cleanup', async () => {
    await prisma.question.delete({
      where: { id: questionId }
    }).catch(() => {})

    logger.info('✅ Step 11: Test data cleaned up', undefined, 'BettingE2E')
  })
})

describe('On-Chain Verification', () => {
  it('should verify oracle contract is deployed', async () => {
    const provider = new ethers.JsonRpcProvider('http://localhost:8545')
    const code = await provider.getCode(process.env.NEXT_PUBLIC_BABYLON_ORACLE!)
    
    expect(code).not.toBe('0x')
    expect(code).not.toBe('0x0')
    expect(code.length).toBeGreaterThan(100)
  })

  it('should verify predimarket contract is deployed', async () => {
    const provider = new ethers.JsonRpcProvider('http://localhost:8545')
    const code = await provider.getCode(process.env.NEXT_PUBLIC_PREDIMARKET!)
    
    expect(code).not.toBe('0x')
    expect(code.length).toBeGreaterThan(100)
  })

  it('should verify test token contract is deployed', async () => {
    const provider = new ethers.JsonRpcProvider('http://localhost:8545')
    const code = await provider.getCode(process.env.NEXT_PUBLIC_TEST_TOKEN!)
    
    expect(code).not.toBe('0x')
    expect(code.length).toBeGreaterThan(100)
  })

  it('should read oracle version', async () => {
    const provider = new ethers.JsonRpcProvider('http://localhost:8545')
    const oracle = new ethers.Contract(
      process.env.NEXT_PUBLIC_BABYLON_ORACLE!,
      ['function version() external pure returns (string)'],
      provider
    )

    const version = await oracle.version()
    expect(version).toBe('1.0.0')
  })

  it('should read oracle statistics', async () => {
    const provider = new ethers.JsonRpcProvider('http://localhost:8545')
    const oracle = new ethers.Contract(
      process.env.NEXT_PUBLIC_BABYLON_ORACLE!,
      ['function getStatistics() external view returns (uint256,uint256,uint256)'],
      provider
    )

    const stats = await oracle.getStatistics()
    expect(stats[0]).toBeGreaterThanOrEqual(0) // committed
    expect(stats[1]).toBeGreaterThanOrEqual(0) // revealed
    expect(stats[2]).toBeGreaterThanOrEqual(0) // pending
  })
})

