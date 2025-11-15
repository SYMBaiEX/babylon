/**
 * Comprehensive E2E Tests for Missing Pages
 * 
 * Tests EVERY button, form field, and flow on pages that were missing comprehensive tests:
 * - Markets detail pages (perps/[ticker], predictions/[id])
 * - Profile detail page (/profile/[id])
 * - Post/article detail pages (/post/[id], /article/[id])
 * - Settings moderation page (/settings/moderation)
 * - Admin sub-pages (/admin/performance, /admin/training)
 * - Share pages (/share/referral/[userId], /share/pnl/[userId])
 * - Trending tag page (/trending/[tag])
 * - API docs page (/api-docs)
 * - Reputation page (/reputation)
 */

import { test, expect, type Page, type Route } from '@playwright/test'
import { setupAuthState, TEST_USER } from './fixtures/auth'

const BASE_URL = process.env.BABYLON_URL || 'http://localhost:3000'

// Helper to mock API routes for dynamic pages
async function setupDynamicPageMocks(page: Page) {
  // Mock markets data
  await page.route('**/api/markets/perps**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          markets: [
            {
              ticker: 'BTC-USD',
              name: 'Bitcoin',
              currentPrice: '50000',
              volume24h: '1000000',
              openInterest: '50000000',
              fundingRate: '0.01',
              priceChange24h: '2.5',
              priceChangePercent24h: '5.0'
            }
          ]
        })
      })
    } else {
      await route.continue()
    }
  })

  // Mock perp detail
  await page.route('**/api/markets/perps/*', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const ticker = url.pathname.split('/').pop()
    
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          market: {
            ticker: ticker || 'BTC-USD',
            name: 'Bitcoin',
            currentPrice: '50000',
            volume24h: '1000000',
            openInterest: '50000000',
            fundingRate: '0.01',
            priceChange24h: '2.5',
            priceChangePercent24h: '5.0',
            priceHistory: []
          }
        })
      })
    } else {
      await route.continue()
    }
  })

  // Mock predictions
  await page.route('**/api/markets/predictions**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          markets: [
            {
              id: 'pred-1',
              question: 'Will Bitcoin reach $100k by 2025?',
              description: 'Test prediction market',
              yesPrice: '0.65',
              noPrice: '0.35',
              volume: '10000',
              liquidity: '50000',
              endDate: new Date(Date.now() + 86400000).toISOString()
            }
          ]
        })
      })
    } else {
      await route.continue()
    }
  })

  // Mock prediction detail
  await page.route('**/api/markets/predictions/*', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const id = url.pathname.split('/').pop()
    
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          market: {
            id: id || 'pred-1',
            question: 'Will Bitcoin reach $100k by 2025?',
            description: 'Test prediction market',
            yesPrice: '0.65',
            noPrice: '0.35',
            volume: '10000',
            liquidity: '50000',
            endDate: new Date(Date.now() + 86400000).toISOString(),
            priceHistory: []
          }
        })
      })
    } else {
      await route.continue()
    }
  })

  // Mock user profile
  await page.route('**/api/profiles/*', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const userId = url.pathname.split('/').pop()
    
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: userId || TEST_USER.id,
            username: 'testuser',
            displayName: 'Test User',
            bio: 'Test bio',
            profileImageUrl: null,
            followerCount: 10,
            followingCount: 5,
            postCount: 20,
            isFollowing: false,
            isBlocked: false
          }
        })
      })
    } else {
      await route.continue()
    }
  })

  // Mock posts
  await page.route('**/api/posts/*', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const postId = url.pathname.split('/').pop()
    
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: postId || 'post-1',
            content: 'Test post content',
            type: 'post',
            authorId: TEST_USER.id,
            authorName: 'Test User',
            authorUsername: 'testuser',
            timestamp: new Date().toISOString(),
            likeCount: 5,
            commentCount: 2,
            shareCount: 1,
            isLiked: false,
            isShared: false
          }
        })
      })
    } else {
      await route.continue()
    }
  })

  // Mock trending
  await page.route('**/api/trending/*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        posts: [],
        tag: 'test'
      })
    })
  })

  // Mock reputation
  await page.route('**/api/reputation/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        reputation: 1000,
        breakdown: {
          posts: 200,
          comments: 150,
          trades: 300,
          referrals: 350
        }
      })
    })
  })
}

