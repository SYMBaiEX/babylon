/**
 * Playwright configuration for E2E tests.
 *
 * This config is for standard Playwright tests (not Synpress/MetaMask).
 * For MetaMask wallet tests, use synpress.config.ts instead.
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

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

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
  reporter: [['list']],

  /* Shared settings for all the projects below */
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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

  webServer:
    process.env.CI || process.env.PLAYWRIGHT_SKIP_WEBSERVER
      ? undefined
      : {
          command: `cd ${rootDir}/apps/web && bunx next dev`,
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
});
