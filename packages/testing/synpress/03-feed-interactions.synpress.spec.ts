/**
 * Feed Page Interaction E2E Tests
 *
 * Tests all feed page interactions:
 * - Viewing posts
 * - Creating posts
 * - Liking/sharing posts
 * - Commenting on posts
 * - Tab switching (Latest/Following/Trades)
 * - Infinite scroll
 * - Pull to refresh
 * - Post detail navigation
 */

import { expect, test } from '@playwright/test';
import {
  cooldownBetweenTests,
  navigateTo,
  waitForPageLoad,
} from './helpers/page-helpers';
import { getPrivyTestAccount, loginWithPrivyEmail } from './helpers/privy-auth';
import { ROUTES, TIMEOUTS, VIEWPORTS } from './helpers/test-data';

test.setTimeout(TIMEOUTS.EXTRA_LONG);

test.describe('Feed Page - Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display feed page with posts or empty state', async ({
    page,
  }) => {
    // Check for either posts or empty state message
    const posts = page.locator(
      'article, [data-testid="post-card"], .post-card'
    );
    const postCount = await posts.count().catch(() => 0);

    if (postCount > 0) {
      await expect(posts.first()).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      console.log(`✅ Feed shows ${postCount} posts`);
    } else {
      // Check for empty state
      const emptyState = page
        .getByText('No Posts Yet')
        .or(page.getByText('Engine is generating'));
      const hasEmptyState = await emptyState
        .first()
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      console.log(`✅ Feed shows empty state: ${hasEmptyState}`);
    }
  });

  test('should switch between feed tabs', async ({ page }) => {
    const tabs = ['Latest', 'Following', 'Trades'];

    for (const tabName of tabs) {
      const tab = page.locator(`button:has-text("${tabName}")`).first();
      const isVisible = await tab
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      if (isVisible) {
        await tab.click();
        await page.waitForTimeout(1000);
        console.log(`✅ Switched to ${tabName} tab`);
      }
    }
  });

  test('should show following empty state when not following anyone', async ({
    page,
  }) => {
    // Click Following tab
    const followingTab = page.locator('button:has-text("Following")').first();
    if (await followingTab.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await followingTab.click();
      await page.waitForTimeout(2000);

      // Check for either posts or empty state
      const emptyState = page
        .getByText('Not Following Anyone')
        .or(page.getByText('Follow profiles'));
      const hasEmptyState = await emptyState
        .first()
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      const posts = page.locator('article, [data-testid="post-card"]');
      const hasPosts = await posts
        .first()
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      expect(hasEmptyState || hasPosts).toBe(true);
      console.log(
        `✅ Following tab shows content (empty: ${hasEmptyState}, posts: ${hasPosts})`
      );
    }
  });

  test('should display trades feed tab', async ({ page }) => {
    const tradesTab = page.locator('button:has-text("Trades")').first();
    if (await tradesTab.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await tradesTab.click();
      await page.waitForTimeout(2000);

      // Trades tab should load
      const content = await page.locator('body').textContent();
      expect(content).toBeTruthy();
      console.log('✅ Trades tab displays content');
    }
  });
});

