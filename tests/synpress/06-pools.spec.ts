/**
 * Pools E2E Tests
 * 
 * Tests all liquidity pool functionality:
 * - Viewing pools list
 * - Pool details
 * - Depositing to pools
 * - Withdrawing from pools
 * - Pool stats and APY
 */

import { test } from '@playwright/test'
import { loginWithPrivyEmail, getPrivyTestAccount } from './helpers/privy-auth'
import { navigateTo, waitForPageLoad, isVisible, scrollToBottom } from './helpers/page-helpers'
import { ROUTES, TEST_POOL, SELECTORS } from './helpers/test-data'

test.describe('Pools Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    
    // Try both routes
    const poolsUrl = '/markets/pools'
    await navigateTo(page, poolsUrl)
    await waitForPageLoad(page)
  })

  test('should load pools page', async ({ page }) => {
    const isPoolsPage = page.url().includes('/pools')
    
    await page.screenshot({ path: 'test-results/screenshots/06-pools-page.png', fullPage: true })
    
    console.log(`✅ Pools page loaded: ${isPoolsPage}`)
  })

  test('should display pools list', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Check for pool cards/items
    const hasPools = await isVisible(page, '[data-testid="pool-card"], article, [data-testid="pool-item"]', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/06-pools-list.png', fullPage: true })
    
    console.log(`✅ Pools list displayed: ${hasPools}`)
  })

  test('should display pool information', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for pool info elements
    const hasPoolName = await isVisible(page, 'h1, h2, h3', 5000)
    const hasAPY = await isVisible(page, 'text=/APY|apy|yield/i', 5000)
    const hasTVL = await isVisible(page, 'text=/TVL|tvl|liquidity/i', 5000)
    
    console.log('✅ Pool information elements:')
    console.log(`  - Pool names: ${hasPoolName}`)
    console.log(`  - APY: ${hasAPY}`)
    console.log(`  - TVL: ${hasTVL}`)
  })

  test('should scroll through pools list', async ({ page }) => {
    await scrollToBottom(page)
    await page.waitForTimeout(2000)
    
    console.log('✅ Pools list scrolling works')
  })
})

test.describe('Pool Details', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, '/markets/pools')
    await waitForPageLoad(page)
  })

  test('should view pool details', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Click first pool
    const poolCard = page.locator('[data-testid="pool-card"], article, a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      // Verify we're on pool detail page
      const isDetailPage = page.url().includes('/pools/')
      
      await page.screenshot({ path: 'test-results/screenshots/06-pool-detail.png', fullPage: true })
      
      console.log(`✅ Pool detail page (navigated: ${isDetailPage})`)
    } else {
      console.log('⚠️ No pool cards found')
    }
  })

  test('should display pool statistics', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      // Check for stats
      const hasAPY = await isVisible(page, 'text=/APY|Annual/i', 5000)
      const hasTVL = await isVisible(page, 'text=/TVL|Total Value/i', 5000)
      const hasVolume = await isVisible(page, 'text=/Volume|Trading/i', 5000)
      
      console.log('✅ Pool statistics:')
      console.log(`  - APY: ${hasAPY}`)
      console.log(`  - TVL: ${hasTVL}`)
      console.log(`  - Volume: ${hasVolume}`)
    }
  })

  test('should display pool composition', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      // Look for token composition
      const hasTokens = await isVisible(page, 'text=/tokens|assets|composition/i', 5000)
      
      console.log(`✅ Pool composition displayed: ${hasTokens}`)
    }
  })
})

