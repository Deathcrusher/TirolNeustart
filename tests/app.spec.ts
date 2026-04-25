import { test, expect } from '@playwright/test';

test('homepage loads', async ({ page }) => {
  await page.goto('http://localhost:4173');
  await expect(page.locator('text=TirolNeustart')).toBeVisible();
});

test('dark mode toggle works', async ({ page }) => {
  await page.goto('http://localhost:4173');
  await page.click('button:has-text("Einstellungen")');
  await expect(page.locator('text=Dark Mode')).toBeVisible();
});