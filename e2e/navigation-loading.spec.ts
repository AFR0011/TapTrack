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

test('mobile client navigation does not use a click-capture blocking overlay', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-390', 'One mobile viewport is enough for navigation lifecycle evidence.');

  await page.goto('/app');
  await completeFreshOnboarding(page);

  const overlay = page.locator('[data-navigation-loading]');
  await expect(overlay).toHaveCount(0);

  const transactionsLink = page
    .getByRole('navigation', { name: 'Mobile' })
    .getByRole('link', { name: 'Transactions', exact: true });

  await transactionsLink.click();

  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible({ timeout: 5000 });
  await expect(overlay).toHaveCount(0);
});
