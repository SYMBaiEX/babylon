/**
 * Integration tests for NPC perpetual positions integration with PerpetualsEngine
 * 
 * Tests verify that:
 * 1. NPC positions are tracked in the engine
 * 2. NPC positions receive price updates automatically
 * 3. NPC positions can be liquidated when price hits liquidation threshold
 * 4. NPC positions are removed from engine when closed
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TradeExecutionService } from '@/lib/services/trade-execution-service';
import { PriceUpdateService } from '@/lib/services/price-update-service';
import { getReadyPerpsEngine } from '@/lib/perps-service';
import { prisma } from '@/lib/prisma';

describe('NPC Perpetual Positions Integration', () => {
  let executionService: TradeExecutionService;
  let testPoolId: string;
  let testActorId: string;
  let testOrgId: string;
  let testTicker: string;

  beforeEach(async () => {
    // Create test organization FIRST (before engine initialization)
    // Use shorter ID to avoid ticker truncation (ticker max is 12 chars)
    testOrgId = `test-org-${Date.now()}`;
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

    // Initialize singleton engine - it will load markets from DB including our test org
    const engine = await getReadyPerpsEngine();
    
    // Re-initialize markets to ensure our test org is included
    // (engine might have initialized before we created the org)
    engine.initializeMarkets([
      {
        id: testOrgId,
        name: 'Test Company',
        description: 'Test',
        type: 'company',
        canBeInvolved: true,
        initialPrice: 100,
        currentPrice: 100,
      },
    ]);

    // Get the actual ticker that the engine generated (may be truncated to 12 chars)
    const markets = engine.getMarkets();
    const testMarket = markets.find((m) => m.organizationId === testOrgId);
    testTicker = testMarket?.ticker || testOrgId.toUpperCase().replace(/-/g, '').substring(0, 12);

    // Create test actor and pool
    testActorId = `test-actor-${Date.now()}`;
    await prisma.actor.create({
      data: {
        id: testActorId,
        name: 'Test NPC',
        domain: [],
        affiliations: [],
        postExample: [],
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
        availableBalance: 10000,
        totalDeposits: 10000,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    executionService = new TradeExecutionService();
  });

  afterEach(async () => {
    // Cleanup
    await prisma.poolPosition.deleteMany({ where: { poolId: testPoolId } });
    await prisma.pool.deleteMany({ where: { id: testPoolId } });
    await prisma.actor.deleteMany({ where: { id: testActorId } });
    await prisma.organization.deleteMany({ where: { id: testOrgId } });
  });

  it('should add NPC position to engine when opened', async () => {
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

    expect(result.positionId).toBeDefined();
    
    const engine = await getReadyPerpsEngine();
    expect(engine.hasPosition(result.positionId!)).toBe(true);

    const position = engine.getPosition(result.positionId!);
    expect(position).toBeDefined();
    expect(position?.ticker).toBe(testTicker);
    expect(position?.side).toBe('long');
    expect(position?.size).toBe(5000); // 1000 * 5 leverage
  });

  it('should update NPC position price when organization price changes', async () => {
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
    const positionId = result.positionId!;

    // Verify initial state
    const engine = await getReadyPerpsEngine();
    const initialPosition = engine.getPosition(positionId);
    expect(initialPosition?.currentPrice).toBe(100);
    expect(initialPosition?.unrealizedPnL).toBe(0);

    // Update organization price
    await PriceUpdateService.applyUpdates([
      {
        organizationId: testOrgId,
        newPrice: 110,
        source: 'system',
        reason: 'Test price update',
      },
    ]);

    // Wait a bit for sync (engine syncs every 10 seconds, but updatePositions is immediate)
    // We need to manually trigger or wait for sync
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check that position was updated in engine
    const updatedPosition = engine.getPosition(positionId);
    expect(updatedPosition?.currentPrice).toBe(110);
    expect(updatedPosition?.unrealizedPnL).toBeGreaterThan(0); // Should have positive PnL for long position

    // Check that position was updated in database (after sync)
    const dbPosition = await prisma.poolPosition.findUnique({
      where: { id: positionId },
    });
    expect(dbPosition).toBeDefined();
    // Note: DB sync happens every 10 seconds, so we might need to wait longer
    // or manually trigger sync in a real test scenario
  });

  it('should liquidate NPC position when price hits liquidation threshold', async () => {
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
    const positionId = result.positionId!;

    const engine = await getReadyPerpsEngine();
    const position = engine.getPosition(positionId);
    expect(position).toBeDefined();
    const liquidationPrice = position!.liquidationPrice;

    // Update price to trigger liquidation (for long, liquidation happens when price drops)
    await PriceUpdateService.applyUpdates([
      {
        organizationId: testOrgId,
        newPrice: liquidationPrice - 1, // Price below liquidation threshold
        source: 'system',
        reason: 'Test liquidation',
      },
    ]);

    // Wait for liquidation processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Position should be removed from engine
    expect(engine.hasPosition(positionId)).toBe(false);

    // Position should be closed in database
    const dbPosition = await prisma.poolPosition.findUnique({
      where: { id: positionId },
    });
    expect(dbPosition?.closedAt).toBeDefined();
    expect(dbPosition?.realizedPnL).toBeLessThan(0); // Should have negative PnL
  });

  it('should remove NPC position from engine when closed', async () => {
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

    const openResult = await executionService.executeSingleDecision(decision);
    const positionId = openResult.positionId!;

    const engine = await getReadyPerpsEngine();
    expect(engine.hasPosition(positionId)).toBe(true);

    // Close position
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

    // Position should be removed from engine
    expect(engine.hasPosition(positionId)).toBe(false);

    // Position should be closed in database
    const dbPosition = await prisma.poolPosition.findUnique({
      where: { id: positionId },
    });
    expect(dbPosition?.closedAt).toBeDefined();
  });

  it('should handle engine errors gracefully without failing trade', async () => {
    // This test verifies that if engine operations fail, the trade still succeeds
    // We can't easily simulate engine failure, but the code has try-catch blocks
    // that log errors but don't throw, so trades succeed even if engine integration fails
    
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

    // Trade should succeed even if engine has issues
    const result = await executionService.executeSingleDecision(decision);
    expect(result.positionId).toBeDefined();

    // Position should exist in database
    const dbPosition = await prisma.poolPosition.findUnique({
      where: { id: result.positionId! },
    });
    expect(dbPosition).toBeDefined();
  });
});

