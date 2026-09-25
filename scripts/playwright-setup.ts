import { chromium } from '@playwright/test';

/** Report the actual bundled binary, not the auto-updating system browser. */
export default async function browserVersion(): Promise<void> {
  const browser = await chromium.launch();
  try {
    console.log(`[Playwright] Bundled Chromium ${browser.version()}`);
  } finally {
    await browser.close();
  }
}
