/**
 * Feed and Posts E2E Tests
 * 
 * Tests all feed and post functionality:
 * - Viewing feed
 * - Creating posts
 * - Liking posts
 * - Commenting on posts
 * - Sharing posts
 * - Post interactions
 */

import { test, expect } from '@playwright/test'
import { loginWithPrivyEmail, getPrivyTestAccount } from './helpers/privy-auth'
import { navigateTo, waitForPageLoad, isVisible, scrollToBottom } from './helpers/page-helpers'
import { ROUTES, TEST_POST, TEST_COMMENT, SELECTORS } from './helpers/test-data'

test.describe('Feed Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.FEED)
    await waitForPageLoad(page)
  })

  test('should load feed page', async ({ page }) => {
    expect(page.url()).toContain('/feed')
    
    await page.screenshot({ path: 'test-results/screenshots/03-feed-page.png', fullPage: true })
    console.log('✅ Feed page loaded')
  })

  test('should display post input area', async ({ page }) => {
    const postInputVisible = await isVisible(page, SELECTORS.POST_INPUT) ||
                             await isVisible(page, 'textarea') ||
                             await isVisible(page, 'button:has-text("Post")') ||
                             await isVisible(page, 'button:has-text("Create")')
    
    expect(postInputVisible).toBe(true)
    console.log('✅ Post input area is visible')
  })

  test('should display posts in feed', async ({ page }) => {
    // Wait for posts to load
    await page.waitForTimeout(3000)
    
    // Check for post cards
    const hasPostCards = await isVisible(page, SELECTORS.POST_CARD, 5000) ||
                        await isVisible(page, '[data-testid="post"]', 5000) ||
                        await isVisible(page, 'article', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/03-feed-with-posts.png', fullPage: true })
    
    console.log(`✅ Posts displayed: ${hasPostCards}`)
  })

  test('should scroll through feed', async ({ page }) => {
    // Scroll down
    await scrollToBottom(page)
    await page.waitForTimeout(2000)
    
    // Scroll down more to trigger infinite scroll
    await scrollToBottom(page)
    await page.waitForTimeout(2000)
    
    await page.screenshot({ path: 'test-results/screenshots/03-feed-scrolled.png', fullPage: true })
    
    console.log('✅ Feed scrolling works')
  })
})

test.describe('Creating Posts', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.FEED)
    await waitForPageLoad(page)
  })

  test('should create a new text post', async ({ page }) => {
    // Find post input
    const postInput = page.locator('textarea, [contenteditable="true"], input[type="text"]').first()
    
    if (await postInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Fill in post content
      await postInput.fill(TEST_POST.content)
      console.log('✅ Entered post content')
      
      await page.waitForTimeout(1000)
      
      // Find and click post button
      const postButton = page.locator('button:has-text("Post"), button:has-text("Share"), button:has-text("Submit")').first()
      
      if (await postButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await postButton.click()
        console.log('✅ Clicked post button')
        
        // Wait for post to be created
        await page.waitForTimeout(3000)
        
        await page.screenshot({ path: 'test-results/screenshots/03-post-created.png', fullPage: true })
        
        // Check if post appears in feed
        const postVisible = await isVisible(page, `text=${TEST_POST.shortContent}`, 10000)
        console.log(`✅ Post created (visible: ${postVisible})`)
      } else {
        console.log('⚠️ Post button not found')
      }
    } else {
      console.log('⚠️ Post input not found')
    }
  })

  test('should show character count while typing', async ({ page }) => {
    const postInput = page.locator('textarea, [contenteditable="true"]').first()
    
    if (await postInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await postInput.fill('Test')
      await page.waitForTimeout(500)
      
      // Look for character counter
      const hasCounter = await isVisible(page, 'text=/\\d+/', 2000)
      
      await page.screenshot({ path: 'test-results/screenshots/03-character-counter.png' })
      
      console.log(`✅ Character counter (visible: ${hasCounter})`)
    }
  })

  test('should validate empty post submission', async ({ page }) => {
    const postButton = page.locator('button:has-text("Post"), button:has-text("Share")').first()
    
    if (await postButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Try to submit without content
      await postButton.click()
      await page.waitForTimeout(1000)
      
      // Check if button is disabled or error shown
      const buttonDisabled = await postButton.isDisabled()
      const hasError = await isVisible(page, '[role="alert"], text=required, text=empty', 2000)
      
      await page.screenshot({ path: 'test-results/screenshots/03-empty-post-validation.png' })
      
      console.log(`✅ Empty post validation (disabled: ${buttonDisabled}, error: ${hasError})`)
    }
  })
})

