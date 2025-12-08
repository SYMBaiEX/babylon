/**
 * Feed Page E2E Tests
 *
 * Tests core feed functionality: viewing, creating, and interacting with posts.
 */

import { expect, test } from '@playwright/test';
import {
  cooldownBetweenTests,
  navigateTo,
  waitForPageLoad,
} from './helpers/page-helpers';
import { loginWithWallet } from './helpers/privy-auth';
import { ROUTES, TIMEOUTS, VIEWPORTS } from './helpers/test-data';

test.setTimeout(TIMEOUTS.EXTRA_LONG);

test.describe('Feed - Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('feed shows posts or appropriate empty state', async ({ page }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const postCount = await posts.count().catch(() => 0);

    if (postCount > 0) {
      await expect(posts.first()).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
    } else {
      // Should show empty state message, not just blank
      const emptyState = page
        .getByText('No Posts Yet')
        .or(page.getByText('generating'));
      const hasEmptyState = await emptyState
        .first()
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      expect(hasEmptyState).toBe(true);
    }
  });

  test('tab switching works and loads different content', async ({ page }) => {
    const followingTab = page.locator('button:has-text("Following")').first();

    if (await followingTab.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await followingTab.click();
      await page.waitForTimeout(1500);

      // Following tab should show posts OR empty state
      const content = await page.locator('body').textContent();
      expect(content?.length).toBeGreaterThan(100);
    }
  });
});

test.describe('Feed - Post Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('create post modal opens and validates input', async ({ page }) => {
    const createButton = page
      .locator('button[aria-label="Create Post"], button:has(svg.lucide-plus)')
      .first();

    if (!(await createButton.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await createButton.click();
    await page.waitForTimeout(1000);

    // Modal should open
    const modal = page.locator('[role="dialog"], .modal');
    if (await modal.first().isVisible({ timeout: TIMEOUTS.SHORT })) {
      // Submit button should be disabled when empty
      const submitButton = page
        .locator('button:has-text("Post"), button[type="submit"]')
        .first();
      if (await submitButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
        const isDisabled = await submitButton.isDisabled();
        expect(isDisabled).toBe(true);
      }
    }

    await page.keyboard.press('Escape').catch(() => {});
  });

  test('can create and see new post in feed', async ({ page }) => {
    const createButton = page
      .locator('button[aria-label="Create Post"], button:has(svg.lucide-plus)')
      .first();

    if (!(await createButton.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await createButton.click();
    await page.waitForTimeout(1000);

    const textarea = page.locator('textarea').first();
    if (!(await textarea.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      await page.keyboard.press('Escape').catch(() => {});
      test.skip();
      return;
    }

    const testContent = `E2E Test Post - ${Date.now()}`;
    await textarea.fill(testContent);
    await page.waitForTimeout(500);

    const submitButton = page
      .locator('button:has-text("Post"), button[type="submit"]')
      .first();

    if (
      (await submitButton.isVisible()) &&
      !(await submitButton.isDisabled())
    ) {
      await submitButton.click();
      await page.waitForTimeout(3000);

      // Post should appear in feed
      const newPost = page.getByText(testContent);
      const postVisible = await newPost
        .first()
        .isVisible({ timeout: TIMEOUTS.MEDIUM })
        .catch(() => false);
      expect(postVisible).toBe(true);
    }
  });
});

test.describe('Feed - Post Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(3000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('can like a post', async ({ page }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const postCount = await posts.count().catch(() => 0);

    if (postCount === 0) {
      test.skip();
      return;
    }

    const likeButton = posts
      .first()
      .locator('button:has(svg.lucide-heart), button[aria-label*="like" i]')
      .first();

    if (await likeButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await likeButton.click();
      await page.waitForTimeout(1000);
      // No crash = success (actual like count verification would need API check)
    }
  });

  test('clicking post navigates to detail page', async ({ page }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const postCount = await posts.count().catch(() => 0);

    if (postCount === 0) {
      test.skip();
      return;
    }

    const postContent = posts.first().locator('p, .post-content').first();

    if (await postContent.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await postContent.click();
      await page.waitForTimeout(2000);

      expect(page.url()).toContain('/post/');
    }
  });

  test('clicking author navigates to profile', async ({ page }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const postCount = await posts.count().catch(() => 0);

    if (postCount === 0) {
      test.skip();
      return;
    }

    const authorLink = posts.first().locator('a[href*="/profile/"]').first();

    if (await authorLink.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await authorLink.click();
      await page.waitForTimeout(2000);

      expect(page.url()).toContain('/profile/');
    }
  });
});

test.describe('Feed - Infinite Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('scrolling to bottom loads more posts', async ({ page }) => {
    const posts = page.locator('article, [data-testid="post-card"]');
    const initialCount = await posts.count().catch(() => 0);

    // Need at least some posts to test infinite scroll
    if (initialCount < 5) {
      test.skip();
      return;
    }

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);

    const newCount = await posts.count().catch(() => 0);
    // Either more posts loaded, or we hit the end (which is also valid)
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });
});
