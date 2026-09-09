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

test('mobile tab navigation shows a destination skeleton before a delayed route is ready', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-390', 'One mobile viewport is enough for transition timing evidence.');

  await page.goto('/app');
  await completeFreshOnboarding(page);

  await page.route('**/app/transactions*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.has('_rsc') || route.request().resourceType() === 'fetch') {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    await route.continue();
  });

  const transactionsLink = page
    .getByRole('navigation', { name: 'Mobile' })
    .getByRole('link', { name: 'Transactions', exact: true });

  await transactionsLink.evaluate((element) => (element as HTMLElement).click());

  const overlay = page.locator('[data-navigation-loading]');
  await expect(overlay).toBeVisible({ timeout: 500 });
  await expect(overlay.locator('[data-route-skeleton="transactions"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeHidden();

  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible({ timeout: 5000 });
  await expect(overlay).toBeHidden();
});