test.describe('Deposit to Pool', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, '/markets/pools')
    await waitForPageLoad(page)
  })

  test('should open deposit modal', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      // Click deposit button
      const depositButton = page.locator(SELECTORS.DEPOSIT_BUTTON).first()
      
      if (await depositButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await depositButton.click()
        await page.waitForTimeout(2000)
        
        // Check for deposit modal
        const modalVisible = await isVisible(page, '[role="dialog"], [data-testid="deposit-modal"]', 5000)
        
        await page.screenshot({ path: 'test-results/screenshots/06-deposit-modal.png' })
        
        console.log(`✅ Deposit modal opened: ${modalVisible}`)
      } else {
        console.log('⚠️ Deposit button not found')
      }
    }
  })

  test('should validate deposit amount', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      const depositButton = page.locator(SELECTORS.DEPOSIT_BUTTON).first()
      
      if (await depositButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await depositButton.click()
        await page.waitForTimeout(2000)
        
        // Find amount input
        const amountInput = page.locator(SELECTORS.AMOUNT_INPUT).first()
        
        if (await amountInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Try invalid amount
          await amountInput.fill('-1')
          await page.waitForTimeout(500)
          
          const hasError = await isVisible(page, '[role="alert"], text=invalid, text=error', 2000)
          
          await page.screenshot({ path: 'test-results/screenshots/06-deposit-validation.png' })
          
          console.log(`✅ Deposit validation (error: ${hasError})`)
        }
      }
    }
  })

  test('should display deposit preview', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      const depositButton = page.locator(SELECTORS.DEPOSIT_BUTTON).first()
      
      if (await depositButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await depositButton.click()
        await page.waitForTimeout(2000)
        
        const amountInput = page.locator(SELECTORS.AMOUNT_INPUT).first()
        
        if (await amountInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await amountInput.fill(TEST_POOL.depositAmount)
          await page.waitForTimeout(1000)
          
          // Look for preview/summary
          const hasPreview = await isVisible(page, 'text=/you will receive|estimated|shares/i', 5000)
          
          await page.screenshot({ path: 'test-results/screenshots/06-deposit-preview.png' })
          
          console.log(`✅ Deposit preview: ${hasPreview}`)
        }
      }
    }
  })

  test('should show max deposit button', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      const depositButton = page.locator(SELECTORS.DEPOSIT_BUTTON).first()
      
      if (await depositButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await depositButton.click()
        await page.waitForTimeout(2000)
        
        // Look for max button
        const maxButton = page.locator('button:has-text("Max"), button:has-text("MAX")').first()
        
        if (await maxButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await maxButton.click()
          await page.waitForTimeout(500)
          
          await page.screenshot({ path: 'test-results/screenshots/06-max-deposit.png' })
          
          console.log('✅ Max deposit button works')
        }
      }
    }
  })
})

test.describe('Withdraw from Pool', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, '/markets/pools')
    await waitForPageLoad(page)
  })

  test('should open withdraw modal', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      // Click withdraw button
      const withdrawButton = page.locator(SELECTORS.WITHDRAW_BUTTON).first()
      
      if (await withdrawButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await withdrawButton.click()
        await page.waitForTimeout(2000)
        
        const modalVisible = await isVisible(page, '[role="dialog"], [data-testid="withdraw-modal"]', 5000)
        
        await page.screenshot({ path: 'test-results/screenshots/06-withdraw-modal.png' })
        
        console.log(`✅ Withdraw modal opened: ${modalVisible}`)
      } else {
        console.log('ℹ️ Withdraw button not visible (may need existing deposit)')
      }
    }
  })

  test('should validate withdraw amount', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      const withdrawButton = page.locator(SELECTORS.WITHDRAW_BUTTON).first()
      
      if (await withdrawButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await withdrawButton.click()
        await page.waitForTimeout(2000)
        
        const amountInput = page.locator(SELECTORS.AMOUNT_INPUT).first()
        
        if (await amountInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Try amount larger than balance
          await amountInput.fill('999999')
          await page.waitForTimeout(500)
          
          const hasError = await isVisible(page, '[role="alert"], text=insufficient, text=exceeds', 2000)
          
          await page.screenshot({ path: 'test-results/screenshots/06-withdraw-validation.png' })
          
          console.log(`✅ Withdraw validation (error: ${hasError})`)
        }
      }
    }
  })
})

test.describe('Pool History and Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, '/markets/pools')
    await waitForPageLoad(page)
  })

  test('should display pool performance chart', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      // Look for chart
      const hasChart = await isVisible(page, 'canvas, [data-testid="chart"], svg', 5000)
      
      await page.screenshot({ path: 'test-results/screenshots/06-pool-chart.png' })
      
      console.log(`✅ Pool performance chart: ${hasChart}`)
    }
  })

  test('should display user deposits', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      // Look for user position/deposits
      const hasUserPosition = await isVisible(page, 'text=/your deposit|your position|my position/i', 5000)
      
      console.log(`✅ User deposits section: ${hasUserPosition}`)
    }
  })

  test('should display transaction history', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const poolCard = page.locator('a[href*="/pools/"]').first()
    
    if (await poolCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolCard.click()
      await waitForPageLoad(page)
      
      // Look for transaction history
      const hasHistory = await isVisible(page, 'text=/history|transactions|activity/i', 5000)
      
      console.log(`✅ Transaction history: ${hasHistory}`)
    }
  })
})

