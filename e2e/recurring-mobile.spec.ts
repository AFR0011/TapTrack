import { expect, test, type Page } from '@playwright/test';

async function completeFreshOnboarding(page: Page) {
  await expect(page.getByRole('heading', { name: 'Track money without slowing down.' })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Choose the currencies you use.' })).toBeVisible();
  await page.getByLabel('Cash', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Make daily logging faster.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'You’re ready.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open TapTrack' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
}

test('recurring editor fits mobile and can save a rule offline', async ({ page, context }) => {
  await page.goto('/app');
  await completeFreshOnboarding(page);
  await expect(page.locator('html')).toHaveAttribute('data-offline-shell', 'ready', { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.goto('/app/recurring');
  await expect(page.getByRole('heading', { name: 'Recurring', exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'New recurring', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'New recurring transaction', exact: true })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Recurring transaction type' })).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await dialog.getByLabel('Amount', { exact: true }).fill('25');
  await dialog.getByLabel('Description', { exact: true }).fill('offline recurring test');
  await dialog.getByRole('button', { name: 'Save recurring', exact: true }).click();

  await expect(dialog).toBeHidden();
  const rule = page.locator('[data-recurring-rule]');
  await expect(rule).toHaveCount(1);
  await expect(rule.getByRole('heading', { name: 'offline recurring test', exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
