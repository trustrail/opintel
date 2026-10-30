import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  projects: [{ name: 'conformance', testMatch: /(?:conformance-coverage|control-conformance)\.spec\.ts/, metadata: { controlConformance: true } }],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    // Single renderer policy for every suite; scenario groups must not override it.
    // CPU rasterisation plus explicit SwiftShader for the headless GL path.
    launchOptions: { args: [
      '--disable-gpu',
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
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
    command: 'npm run build -- --mode browser-test --outDir tmp/browser-build && node scripts/console-preview.mjs tmp/browser-build',
    url: 'http://127.0.0.1:4173',
    // Build/startup budget, outside every scenario deadline.
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
