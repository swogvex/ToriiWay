import { defineConfig, devices } from '@playwright/test';

const port = 4321;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'light', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
  ],
  webServer: {
    command: `pnpm exec astro preview --port ${port}`,
    // JLPT runs live in memory, so e2e needs no database. The admin login below is a
    // test-only account (password "e2e-admin-password"), never used anywhere else.
    env: {
      JLPT_MEMORY_STORE: 'true',
      ADMIN_USER: 'e2e-admin',
      ADMIN_PASSWORD_HASH:
        'scrypt$16384$8$1$Kb5L2DjKOdgQyFFB9PMWUw==$M2McMOsPYICk4Xg5sxRNSAAQ6vQB5FwFRnRuRxH4oL8=',
    },
    port,
    reuseExistingServer: !process.env.CI,
  },
});
