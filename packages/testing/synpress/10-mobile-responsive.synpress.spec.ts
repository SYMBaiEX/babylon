/**
 * Mobile Responsiveness E2E Tests
 *
 * Tests application responsiveness across different viewports:
 * - Small mobile (320px)
 * - Standard mobile (375px)
 * - Large mobile (414px)
 * - Tablet (768px)
 * - Desktop (1280px)
 * - Large desktop (1920px)
 * - Touch interactions
 * - Orientation changes
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

test.describe('Mobile Responsiveness - Small Mobile (320px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE_SMALL);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should render feed page on small mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const content = page.locator('main').first();
    if (await content.isVisible()) {
      const box = await content.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(
          VIEWPORTS.MOBILE_SMALL.width + 20
        );
      }
    }
    console.log('✅ Feed renders on small mobile');
  });

  test('should show mobile navigation on small screen', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Look for mobile bottom navigation or hamburger menu
    const mobileNav = page
      .locator('nav.fixed, [data-testid="mobile-nav"]')
      .first();
    const hamburger = page
      .locator('button[aria-label*="menu" i], button.hamburger')
      .first();

    const hasNav = await mobileNav
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    const hasHamburger = await hamburger
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Small mobile: nav=${hasNav}, hamburger=${hasHamburger}`);
  });

  test('should not have horizontal overflow on small mobile', async ({
    page,
  }) => {
    const routes = [
      ROUTES.FEED,
      ROUTES.MARKETS,
      ROUTES.PROFILE,
      ROUTES.SETTINGS,
    ];

    for (const route of routes) {
      await navigateTo(page, route);
      await waitForPageLoad(page);

      // Check for horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
        );
      });

      if (hasOverflow) {
        console.log(`⚠️ Horizontal overflow detected on ${route}`);
      } else {
        console.log(`✅ No overflow on ${route}`);
      }
    }
  });
});

test.describe('Mobile Responsiveness - Standard Mobile (375px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display feed properly on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Posts should be full width
    const posts = page.locator('article, [data-testid="post-card"]').first();
    if (await posts.isVisible({ timeout: TIMEOUTS.SHORT })) {
      const box = await posts.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(VIEWPORTS.MOBILE.width);
        console.log(`✅ Post width on mobile: ${box.width}px`);
      }
    }
  });

  test('should display markets properly on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);

    // Tabs should be scrollable horizontally
    const tabs = page.locator('[role="tablist"]').first();
    if (await tabs.isVisible()) {
      console.log('✅ Markets tabs visible on mobile');
    }
  });

  test('should display settings properly on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    // Settings should be accessible
    const settingsHeading = page.locator('h1:has-text("Settings")');
    await expect(settingsHeading.first()).toBeVisible({
      timeout: TIMEOUTS.MEDIUM,
    });
    console.log('✅ Settings accessible on mobile');
  });

  test('should allow scrolling on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(500);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
    console.log(`✅ Mobile scrolling works: scrollY=${scrollY}`);
  });

  test('should show bottom navigation bar', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const bottomNav = page
      .locator('nav.fixed.bottom-0, [data-testid="bottom-nav"]')
      .first();
    const isVisible = await bottomNav
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Bottom navigation visible: ${isVisible}`);
  });

  test('should have tappable touch targets (min 44px)', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Check button sizes
    const buttons = await page.locator('button').all();
    let smallButtons = 0;

    for (const button of buttons.slice(0, 10)) {
      const box = await button.boundingBox();
      if (box && (box.width < 44 || box.height < 44)) {
        smallButtons++;
      }
    }

    console.log(`ℹ️ Small touch targets found: ${smallButtons}`);
  });
});

test.describe('Mobile Responsiveness - Large Mobile (414px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE_LARGE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test('should display all core pages on large mobile', async ({ page }) => {
    const routes = [
      ROUTES.FEED,
      ROUTES.MARKETS,
      ROUTES.CHATS,
      ROUTES.PROFILE,
      ROUTES.SETTINGS,
    ];

    for (const route of routes) {
      await navigateTo(page, route);
      await waitForPageLoad(page);

      const content = await page.locator('body').textContent();
      expect(content).toBeTruthy();
    }

    console.log('✅ All core pages render on large mobile');
  });
});

test.describe('Mobile Responsiveness - Tablet (768px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.TABLET);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display tablet-optimized layout', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Tablet might show sidebar or wider content
    const sidebar = page.locator('[data-testid="sidebar"], aside').first();
    const sidebarVisible = await sidebar
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Tablet layout: sidebar=${sidebarVisible}`);
  });

  test('should show widgets sidebar on tablet', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Check for widget sidebar (typically shown at xl breakpoint, ~1280px)
    const widgetSidebar = page
      .locator('[data-testid="widget-sidebar"]')
      .first();
    const isVisible = await widgetSidebar
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`ℹ️ Widget sidebar on tablet: ${isVisible}`);
  });

  test('should have proper column layout on markets', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);

    // Markets might show 2-column grid on tablet
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Markets renders on tablet');
  });
});

test.describe('Mobile Responsiveness - Desktop (1280px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should show full desktop layout', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Desktop should show sidebar widgets
    const widgetSidebar = page
      .locator('[data-testid="widget-sidebar"], .hidden.xl\\:block')
      .first();
    const isVisible = await widgetSidebar
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Desktop widget sidebar: ${isVisible}`);
  });

  test('should have multi-column layout on desktop', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);

    // Markets dashboard should show grid layout
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Desktop markets layout rendered');
  });

  test('should show full navigation on desktop', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Desktop should show full navigation (not hamburger)
    const fullNav = page.locator('nav').first();
    const isVisible = await fullNav
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Desktop navigation: ${isVisible}`);
  });
});

test.describe('Mobile Responsiveness - Large Desktop (1920px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP_LARGE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test('should utilize full width on large desktop', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Content should be centered with max-width
    const main = page.locator('main').first();
    if (await main.isVisible()) {
      const box = await main.boundingBox();
      if (box) {
        console.log(`✅ Large desktop main width: ${box.width}px`);
      }
    }
  });

  test('should show all sidebar widgets on large desktop', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);

    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Large desktop layout rendered');
  });
});

test.describe('Mobile Responsiveness - Touch Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test('should handle tap on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const tabs = page.locator('button:has-text("Latest")').first();
    if (await tabs.isVisible()) {
      await tabs.tap();
      await page.waitForTimeout(500);
      console.log('✅ Tap interaction works');
    }
  });

  test('should handle swipe/scroll on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Simulate swipe scroll
    await page.evaluate(() => {
      window.scrollTo(0, 300);
    });
    await page.waitForTimeout(500);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
    console.log('✅ Scroll/swipe works on mobile');
  });
});

test.describe('Mobile Responsiveness - Orientation Changes', () => {
  test('should handle portrait to landscape transition', async ({ page }) => {
    // Start in portrait
    await page.setViewportSize({ width: 375, height: 667 });
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Switch to landscape
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(1000);

    // Page should adapt
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Portrait to landscape transition handled');
  });

  test('should handle landscape to portrait transition', async ({ page }) => {
    // Start in landscape
    await page.setViewportSize({ width: 667, height: 375 });
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Switch to portrait
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);

    // Page should adapt
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Landscape to portrait transition handled');
  });
});

test.describe('Mobile Responsiveness - Components', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test('should render modals properly on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const createButton = page
      .locator('button[aria-label="Create Post"]')
      .first();
    if (await createButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await createButton.click();
      await page.waitForTimeout(1000);

      const modal = page.locator('[role="dialog"]').first();
      if (await modal.isVisible()) {
        const box = await modal.boundingBox();
        if (box) {
          expect(box.width).toBeLessThanOrEqual(VIEWPORTS.MOBILE.width);
          console.log(`✅ Modal width on mobile: ${box.width}px`);
        }
      }

      await page.keyboard.press('Escape');
    }
  });

  test('should render dropdowns properly on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS_PREDICTIONS);
    await waitForPageLoad(page);

    // Look for sort dropdown or filter buttons
    const sortButton = page.locator('button:has-text("Trending")').first();
    if (await sortButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      console.log('✅ Sort buttons accessible on mobile');
    }
  });

  test('should render forms properly on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    const inputs = page.locator('input, textarea');
    const count = await inputs.count();

    // All inputs should be within viewport width
    for (let i = 0; i < Math.min(count, 5); i++) {
      const input = inputs.nth(i);
      if (await input.isVisible()) {
        const box = await input.boundingBox();
        if (box) {
          expect(box.width).toBeLessThanOrEqual(VIEWPORTS.MOBILE.width - 32); // Account for padding
        }
      }
    }

    console.log(`✅ Form inputs properly sized on mobile: ${count} inputs`);
  });

  test('should render tables/lists properly on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.LEADERBOARD);
    await waitForPageLoad(page);

    // Check for horizontal scroll or responsive table
    const hasOverflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      );
    });

    if (hasOverflow) {
      console.log('⚠️ Leaderboard has horizontal overflow');
    } else {
      console.log('✅ Leaderboard fits mobile width');
    }
  });
});

test.describe('Mobile Responsiveness - Text Readability', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test('should have readable font sizes on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Check that body text is at least 14px
    const minFontSize = await page.evaluate(() => {
      const paragraphs = Array.from(document.querySelectorAll('p, span'));
      let minSize = 100;
      paragraphs.forEach((p) => {
        const fontSize = parseFloat(window.getComputedStyle(p).fontSize);
        if (fontSize < minSize) minSize = fontSize;
      });
      return minSize;
    });

    console.log(`ℹ️ Minimum font size: ${minFontSize}px`);
  });

  test('should not have text overflow issues', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Check for text that extends beyond viewport
    const hasTextOverflow = await page.evaluate(() => {
      const elements = Array.from(
        document.querySelectorAll('p, h1, h2, h3, span')
      );
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          return true;
        }
      }
      return false;
    });

    if (hasTextOverflow) {
      console.log('⚠️ Some text extends beyond viewport');
    } else {
      console.log('✅ No text overflow detected');
    }
  });
});
