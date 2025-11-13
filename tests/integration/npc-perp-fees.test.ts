/**
 * Integration tests for NPC perpetual trading fees
 * 
 * Tests verify that:
 * 1. NPC positions are created in database correctly
 * 2. Trading fees (0.1%) are correctly deducted from NPC pool balance
 * 3. Fees are tracked in Pool.totalFeesCollected
 * 4. Positions can be closed with fees deducted from settlement
 * 
 * NOTE: NPCs use database-only tracking. They don't use PerpetualsEngine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TradeExecutionService } from '@/lib/services/trade-execution-service';
import { prisma } from '@/lib/prisma';

// Fee calculation helper (0.1% fee on position size)
const calculateFee = (positionSize: number) => positionSize * 0.001;

describe('NPC Perpetual Trading Fees', () => {
  let executionService: TradeExecutionService;
  let testPoolId: string;
  let testActorId: string;
  let testOrgId: string;
  let testTicker: string;

  beforeEach(async () => {
    // Create test organization with simple alphanumeric ID
    const timestamp = Date.now().toString().slice(-6);
    testOrgId = `TESTCO${timestamp}`;
    testTicker = `TESTCO${timestamp}`;
    
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: 'Test Company',
        description: 'Test',
        type: 'company',
        initialPrice: 100,
        currentPrice: 100,
        updatedAt: new Date(),
      },
    });

    // Create test actor and pool
    testActorId = `test-actor-${Date.now()}`;
    await prisma.actor.create({
      data: {
        id: testActorId,
        name: 'Test NPC',
        domain: [],
        affiliations: [],
        postExample: [],
        isTest: true,
        updatedAt: new Date(),
      },
    });

    testPoolId = `test-pool-${Date.now()}`;
    await prisma.pool.create({
      data: {
        id: testPoolId,
        npcActorId: testActorId,
        name: 'Test Pool',
        description: 'Test',
        availableBalance: 10000, // Sufficient for margin + fees
        totalDeposits: 10000,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    executionService = new TradeExecutionService();
  });

  afterEach(async () => {
    // Cleanup
    await prisma.nPCTrade.deleteMany({ where: { poolId: testPoolId } });
    await prisma.poolPosition.deleteMany({ where: { poolId: testPoolId } });
    await prisma.pool.deleteMany({ where: { id: testPoolId } });
    await prisma.actor.deleteMany({ where: { id: testActorId } });
    await prisma.organization.deleteMany({ where: { id: testOrgId } });
  });

  it('should deduct 0.1% fee when NPC opens perp position', async () => {
    const decision = {
      npcId: testActorId,
      npcName: 'Test NPC',
      action: 'open_long' as const,
      marketType: 'perp' as const,
      ticker: testTicker,
      amount: 1000, // Margin
      confidence: 0.8,
      reasoning: 'Test trade',
    };

    const initialPool = await prisma.pool.findUnique({
      where: { id: testPoolId },
      select: { availableBalance: true, totalFeesCollected: true },
    });

    const result = await executionService.executeSingleDecision(decision);

    expect(result.positionId).toBeDefined();
    
    // Verify position created in database
    const dbPosition = await prisma.poolPosition.findUnique({
      where: { id: result.positionId! },
    });
    expect(dbPosition).toBeDefined();
    expect(dbPosition?.ticker).toBe(testTicker);
    expect(dbPosition?.side).toBe('long');
    expect(dbPosition?.size).toBe(5000); // 1000 margin * 5x leverage
    expect(dbPosition?.leverage).toBe(5);
    expect(dbPosition?.closedAt).toBeNull();
    
    // Calculate expected fee: 0.1% of position size
    const positionSize = 5000;
    const expectedFee = calculateFee(positionSize); // 5.00
    const expectedCost = 1000 + expectedFee; // Margin + fee = 1005.00

    // Verify pool balance decreased by margin + fee
    const updatedPool = await prisma.pool.findUnique({
      where: { id: testPoolId },
      select: { availableBalance: true, totalFeesCollected: true },
    });
    
    const balanceDecrease = Number(initialPool!.availableBalance) - Number(updatedPool!.availableBalance);
    expect(balanceDecrease).toBeCloseTo(expectedCost, 1);

    // Verify fee was tracked in pool's totalFeesCollected
    const feeIncrease = Number(updatedPool!.totalFeesCollected) - Number(initialPool!.totalFeesCollected);
    expect(feeIncrease).toBeCloseTo(expectedFee, 1);
  });

  it('should deduct 0.1% fee when NPC closes perp position', async () => {
    // First open a position
    const openDecision = {
      npcId: testActorId,
      npcName: 'Test NPC',
      action: 'open_long' as const,
      marketType: 'perp' as const,
      ticker: testTicker,
      amount: 1000,
      confidence: 0.8,
      reasoning: 'Test trade',
    };

    const initialPool = await prisma.pool.findUnique({
      where: { id: testPoolId },
      select: { totalFeesCollected: true },
    });

    const openResult = await executionService.executeSingleDecision(openDecision);
    const positionId = openResult.positionId!;

    // Now close the position
    const closeDecision = {
      npcId: testActorId,
      npcName: 'Test NPC',
      action: 'close_position' as const,
      marketType: 'perp' as const,
      positionId,
      amount: 0,
      confidence: 0.8,
      reasoning: 'Test close',
    };

    await executionService.executeSingleDecision(closeDecision);

    // Verify position closed in database
    const dbPosition = await prisma.poolPosition.findUnique({
      where: { id: positionId },
    });
    expect(dbPosition?.closedAt).toBeDefined();
    expect(dbPosition?.realizedPnL).toBeDefined();

    // Verify total fees = open fee + close fee
    const updatedPool = await prisma.pool.findUnique({
      where: { id: testPoolId },
      select: { totalFeesCollected: true },
    });

    const positionSize = 5000;
    const expectedOpenFee = calculateFee(positionSize); // 5.00
    const expectedCloseFee = calculateFee(positionSize); // 5.00
    const expectedTotalFees = expectedOpenFee + expectedCloseFee; // 10.00

    const totalFeesCollected = Number(updatedPool!.totalFeesCollected) - Number(initialPool!.totalFeesCollected);
    expect(totalFeesCollected).toBeCloseTo(expectedTotalFees, 1);
  });

  it('should create NPCTrade record for audit trail', async () => {
    const decision = {
      npcId: testActorId,
      npcName: 'Test NPC',
      action: 'open_long' as const,
      marketType: 'perp' as const,
      ticker: testTicker,
      amount: 1000,
      confidence: 0.8,
      reasoning: 'Test trade',
    };

    await executionService.executeSingleDecision(decision);

    // Verify NPCTrade record created
    const npcTrade = await prisma.nPCTrade.findFirst({
      where: {
        npcActorId: testActorId,
        poolId: testPoolId,
        action: 'open_long',
      },
    });
    
    expect(npcTrade).toBeDefined();
    expect(npcTrade?.marketType).toBe('perp');
    expect(npcTrade?.ticker).toBe(testTicker);
    expect(npcTrade?.amount).toBe(1000);
    expect(npcTrade?.price).toBe(100);
  });

  it('should calculate correct liquidation price', async () => {
    const decision = {
      npcId: testActorId,
      npcName: 'Test NPC',
      action: 'open_long' as const,
      marketType: 'perp' as const,
      ticker: testTicker,
      amount: 1000,
      confidence: 0.8,
      reasoning: 'Test trade',
    };

    const result = await executionService.executeSingleDecision(decision);

    const dbPosition = await prisma.poolPosition.findUnique({
      where: { id: result.positionId! },
    });
    
    expect(dbPosition).toBeDefined();
    expect(dbPosition?.entryPrice).toBe(100);
    
    // For long position at $100, liquidation at 80% (0.8 * 100 = 80)
    expect(dbPosition?.liquidationPrice).toBe(80);
    expect(dbPosition?.closedAt).toBeNull();
  });
});

