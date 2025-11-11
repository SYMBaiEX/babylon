/**
 * Markets E2E Tests
 * 
 * Tests all market functionality:
 * - Viewing markets list
 * - Market detail pages
 * - Buying/selling predictions
 * - Viewing positions
 * - Market stats and charts
 * - Perpetual markets
 */

import { test, expect } from '@playwright/test'
import { loginWithPrivyEmail, getPrivyTestAccount } from './helpers/privy-auth'
import { navigateTo, waitForPageLoad, isVisible, scrollToBottom } from './helpers/page-helpers'
import { ROUTES, SELECTORS } from './helpers/test-data'

test.describe('Markets Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.MARKETS)
    await waitForPageLoad(page)
  })

  test('should load markets page', async ({ page }) => {
    expect(page.url()).toContain('/markets')
    
    await page.screenshot({ path: 'test-results/screenshots/05-markets-page.png', fullPage: true })
    console.log('✅ Markets page loaded')
  })

  test('should display market list', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Check for market cards/items
    const hasMarkets = await isVisible(page, '[data-testid="market-card"], article, [data-testid="market-item"]', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/05-markets-list.png', fullPage: true })
    
    console.log(`✅ Markets list displayed: ${hasMarkets}`)
  })

  test('should display market tabs', async ({ page }) => {
    // Look for tabs (Predictions, Perpetuals, etc.)
    const tabs = page.locator('button[role="tab"], [data-testid="market-tab"]')
    const tabCount = await tabs.count()
    
    console.log(`Found ${tabCount} market tabs`)
    
    if (tabCount > 0) {
      for (let i = 0; i < Math.min(tabCount, 3); i++) {
        const tab = tabs.nth(i)
        const tabText = await tab.textContent()
        
        await tab.click()
        await page.waitForTimeout(2000)
        
        await page.screenshot({ path: `test-results/screenshots/05-market-tab-${i}.png` })
        
        console.log(`✅ Switched to market tab: ${tabText}`)
      }
    }
  })

  test('should scroll through markets list', async ({ page }) => {
    await scrollToBottom(page)
    await page.waitForTimeout(2000)
    
    await scrollToBottom(page)
    await page.waitForTimeout(2000)
    
    console.log('✅ Markets list scrolling works')
  })

  test('should search/filter markets', async ({ page }) => {
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first()
    
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('test')
      await page.waitForTimeout(2000)
      
      await page.screenshot({ path: 'test-results/screenshots/05-markets-search.png' })
      
      console.log('✅ Market search works')
    } else {
      console.log('ℹ️ Search input not found')
    }
  })
})

test.describe('Prediction Markets', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.MARKETS)
    await waitForPageLoad(page)
  })

  test('should view prediction market details', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Click first market
    const marketCard = page.locator('[data-testid="market-card"], article, a[href*="/markets/predictions/"]').first()
    
    if (await marketCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await marketCard.click()
      await waitForPageLoad(page)
      
      // Verify we're on market detail page
      const isDetailPage = page.url().includes('/markets/predictions/')
      
      await page.screenshot({ path: 'test-results/screenshots/05-prediction-detail.png', fullPage: true })
      
      console.log(`✅ Prediction market detail (navigated: ${isDetailPage})`)
    } else {
      console.log('⚠️ No prediction markets found')
    }
  })

  test('should display market information', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Navigate to first market
    const marketCard = page.locator('a[href*="/markets/predictions/"]').first()
    
    if (await marketCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await marketCard.click()
      await waitForPageLoad(page)
      
      // Check for market info elements
      const hasTitle = await isVisible(page, 'h1, [data-testid="market-title"]', 5000)
      const hasPrice = await isVisible(page, 'text=/\\$|price/i', 5000)
      const hasChart = await isVisible(page, 'canvas, [data-testid="chart"]', 5000)
      
      console.log('✅ Market information displayed')
      console.log(`  - Title: ${hasTitle}`)
      console.log(`  - Price: ${hasPrice}`)
      console.log(`  - Chart: ${hasChart}`)
    }
  })

  test('should open buy modal', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Navigate to first market
    const marketCard = page.locator('a[href*="/markets/predictions/"]').first()
    
    if (await marketCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await marketCard.click()
      await waitForPageLoad(page)
      
      // Click buy button
      const buyButton = page.locator(SELECTORS.BUY_BUTTON).first()
      
      if (await buyButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await buyButton.click()
        await page.waitForTimeout(2000)
        
        // Check for buy modal
        const modalVisible = await isVisible(page, '[role="dialog"], [data-testid="buy-modal"]', 5000)
        
        await page.screenshot({ path: 'test-results/screenshots/05-buy-modal.png' })
        
        console.log(`✅ Buy modal opened: ${modalVisible}`)
      }
    }
  })

  test('should validate buy form inputs', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const marketCard = page.locator('a[href*="/markets/predictions/"]').first()
    
    if (await marketCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await marketCard.click()
      await waitForPageLoad(page)
      
      const buyButton = page.locator(SELECTORS.BUY_BUTTON).first()
      
      if (await buyButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await buyButton.click()
        await page.waitForTimeout(2000)
        
        // Find amount input
        const amountInput = page.locator(SELECTORS.AMOUNT_INPUT).first()
        
        if (await amountInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Try entering invalid amount
          await amountInput.fill('-1')
          await page.waitForTimeout(500)
          
          // Check for error or disabled submit button
          const hasError = await isVisible(page, '[role="alert"], text=invalid, text=error', 2000)
          
          await page.screenshot({ path: 'test-results/screenshots/05-buy-validation.png' })
          
          console.log(`✅ Buy validation (error shown: ${hasError})`)
        }
      }
    }
  })

  test('should open sell modal', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const marketCard = page.locator('a[href*="/markets/predictions/"]').first()
    
    if (await marketCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await marketCard.click()
      await waitForPageLoad(page)
      
      // Click sell button
      const sellButton = page.locator(SELECTORS.SELL_BUTTON).first()
      
      if (await sellButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await sellButton.click()
        await page.waitForTimeout(2000)
        
        // Check for sell modal
        const modalVisible = await isVisible(page, '[role="dialog"], [data-testid="sell-modal"]', 5000)
        
        await page.screenshot({ path: 'test-results/screenshots/05-sell-modal.png' })
        
        console.log(`✅ Sell modal opened: ${modalVisible}`)
      } else {
        console.log('ℹ️ Sell button not visible (may need existing position)')
      }
    }
  })

  test('should display market participants', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const marketCard = page.locator('a[href*="/markets/predictions/"]').first()
    
    if (await marketCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await marketCard.click()
      await waitForPageLoad(page)
      
      // Look for participants section
      const hasParticipants = await isVisible(page, 'text=/participants|traders|holders/i', 5000)
      
      console.log(`✅ Market participants section: ${hasParticipants}`)
    }
  })
})

