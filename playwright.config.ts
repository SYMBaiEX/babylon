import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local and .env
dotenv.config({ path: path.resolve(__dirname, '.env.local') })
dotenv.config({ path: path.resolve(__dirname, '.env') })

/**
 * Playwright configuration for E2E tests
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',

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

  /* Configure projects for major browsers */
  projects: [
    // Setup project - runs once before all tests to authenticate
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      testDir: './tests/e2e',
    },

    // Integration auth setup - extracts tokens from authenticated browser context
    {
      name: 'setup-integration-auth',
      testMatch: /.*integration.*\.setup\.ts/,
      testDir: './tests/integration',
      use: {
        // Use authenticated state from E2E setup
        storageState: '.playwright/auth.json',
      },
      dependencies: ['setup'],
    },

    // Main test project - depends on setup and uses saved auth state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use authenticated state from setup
        storageState: '.playwright/auth.json',
      },
      dependencies: ['setup'],
      testIgnore: ['**/*.api.test.ts', '**/*.e2e.test.ts'], // Ignore API/E2E tests that don't need browser auth or have their own flow
    },

    // API/E2E Tests - requires auth for API calls with cookies
    {
      name: 'api-e2e',
      testMatch: ['**/*.e2e.test.ts'],
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
    },

    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: {
    //     ...devices['Desktop Firefox'],
    //     storageState: '.playwright/auth.json',
    //   },
    //   dependencies: ['setup'],
    // },
    // {
    //   name: 'webkit',
    //   use: {
    //     ...devices['Desktop Safari'],
    //     storageState: '.playwright/auth.json',
    //   },
    //   dependencies: ['setup'],
    // },
  ],

  /* Run your local dev server before starting the tests */
  // In CI, server is started separately in workflow
  // Locally, Playwright will start the dev server
  webServer: process.env.CI ? undefined : {
    command: 'bun run scripts/pre-dev/pre-dev-local.ts && bunx next dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
