/**
 * Unit Tests for GameDiscoveryService
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { GameDiscoveryService } from '../GameDiscovery'

describe('GameDiscoveryService', () => {
  let discovery: GameDiscoveryService
  
  beforeEach(() => {
    discovery = new GameDiscoveryService()
  })
  
  test('can be instantiated', () => {
    expect(discovery).toBeDefined()
  })
  
  test('discoverGames returns array', async () => {
    const games = await discovery.discoverGames({
      type: 'game-platform',
      markets: ['prediction']
    })
    
    expect(Array.isArray(games)).toBe(true)
  })
  
  test('findBabylon returns DiscoverableGame or null', async () => {
    const babylon = await discovery.findBabylon()
    
    expect(babylon === null || typeof babylon === 'object').toBe(true)
    
    if (babylon) {
      expect(babylon.name).toBeTruthy()
      expect(babylon.endpoints).toBeDefined()
      expect(babylon.endpoints.a2a).toBeTruthy()
      expect(babylon.endpoints.mcp).toBeTruthy()
      expect(babylon.endpoints.api).toBeTruthy()
    }
  })
  
  test('getGameByTokenId returns DiscoverableGame or null', async () => {
    const game = await discovery.getGameByTokenId(1)
    
    expect(game === null || typeof game === 'object').toBe(true)
  })
})

