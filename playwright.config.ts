import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/*.performance.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // The list summary names tests that passed only on retry as flaky.
  reporter: [['./e2e/recorded-performance-reporter.ts'], ['list']],
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
  // Compile once before any scenario deadline; never reuse an unrelated dev server.
  webServer: {
    command: 'VITE_CONSOLE_NEXT=true npm run build -- --mode browser-test && npm exec vite preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    // Build/startup budget, outside every scenario deadline.
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