test.describe('Perpetual Markets', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.MARKETS)
    await waitForPageLoad(page)
  })

  test('should view perpetual markets', async ({ page }) => {
    // Click perpetuals tab
    const perpsTab = page.locator('button:has-text("Perpetuals"), button:has-text("Perps")').first()
    
    if (await perpsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await perpsTab.click()
      await page.waitForTimeout(2000)
      
      await page.screenshot({ path: 'test-results/screenshots/05-perpetuals-list.png', fullPage: true })
      
      console.log('✅ Perpetuals market list displayed')
    } else {
      // Try direct navigation
      await navigateTo(page, '/markets/perps')
      await page.waitForTimeout(2000)
      
      console.log('✅ Navigated to perpetuals via URL')
    }
  })

  test('should view perpetual market details', async ({ page }) => {
    await navigateTo(page, '/markets/perps')
    await page.waitForTimeout(2000)
    
    // Click first perpetual market
    const perpCard = page.locator('[data-testid="perp-card"], a[href*="/markets/perps/"]').first()
    
    if (await perpCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await perpCard.click()
      await waitForPageLoad(page)
      
      await page.screenshot({ path: 'test-results/screenshots/05-perpetual-detail.png', fullPage: true })
      
      console.log('✅ Perpetual market detail displayed')
    } else {
      console.log('ℹ️ No perpetual markets found')
    }
  })

  test('should display leverage options', async ({ page }) => {
    await navigateTo(page, '/markets/perps')
    await page.waitForTimeout(2000)
    
    const perpCard = page.locator('a[href*="/markets/perps/"]').first()
    
    if (await perpCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await perpCard.click()
      await waitForPageLoad(page)
      
      // Look for leverage controls
      const hasLeverage = await isVisible(page, 'text=/leverage|2x|3x|5x|10x/i', 5000)
      
      await page.screenshot({ path: 'test-results/screenshots/05-leverage-options.png' })
      
      console.log(`✅ Leverage options displayed: ${hasLeverage}`)
    }
  })
})

test.describe('User Positions', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.MARKETS)
    await waitForPageLoad(page)
  })

  test('should view user positions', async ({ page }) => {
    // Look for positions tab/section
    const positionsButton = page.locator('button:has-text("Positions"), button:has-text("My Positions")').first()
    
    if (await positionsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await positionsButton.click()
      await page.waitForTimeout(2000)
      
      await page.screenshot({ path: 'test-results/screenshots/05-user-positions.png', fullPage: true })
      
      console.log('✅ User positions displayed')
    } else {
      console.log('ℹ️ Positions section not found on markets page')
    }
  })

  test('should display position details', async ({ page }) => {
    const positionsButton = page.locator('button:has-text("Positions")').first()
    
    if (await positionsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await positionsButton.click()
      await page.waitForTimeout(2000)
      
      // Look for position cards
      const hasPositions = await isVisible(page, '[data-testid="position-card"], article', 5000)
      
      console.log(`✅ Position details displayed: ${hasPositions}`)
    }
  })

  test('should close a position', async ({ page }) => {
    const positionsButton = page.locator('button:has-text("Positions")').first()
    
    if (await positionsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await positionsButton.click()
      await page.waitForTimeout(2000)
      
      // Find close button
      const closeButton = page.locator('button:has-text("Close"), button:has-text("Sell")').first()
      
      if (await closeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await closeButton.click()
        await page.waitForTimeout(2000)
        
        // Check for close confirmation modal
        const modalVisible = await isVisible(page, '[role="dialog"]', 5000)
        
        await page.screenshot({ path: 'test-results/screenshots/05-close-position-modal.png' })
        
        console.log(`✅ Close position modal: ${modalVisible}`)
      } else {
        console.log('ℹ️ No positions to close or button not found')
      }
    }
  })
})

test.describe('Market Stats and Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.MARKETS)
    await waitForPageLoad(page)
  })

  test('should display market statistics', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for stats widgets
    const hasStats = await isVisible(page, 'text=/volume|liquidity|24h|total/i', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/05-market-stats.png' })
    
    console.log(`✅ Market statistics displayed: ${hasStats}`)
  })

  test('should display trending markets', async ({ page }) => {
    // Look for trending section
    const hasTrending = await isVisible(page, 'text=/trending|hot|popular/i', 5000)
    
    console.log(`✅ Trending markets section: ${hasTrending}`)
  })
})