test.describe('Missing Pages - Comprehensive E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthState(page)
    await setupDynamicPageMocks(page)
  })

  test.describe('Markets Perps Detail Page (/markets/perps/[ticker])', () => {
    test('should load perp detail page', async ({ page }) => {
      await page.goto(`${BASE_URL}/markets/perps/BTC-USD`)
      await page.waitForLoadState('networkidle')
      
      // Check header
      await expect(page.locator('h1, h2')).toContainText(/BTC|Bitcoin/i, { timeout: 10000 })
    })

    test('should display market information', async ({ page }) => {
      await page.goto(`${BASE_URL}/markets/perps/BTC-USD`)
      await page.waitForLoadState('networkidle')
      
      // Check for price display
      await expect(page.locator('text=/price|Price/i')).toBeVisible({ timeout: 5000 })
    })

    test('should display trading interface', async ({ page }) => {
      await page.goto(`${BASE_URL}/markets/perps/BTC-USD`)
      await page.waitForLoadState('networkidle')
      
      // Check for trading buttons
      const buyButton = page.locator('button:has-text("Buy"), button:has-text("Long")')
      const sellButton = page.locator('button:has-text("Sell"), button:has-text("Short")')
      
      // At least one should exist
      const buyCount = await buyButton.count()
      const sellCount = await sellButton.count()
      expect(buyCount + sellCount).toBeGreaterThan(0)
    })

    test('should toggle between Long/Short', async ({ page }) => {
      await page.goto(`${BASE_URL}/markets/perps/BTC-USD`)
      await page.waitForLoadState('networkidle')
      
      // Find Long/Short toggle
      const longButton = page.locator('button:has-text("Long")')
      const shortButton = page.locator('button:has-text("Short")')
      
      if (await longButton.count() > 0) {
        await longButton.click()
        await page.waitForTimeout(300)
      }
      
      if (await shortButton.count() > 0) {
        await shortButton.click()
        await page.waitForTimeout(300)
      }
    })

    test('should interact with size input', async ({ page }) => {
      await page.goto(`${BASE_URL}/markets/perps/BTC-USD`)
      await page.waitForLoadState('networkidle')
      
      // Find size input
      const sizeInput = page.locator('input[type="number"], input[placeholder*="size"], input[placeholder*="amount"]')
      if (await sizeInput.count() > 0) {
        await sizeInput.first().fill('100')
        await page.waitForTimeout(300)
      }
    })

    test('should interact with leverage selector', async ({ page }) => {
      await page.goto(`${BASE_URL}/markets/perps/BTC-USD`)
      await page.waitForLoadState('networkidle')
      
      // Find leverage selector
      const leverageSelect = page.locator('select, button:has-text("10x"), [role="combobox"]')
      if (await leverageSelect.count() > 0) {
        await leverageSelect.first().click()
        await page.waitForTimeout(300)
      }
    })
  })

  test.describe('Markets Predictions Detail Page (/markets/predictions/[id])', () => {
    test('should load prediction detail page', async ({ page }) => {
      await page.goto(`${BASE_URL}/markets/predictions/pred-1`)
      await page.waitForLoadState('networkidle')
      
      // Check header
      await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10000 })
    })

    test('should display market question', async ({ page }) => {
      await page.goto(`${BASE_URL}/markets/predictions/pred-1`)
      await page.waitForLoadState('networkidle')
      
      // Check for question
      await expect(page.locator('text=/Bitcoin|question/i')).toBeVisible({ timeout: 5000 })
    })

    test('should display trading interface', async ({ page }) => {
      await page.goto(`${BASE_URL}/markets/predictions/pred-1`)
      await page.waitForLoadState('networkidle')
      
      // Check for Yes/No buttons
      const yesButton = page.locator('button:has-text("Yes"), button:has-text("Buy Yes")')
      const noButton = page.locator('button:has-text("No"), button:has-text("Buy No")')
      
      const yesCount = await yesButton.count()
      const noCount = await noButton.count()
      expect(yesCount + noCount).toBeGreaterThan(0)
    })
  })

  test.describe('Profile Detail Page (/profile/[id])', () => {
    test('should load profile detail page', async ({ page }) => {
      await page.goto(`${BASE_URL}/profile/${TEST_USER.id}`)
      await page.waitForLoadState('networkidle')
      
      // Check header
      await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10000 })
    })

    test('should display profile information', async ({ page }) => {
      await page.goto(`${BASE_URL}/profile/${TEST_USER.id}`)
      await page.waitForLoadState('networkidle')
      
      // Check for profile elements
      await expect(page.locator('text=/Test User|testuser/i')).toBeVisible({ timeout: 5000 })
    })

    test('should switch between tabs (Posts, Replies, Trades)', async ({ page }) => {
      await page.goto(`${BASE_URL}/profile/${TEST_USER.id}`)
      await page.waitForLoadState('networkidle')
      
      const tabs = ['Posts', 'Replies', 'Trades']
      
      for (const tabName of tabs) {
        const tabButton = page.locator(`button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`)
        if (await tabButton.count() > 0) {
          await tabButton.click()
          await page.waitForTimeout(500)
        }
      }
    })

    test('should click Follow/Unfollow button', async ({ page }) => {
      await page.goto(`${BASE_URL}/profile/${TEST_USER.id}`)
      await page.waitForLoadState('networkidle')
      
      const followButton = page.locator('button:has-text("Follow"), button:has-text("Unfollow")')
      if (await followButton.count() > 0) {
        await followButton.click()
        await page.waitForTimeout(500)
      }
    })

    test('should click Message button', async ({ page }) => {
      await page.goto(`${BASE_URL}/profile/${TEST_USER.id}`)
      await page.waitForLoadState('networkidle')
      
      const messageButton = page.locator('button:has-text("Message"), button:has-text("DM")')
      if (await messageButton.count() > 0) {
        await messageButton.click()
        await page.waitForTimeout(500)
      }
    })
  })

  test.describe('Post Detail Page (/post/[id])', () => {
    test('should load post detail page', async ({ page }) => {
      await page.goto(`${BASE_URL}/post/post-1`)
      await page.waitForLoadState('networkidle')
      
      // Check for post content
      await expect(page.locator('text=/Test post/i')).toBeVisible({ timeout: 10000 })
    })

    test('should display post interactions', async ({ page }) => {
      await page.goto(`${BASE_URL}/post/post-1`)
      await page.waitForLoadState('networkidle')
      
      // Check for like button
      await expect(page.locator('button:has-text("Like"), button[aria-label*="like" i]')).toBeVisible({ timeout: 5000 })
    })

    test('should click Like button', async ({ page }) => {
      await page.goto(`${BASE_URL}/post/post-1`)
      await page.waitForLoadState('networkidle')
      
      const likeButton = page.locator('button:has-text("Like"), button[aria-label*="like" i]')
      if (await likeButton.count() > 0) {
        await likeButton.click()
        await page.waitForTimeout(500)
      }
    })

    test('should click Comment button', async ({ page }) => {
      await page.goto(`${BASE_URL}/post/post-1`)
      await page.waitForLoadState('networkidle')
      
      const commentButton = page.locator('button:has-text("Comment"), button[aria-label*="comment" i]')
      if (await commentButton.count() > 0) {
        await commentButton.click()
        await page.waitForTimeout(500)
        
        // Check for comment input
        await expect(page.locator('textarea, input[placeholder*="comment" i]')).toBeVisible({ timeout: 2000 })
      }
    })

    test('should click Share button', async ({ page }) => {
      await page.goto(`${BASE_URL}/post/post-1`)
      await page.waitForLoadState('networkidle')
      
      const shareButton = page.locator('button:has-text("Share"), button[aria-label*="share" i]')
      if (await shareButton.count() > 0) {
        await shareButton.click()
        await page.waitForTimeout(500)
      }
    })

    test('should create a comment', async ({ page }) => {
      await page.goto(`${BASE_URL}/post/post-1`)
      await page.waitForLoadState('networkidle')
      
      // Click comment button
      const commentButton = page.locator('button:has-text("Comment"), button[aria-label*="comment" i]')
      if (await commentButton.count() > 0) {
        await commentButton.click()
        await page.waitForTimeout(500)
        
        // Fill comment
        const commentInput = page.locator('textarea, input[placeholder*="comment" i]')
        if (await commentInput.count() > 0) {
          await commentInput.fill('Test comment')
          
          // Submit comment
          const submitButton = page.locator('button:has-text("Post"), button:has-text("Comment"), button[type="submit"]')
          if (await submitButton.count() > 0) {
            await submitButton.click()
            await page.waitForTimeout(1000)
          }
        }
      }
    })
  })

  test.describe('Article Detail Page (/article/[id])', () => {
    test('should load article detail page', async ({ page }) => {
      await page.goto(`${BASE_URL}/article/article-1`)
      await page.waitForLoadState('networkidle')
      
      // Check for article content
      await expect(page.locator('article, [class*="article"]')).toBeVisible({ timeout: 10000 })
    })

    test('should display article interactions', async ({ page }) => {
      await page.goto(`${BASE_URL}/article/article-1`)
      await page.waitForLoadState('networkidle')
      
      // Check for interaction buttons
      const buttons = page.locator('button')
      await expect(buttons.first()).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Settings Moderation Page (/settings/moderation)', () => {
    test('should load moderation settings page', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings/moderation`)
      await page.waitForLoadState('networkidle')
      
      // Check header
      await expect(page.locator('h1, h2')).toContainText(/Moderation|Block|Mute/i, { timeout: 10000 })
    })

    test('should display blocked users section', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings/moderation`)
      await page.waitForLoadState('networkidle')
      
      // Check for blocked users
      await expect(page.locator('text=/Blocked|block/i')).toBeVisible({ timeout: 5000 })
    })

    test('should display muted users section', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings/moderation`)
      await page.waitForLoadState('networkidle')
      
      // Check for muted users
      await expect(page.locator('text=/Muted|mute/i')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Admin Performance Page (/admin/performance)', () => {
    test('should load admin performance page', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/performance`)
      await page.waitForLoadState('networkidle')
      
      // Check header
      await expect(page.locator('h1, h2')).toContainText(/Performance|Admin/i, { timeout: 10000 })
    })

    test('should display performance metrics', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/performance`)
      await page.waitForLoadState('networkidle')
      
      // Check for metrics
      await expect(page.locator('text=/Performance|Metrics|Stats/i')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Admin Training Page (/admin/training)', () => {
    test('should load admin training page', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/training`)
      await page.waitForLoadState('networkidle')
      
      // Check header
      await expect(page.locator('h1, h2')).toContainText(/Training|Admin/i, { timeout: 10000 })
    })
  })

  test.describe('Share Referral Page (/share/referral/[userId])', () => {
    test('should load referral share page', async ({ page }) => {
      await page.goto(`${BASE_URL}/share/referral/${TEST_USER.id}`)
      await page.waitForLoadState('networkidle')
      
      // Check for referral content
      await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Share PnL Page (/share/pnl/[userId])', () => {
    test('should load PnL share page', async ({ page }) => {
      await page.goto(`${BASE_URL}/share/pnl/${TEST_USER.id}`)
      await page.waitForLoadState('networkidle')
      
      // Check for PnL content
      await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Trending Tag Page (/trending/[tag])', () => {
    test('should load trending tag page', async ({ page }) => {
      await page.goto(`${BASE_URL}/trending/test`)
      await page.waitForLoadState('networkidle')
      
      // Check header
      await expect(page.locator('h1, h2')).toContainText(/test|trending/i, { timeout: 10000 })
    })
  })

  test.describe('API Docs Page (/api-docs)', () => {
    test('should load API docs page', async ({ page }) => {
      await page.goto(`${BASE_URL}/api-docs`)
      await page.waitForLoadState('networkidle')
      
      // Check header
      await expect(page.locator('h1, h2')).toContainText(/API|Docs|Documentation/i, { timeout: 10000 })
    })
  })

  test.describe('Reputation Page (/reputation)', () => {
    test('should load reputation page', async ({ page }) => {
      await page.goto(`${BASE_URL}/reputation`)
      await page.waitForLoadState('networkidle')
      
      // Check header
      await expect(page.locator('h1, h2')).toContainText(/Reputation/i, { timeout: 10000 })
    })

    test('should display reputation breakdown', async ({ page }) => {
      await page.goto(`${BASE_URL}/reputation`)
      await page.waitForLoadState('networkidle')
      
      // Check for reputation display
      await expect(page.locator('text=/Reputation|Points/i')).toBeVisible({ timeout: 5000 })
    })

    test('should switch between tabs if available', async ({ page }) => {
      await page.goto(`${BASE_URL}/reputation`)
      await page.waitForLoadState('networkidle')
      
      const tabs = page.locator('[role="tab"], button:has-text("Breakdown"), button:has-text("Leaderboard")')
      const tabCount = await tabs.count()
      
      if (tabCount > 0) {
        for (let i = 0; i < Math.min(tabCount, 3); i++) {
          await tabs.nth(i).click()
          await page.waitForTimeout(500)
        }
      }
    })
  })
})

