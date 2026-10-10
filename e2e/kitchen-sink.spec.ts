import {capture} from './capture.js';
import {test} from './fixtures.js';
import { expect} from '@playwright/test';
import axe from 'axe-core';

const treatmentLabels = ['In the clear', 'Tokenized', 'Masked', 'By reference', 'Aggregate only', 'Withheld', 'Needs a decision'];

test('O-005: kitchen sink has no axe violations', async ({ page }) => {
  await page.goto('/dev/kitchen-sink');
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => (await axe.run()).violations);
  expect(violations).toEqual([]);
});

test('O-006 and O-007: every spectrum badge includes its mark and text label', async ({ page }) => {
  await page.goto('/dev/kitchen-sink');
  const badges = page.locator('.speclegend .tr');
  await expect(badges).toHaveCount(treatmentLabels.length);
  await expect(badges.locator('[data-mark-category="treatment"]')).toHaveCount(6);
  await expect(badges.locator('i')).toHaveCount(0);
  for(const kind of ['clear','tokenized','masked','aggregate','withheld','undecided'])await expect(badges.locator(`[data-mark="treatment-${kind}"]`)).toHaveCount(1);
  await expect(badges.filter({hasText:'By reference'}).locator('[data-mark]')).toHaveCount(0);
  for (const label of treatmentLabels) await expect(badges.filter({ hasText: label })).toHaveCount(1);
});

test('O-008: reduced motion disables the kitchen sink transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/kitchen-sink');
  const motion = await page.locator('.screen.on').evaluate((element) => {
    const style = globalThis.getComputedStyle(element);
    return { animationName: style.animationName, transitionProperty: style.transitionProperty };
  });
  expect(motion).toEqual({ animationName: 'none', transitionProperty: 'none' });
});

for (const width of [390, 900, 1440]) {
  test(`O-009: kitchen sink visual snapshot at ${width}px`, { tag: '@visual' }, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/dev/kitchen-sink');
    await capture(page,test.info(),`kitchen-sink-${width}.png`, { animations: 'disabled', fullPage: true });
  });
}
