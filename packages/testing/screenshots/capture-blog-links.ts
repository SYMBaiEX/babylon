/**
 * Screenshot capture script for blog link feature
 * Captures desktop and mobile views of the landing page
 */

import path from 'path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, 'output');

async function captureScreenshots() {
  console.log('Starting screenshot capture...');

  const browser = await chromium.launch({ headless: true });

  // Desktop screenshots
  console.log('Capturing desktop views...');
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const desktopPage = await desktopContext.newPage();

  await desktopPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await desktopPage.waitForTimeout(2000);

  // Screenshot 1: Full landing page hero
  await desktopPage.screenshot({
    path: path.join(OUTPUT_DIR, '01-landing-hero-desktop.png'),
    fullPage: false,
  });
  console.log('✓ Captured: landing hero (desktop)');

  // Screenshot 2: Scroll to CTA section with blog link card
  // Find and scroll to the blog card using Playwright locator
  const readBlogCard = desktopPage.locator('a:has-text("Read Blog")').first();
  await readBlogCard.scrollIntoViewIfNeeded();
  await desktopPage.waitForTimeout(1000);

  await desktopPage.screenshot({
    path: path.join(OUTPUT_DIR, '02-cta-section-blog-card-desktop.png'),
    fullPage: false,
  });
  console.log('✓ Captured: CTA section with blog card (desktop)');

  // Screenshot 3: Footer with blog link
  await desktopPage.evaluate(() =>
    window.scrollTo(0, document.body.scrollHeight)
  );
  await desktopPage.waitForTimeout(1000);

  await desktopPage.screenshot({
    path: path.join(OUTPUT_DIR, '03-footer-blog-link-desktop.png'),
    fullPage: false,
  });
  console.log('✓ Captured: footer with blog link (desktop)');

  await desktopContext.close();

  // Mobile screenshots
  console.log('Capturing mobile views...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();

  await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(2000);

  // Screenshot 4: Mobile hero
  await mobilePage.screenshot({
    path: path.join(OUTPUT_DIR, '04-landing-hero-mobile.png'),
    fullPage: false,
  });
  console.log('✓ Captured: landing hero (mobile)');

  // Screenshot 5: Mobile CTA section
  const mobileBlogCard = mobilePage.locator('a:has-text("Read Blog")').first();
  await mobileBlogCard.scrollIntoViewIfNeeded();
  await mobilePage.waitForTimeout(500);

  await mobilePage.screenshot({
    path: path.join(OUTPUT_DIR, '05-cta-section-blog-card-mobile.png'),
    fullPage: false,
  });
  console.log('✓ Captured: CTA section with blog card (mobile)');

  // Screenshot 6: Mobile footer
  await mobilePage.evaluate(() =>
    window.scrollTo(0, document.body.scrollHeight)
  );
  await mobilePage.waitForTimeout(1000);

  await mobilePage.screenshot({
    path: path.join(OUTPUT_DIR, '06-footer-blog-link-mobile.png'),
    fullPage: false,
  });
  console.log('✓ Captured: footer with blog link (mobile)');

  await mobileContext.close();
  await browser.close();

  console.log(`\n✅ All screenshots saved to: ${OUTPUT_DIR}`);
}

captureScreenshots().catch(console.error);
