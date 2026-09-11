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
  await page.getByRole('button', { name: 'Open Ravel' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
}

test('settings navigation and local preferences remain usable offline on mobile', async ({ page, context }) => {
  await page.goto('/app');
  await completeFreshOnboarding(page);
  await expect(page.locator('html')).toHaveAttribute('data-offline-shell', 'ready', { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const settingsNavigation = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(settingsNavigation).toBeVisible();
  await expect(settingsNavigation.getByRole('link')).toHaveCount(5);
  await assertNoHorizontalOverflow(page);

  await settingsNavigation.getByRole('link', { name: /General/ }).click();
  const general = page.locator('[data-settings-section="general"]');
  await expect(general).toBeVisible();
  await expect(settingsNavigation).toBeHidden();

  const method = general.getByRole('combobox', { name: 'Default payment method', exact: true });
  await expect(method).toHaveValue('card');
  await method.selectOption('cash');
  await expect(method).toHaveValue('cash');

  const darkMode = general.getByRole('switch', { name: 'Dark mode', exact: true });
  await expect(darkMode).toHaveAttribute('aria-checked', 'false');
  await darkMode.click();
  await expect(darkMode).toHaveAttribute('aria-checked', 'true');
  await assertNoHorizontalOverflow(page);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const reloadedGeneral = page.locator('[data-settings-section="general"]');
  await expect(reloadedGeneral).toBeVisible();
  await expect(
    reloadedGeneral.getByRole('combobox', { name: 'Default payment method', exact: true })
  ).toHaveValue('cash');
  await expect(reloadedGeneral.getByRole('switch', { name: 'Dark mode', exact: true })).toHaveAttribute('aria-checked', 'true');
  await assertNoHorizontalOverflow(page);

  await page.goto('/app/settings#data');
  const dataSection = page.locator('[data-settings-section="data"]');
  await expect(dataSection).toBeVisible();
  await expect(dataSection.getByRole('button', { name: 'Export CSV', exact: true })).toBeVisible();
  await expect(dataSection.getByRole('button', { name: 'Download backup', exact: true })).toBeVisible();
  await expect(dataSection.getByRole('button', { name: 'Choose backup', exact: true })).toBeVisible();
  await expect(dataSection.getByRole('button', { name: 'Reset Ravel data', exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
