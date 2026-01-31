import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Deze configuratie draait tests tegen localhost:3000
 * en genereert uitgebreide rapportages voor debugging.
 */
export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Parallellisatie - niet parallel om database conflicts te voorkomen
  fullyParallel: false,

  // Forbid test.only in CI
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Single worker for consistent database state
  workers: 1,

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for all tests
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Timeouts - verhoogd voor AI verwerking
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },

  // Global timeout per test - verhoogd voor AI verwerkingstijd
  timeout: 120000,

  // Configure projects
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