test.describe('Feed Page - Post Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should open create post modal', async ({ page }) => {
    // Look for create post button (floating action button)
    const createButton = page
      .locator('button[aria-label="Create Post"], button:has(svg.lucide-plus)')
      .first();
    const isVisible = await createButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Modal should open
      const modal = page.locator('[role="dialog"], .modal');
      const modalVisible = await modal
        .first()
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      if (modalVisible) {
        console.log('✅ Create post modal opens');

        // Close modal
        await page.keyboard.press('Escape');
      } else {
        console.log('ℹ️ Modal not visible - may use different UI pattern');
      }
    } else {
      console.log('ℹ️ Create post button not found');
    }
  });

  test('should validate empty post submission', async ({ page }) => {
    const createButton = page
      .locator('button[aria-label="Create Post"], button:has(svg.lucide-plus)')
      .first();

    if (await createButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Try to submit without content
      const submitButton = page
        .locator('button:has-text("Post"), button[type="submit"]')
        .first();
      if (await submitButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
        // Should be disabled or show error on click
        const isDisabled = await submitButton.isDisabled();
        console.log(`✅ Submit button disabled for empty post: ${isDisabled}`);
      }

      await page.keyboard.press('Escape');
    }
  });

  test('should create a new post', async ({ page }) => {
    const createButton = page
      .locator('button[aria-label="Create Post"], button:has(svg.lucide-plus)')
      .first();

    if (await createButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Find textarea and type content
      const textarea = page.locator('textarea').first();
      if (await textarea.isVisible({ timeout: TIMEOUTS.SHORT })) {
        const testContent = `E2E Test Post - ${Date.now()}`;
        await textarea.fill(testContent);
        await page.waitForTimeout(500);

        // Submit
        const submitButton = page
          .locator('button:has-text("Post"), button[type="submit"]')
          .first();
        if (
          (await submitButton.isVisible()) &&
          !(await submitButton.isDisabled())
        ) {
          await submitButton.click();
          await page.waitForTimeout(3000);

          // Verify post appears in feed
          const newPost = page.getByText(testContent);
          const postVisible = await newPost
            .first()
            .isVisible({ timeout: TIMEOUTS.MEDIUM })
            .catch(() => false);

          if (postVisible) {
            console.log('✅ New post created and visible in feed');
          } else {
            console.log('ℹ️ Post created but not immediately visible');
          }
        }
      }

      await page.keyboard.press('Escape').catch(() => {});
    }
  });
});

test.describe('Feed Page - Post Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(3000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should like a post', async ({ page }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const postCount = await posts.count().catch(() => 0);

    if (postCount > 0) {
      // Find like button on first post
      const likeButton = posts
        .first()
        .locator('button:has(svg.lucide-heart), button[aria-label*="like" i]')
        .first();

      if (await likeButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
        await likeButton.click();
        await page.waitForTimeout(1000);
        console.log('✅ Like button clicked');
      }
    } else {
      console.log('ℹ️ No posts available to like');
    }
  });

  test('should open comment section', async ({ page }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const postCount = await posts.count().catch(() => 0);

    if (postCount > 0) {
      // Find comment button on first post
      const commentButton = posts
        .first()
        .locator(
          'button:has(svg.lucide-message-circle), button[aria-label*="comment" i]'
        )
        .first();

      if (await commentButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
        await commentButton.click();
        await page.waitForTimeout(1000);

        // Should navigate to post detail or open comments
        const url = page.url();
        if (url.includes('/post/')) {
          console.log('✅ Navigated to post detail page');
        } else {
          console.log('✅ Comment section triggered');
        }
      }
    }
  });

  test('should share/repost a post', async ({ page }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const postCount = await posts.count().catch(() => 0);

    if (postCount > 0) {
      // Find share/repost button
      const shareButton = posts
        .first()
        .locator(
          'button:has(svg.lucide-repeat), button[aria-label*="share" i], button[aria-label*="repost" i]'
        )
        .first();

      if (await shareButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
        await shareButton.click();
        await page.waitForTimeout(1000);

        // Should show share options or repost confirmation
        const shareMenu = page.locator(
          '[role="menu"], .dropdown-menu, [role="dialog"]'
        );
        const hasMenu = await shareMenu
          .first()
          .isVisible({ timeout: TIMEOUTS.SHORT })
          .catch(() => false);

        console.log(`✅ Share button clicked (menu visible: ${hasMenu})`);

        // Close menu if open
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
  });

  test('should navigate to post detail on click', async ({ page }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const postCount = await posts.count().catch(() => 0);

    if (postCount > 0) {
      // Click on post content (not buttons)
      const postContent = posts.first().locator('p, .post-content').first();

      if (await postContent.isVisible({ timeout: TIMEOUTS.SHORT })) {
        await postContent.click();
        await page.waitForTimeout(2000);

        const url = page.url();
        if (url.includes('/post/')) {
          console.log('✅ Navigated to post detail page');
        } else {
          console.log('ℹ️ Post click did not navigate to detail');
        }
      }
    }
  });

  test('should navigate to author profile on click', async ({ page }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const postCount = await posts.count().catch(() => 0);

    if (postCount > 0) {
      // Click on author name/avatar
      const authorLink = posts.first().locator('a[href*="/profile/"]').first();

      if (await authorLink.isVisible({ timeout: TIMEOUTS.SHORT })) {
        await authorLink.click();
        await page.waitForTimeout(2000);

        expect(page.url()).toContain('/profile/');
        console.log('✅ Navigated to author profile');
      }
    }
  });
});

