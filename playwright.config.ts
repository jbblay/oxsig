import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.OXSIG_E2E_PORT || 3100);
const baseURL = process.env.OXSIG_E2E_BASE_URL || `http://127.0.0.1:${port}`;
const webServerCommand = process.env.CI
  ? `pnpm exec next start -H 127.0.0.1 -p ${port}`
  : 'pnpm dev';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.OXSIG_E2E_BASE_URL
    ? undefined
    : {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          PORT: String(port),
          OXSIG_HOST: '127.0.0.1',
          OXSIG_APP_HOST: '127.0.0.1',
        },
      },
});
