/**
 * Playwright configuration for E2E tests.
 *
 * @module testing/playwright.config
 * @see https://playwright.dev/docs/test-configuration
 */

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

const rootDir = path.resolve(__dirname, '../..');
dotenv.config({ path: path.resolve(rootDir, '.env.local') });
dotenv.config({ path: path.resolve(rootDir, '.env') });
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Run tests serially to avoid race conditions */
  workers: 1,

  /* Reporter to use */
  reporter: [
    ['list'], // Console output only, no blocking HTML report
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',

    /* Launch Options to prevent CI crashes */
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      testDir: './e2e',
    },
    {
      name: 'setup-integration-auth',
      testMatch: /.*integration.*\.setup\.ts/,
      testDir: './integration',
      use: {
        storageState: path.resolve(rootDir, '.playwright/auth.json'),
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(rootDir, '.playwright/auth.json'),
      },
      dependencies: ['setup'],
      testIgnore: ['**/*.api.test.ts', '**/*.e2e.test.ts'],
    },
    {
      name: 'api-e2e',
      testMatch: ['**/*.e2e.test.ts'],
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: `cd ${rootDir} && bunx next dev --dir apps/web`,
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120 * 1000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
