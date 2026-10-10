import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/*.performance.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // The list summary names tests that passed only on retry as flaky.
  reporter: [['list'], ['./e2e/recorded-performance-reporter.ts']],
  globalSetup: './scripts/playwright-setup.ts',
  retries: 0,
  projects: [
    { name: 'functional', grepInvert: /@visual/, retries: 0 },
    { name: 'visual-snapshots', grep: /@visual/, retries: 1 },
  ],
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: { args: [
      '--disable-gpu',
      '--disable-partial-raster',
      '--disable-skia-runtime-opts',
      '--disable-lcd-text',
      '--font-render-hinting=none',
      '--force-color-profile=srgb',
      '--force-device-scale-factor=1',
    ] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
