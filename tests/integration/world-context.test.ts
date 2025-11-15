/**
 * World Context Integration Test
 * 
 * Tests the world context generation from database
 */

import { describe, test, expect } from 'bun:test'
import { generateWorldContext } from '@/lib/prompts'
import { prisma } from '@/lib/prisma'

describe('World Context Generation', () => {
  test('Generate basic world context', async () => {
    if (!prisma || !prisma.market) {
      console.log('⏭️  Prisma models not available - skipping test');
      return;
    }
    
    const context = await generateWorldContext({
      maxActors: 10,
      includeMarkets: true,
      includePredictions: true,
      includeTrades: true,
    })

    expect(context).toBeDefined()
    expect(context.worldActors).toBeDefined()
    expect(context.currentMarkets).toBeDefined()
    expect(context.activePredictions).toBeDefined()
    expect(context.recentTrades).toBeDefined()
  })

  test('Context contains actor data', async () => {
    if (!prisma || !prisma.actor) {
      console.log('⏭️  Prisma models not available - skipping test');
      return;
    }
    
    const context = await generateWorldContext({
      maxActors: 30,
      includeMarkets: false,
      includePredictions: false,
      includeTrades: false,
    })

    expect(context.worldActors.length).toBeGreaterThan(0)
    
    // World actors format: "World Actors (USE THESE NAMES ONLY): Name (@username), ..."
    expect(context.worldActors).toMatch(/World Actors/i)
    expect(context.worldActors).toMatch(/@/) // Should contain @username format
    
    // Should have multiple actors
    const actorCount = context.worldActors.split(',').length
    expect(actorCount).toBeGreaterThan(1)
    
    console.log(`   ✅ Generated context for ${actorCount} actors`)
  })

  test('Context includes markets when requested', async () => {
    if (!prisma || !prisma.market) {
      console.log('⏭️  Prisma models not available - skipping test');
      return;
    }
    
    const context = await generateWorldContext({
      maxActors: 5,
      includeMarkets: true,
      includePredictions: false,
      includeTrades: false,
    })

    expect(context.currentMarkets).toBeDefined()
  })

  test('Context generation is fast', async () => {
    if (!prisma || !prisma.actor) {
      console.log('⏭️  Prisma models not available - skipping test');
      return;
    }
    
    const startTime = Date.now()
    
    await generateWorldContext({
      maxActors: 20,
      includeMarkets: true,
      includePredictions: true,
      includeTrades: true,
    })
    
    const duration = Date.now() - startTime
    expect(duration).toBeLessThan(2000) // Should complete in under 2 seconds
  })
})