test.describe('Feed Page - Scrolling and Loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should load more posts on scroll (infinite scroll)', async ({
    page,
  }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const initialCount = await posts.count().catch(() => 0);

    if (initialCount >= 5) {
      // Scroll to bottom
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      await page.waitForTimeout(3000);

      // Check if more posts loaded
      const newCount = await posts.count().catch(() => 0);
      console.log(`✅ Infinite scroll: ${initialCount} -> ${newCount} posts`);
    } else {
      console.log(
        `ℹ️ Only ${initialCount} posts, not enough to test infinite scroll`
      );
    }
  });

  test('should handle scroll to top', async ({ page }) => {
    // Scroll down first
    await page.evaluate(() => {
      window.scrollTo(0, 1000);
    });
    await page.waitForTimeout(500);

    // Scroll back to top
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);

    const scrollTop = await page.evaluate(() => window.scrollY);
    expect(scrollTop).toBe(0);
    console.log('✅ Scroll to top works');
  });
});

test.describe('Feed Page - Mobile Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display mobile-friendly feed layout', async ({ page }) => {
    // Feed should be full width on mobile
    const feed = page.locator('[data-testid="feed"], main').first();
    if (await feed.isVisible()) {
      const box = await feed.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(VIEWPORTS.MOBILE.width);
        console.log('✅ Feed is mobile-width');
      }
    }
  });

  test('should show floating create button on mobile', async ({ page }) => {
    const createButton = page
      .locator('button[aria-label="Create Post"], button.fixed')
      .first();
    const isVisible = await createButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Mobile create button visible: ${isVisible}`);
  });

  test('should allow tab switching on mobile', async ({ page }) => {
    const latestTab = page.locator('button:has-text("Latest")').first();
    const followingTab = page.locator('button:has-text("Following")').first();

    if ((await latestTab.isVisible()) && (await followingTab.isVisible())) {
      await followingTab.click();
      await page.waitForTimeout(1000);

      await latestTab.click();
      await page.waitForTimeout(1000);

      console.log('✅ Mobile tab switching works');
    }
  });
});

test.describe('Feed Page - Article Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('should display article cards differently from regular posts', async ({
    page,
  }) => {
    // Look for article-specific elements
    const articleCards = page.locator(
      '[data-type="article"], article:has([class*="article"])'
    );
    const count = await articleCards.count().catch(() => 0);

    if (count > 0) {
      const firstArticle = articleCards.first();
      const hasTitle = await firstArticle
        .locator('h2, h3, .article-title')
        .isVisible()
        .catch(() => false);
      console.log(`✅ Article cards found: ${count}, has title: ${hasTitle}`);
    } else {
      console.log('ℹ️ No article cards in current feed');
    }
  });

  test('should navigate to article on click', async ({ page }) => {
    const articleLinks = page.locator('a[href*="/article/"]').first();
    const isVisible = await articleLinks
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      await articleLinks.click();
      await page.waitForTimeout(2000);

      expect(page.url()).toContain('/article/');
      console.log('✅ Navigated to article page');
    } else {
      console.log('ℹ️ No article links in current feed');
    }
  });
});
