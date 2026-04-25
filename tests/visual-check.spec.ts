import { test, expect } from '@playwright/test';

test('mobile view', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('http://localhost:4173');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/mobile-view.png', fullPage: true });
});

test('dark mode visual', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('http://localhost:4173');
  await page.click('button:has-text("Einstellungen")');
  await page.waitForTimeout(500);
  await page.click('button[aria-label="Toggle Dark Mode"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/dark-mode-mobile.png', fullPage: true });
});

test('desktop view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:4173');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/desktop-view.png', fullPage: true });
});