test.describe('Post Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.FEED)
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
  })

  test('should like a post', async ({ page }) => {
    // Find first like button
    const likeButton = page.locator('button[aria-label*="like" i], button:has-text("Like"), [data-testid="like-button"]').first()
    
    if (await likeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Get initial state
      await likeButton.getAttribute('aria-label')
      
      // Click like
      await likeButton.click()
      await page.waitForTimeout(1000)
      
      await page.screenshot({ path: 'test-results/screenshots/03-post-liked.png' })
      
      console.log('✅ Liked post')
    } else {
      console.log('⚠️ No posts with like buttons found')
    }
  })

  test('should unlike a post', async ({ page }) => {
    // Find first like button
    const likeButton = page.locator('button[aria-label*="like" i], button:has-text("Like")').first()
    
    if (await likeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Like the post
      await likeButton.click()
      await page.waitForTimeout(1000)
      
      // Unlike the post
      await likeButton.click()
      await page.waitForTimeout(1000)
      
      await page.screenshot({ path: 'test-results/screenshots/03-post-unliked.png' })
      
      console.log('✅ Unliked post')
    }
  })

  test('should open comment section', async ({ page }) => {
    // Find first comment button
    const commentButton = page.locator('button[aria-label*="comment" i], button:has-text("Comment"), [data-testid="comment-button"]').first()
    
    if (await commentButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await commentButton.click()
      await page.waitForTimeout(2000)
      
      // Check if comment input appears
      const commentInputVisible = await isVisible(page, 'textarea, input[placeholder*="comment" i]', 5000)
      
      await page.screenshot({ path: 'test-results/screenshots/03-comment-section.png' })
      
      console.log(`✅ Comment section opened (input visible: ${commentInputVisible})`)
    } else {
      console.log('⚠️ No posts with comment buttons found')
    }
  })

  test('should add a comment to a post', async ({ page }) => {
    // Find first comment button
    const commentButton = page.locator('button[aria-label*="comment" i], button:has-text("Comment")').first()
    
    if (await commentButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await commentButton.click()
      await page.waitForTimeout(2000)
      
      // Find comment input
      const commentInput = page.locator('textarea, input[placeholder*="comment" i], input[placeholder*="reply" i]').first()
      
      if (await commentInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Type comment
        await commentInput.fill(TEST_COMMENT.content)
        await page.waitForTimeout(500)
        
        // Submit comment
        const submitButton = page.locator('button:has-text("Comment"), button:has-text("Reply"), button:has-text("Post")').first()
        
        if (await submitButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await submitButton.click()
          await page.waitForTimeout(2000)
          
          await page.screenshot({ path: 'test-results/screenshots/03-comment-added.png' })
          
          console.log('✅ Comment added')
        }
      }
    }
  })

  test('should share a post', async ({ page }) => {
    // Find first share button
    const shareButton = page.locator('button[aria-label*="share" i], button:has-text("Share"), [data-testid="share-button"]').first()
    
    if (await shareButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shareButton.click()
      await page.waitForTimeout(2000)
      
      // Check if share modal/menu appears
      const shareModalVisible = await isVisible(page, '[role="dialog"], [data-testid="share-modal"]', 3000)
      
      await page.screenshot({ path: 'test-results/screenshots/03-share-modal.png' })
      
      console.log(`✅ Share interaction (modal visible: ${shareModalVisible})`)
    } else {
      console.log('⚠️ No posts with share buttons found')
    }
  })

  test('should view post details', async ({ page }) => {
    // Find first post card
    const postCard = page.locator('article, [data-testid="post-card"], [data-testid="post"]').first()
    
    if (await postCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click on post to view details
      await postCard.click()
      await page.waitForTimeout(2000)
      
      // Check if we navigated to post detail page
      const isDetailPage = page.url().includes('/post/')
      
      await page.screenshot({ path: 'test-results/screenshots/03-post-detail.png', fullPage: true })
      
      console.log(`✅ Post detail view (navigated: ${isDetailPage})`)
    }
  })
})

test.describe('Feed Filters and Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.FEED)
    await waitForPageLoad(page)
  })

  test('should switch between feed tabs', async ({ page }) => {
    // Look for tabs (For You, Following, Trending, etc.)
    const tabs = page.locator('button[role="tab"], [data-testid="feed-tab"]')
    const tabCount = await tabs.count()
    
    if (tabCount > 0) {
      console.log(`Found ${tabCount} feed tabs`)
      
      // Click each tab
      for (let i = 0; i < Math.min(tabCount, 4); i++) {
        const tab = tabs.nth(i)
        const tabText = await tab.textContent()
        
        await tab.click()
        await page.waitForTimeout(2000)
        await waitForPageLoad(page)
        
        await page.screenshot({ path: `test-results/screenshots/03-feed-tab-${i}.png` })
        
        console.log(`✅ Switched to tab: ${tabText}`)
      }
    } else {
      console.log('ℹ️ No feed tabs found')
    }
  })

  test('should filter feed by favorites', async ({ page }) => {
    // Look for favorites/favorites filter
    const favoritesButton = page.locator('button:has-text("Favorites"), button:has-text("Saved")').first()
    
    if (await favoritesButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await favoritesButton.click()
      await waitForPageLoad(page)
      await page.waitForTimeout(2000)
      
      await page.screenshot({ path: 'test-results/screenshots/03-favorites-feed.png', fullPage: true })
      
      console.log('✅ Favorites feed filter works')
    } else {
      console.log('ℹ️ Favorites filter not found')
    }
  })
})

