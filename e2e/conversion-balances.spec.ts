import { expect, test } from '@playwright/test';

test('exchange moves money between currency balances in the real browser workflow', async ({ page }) => {
  const today = new Date().toLocaleDateString('en-CA');

  await page.route('**/api/exchange-rates/currencies', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currencies: [
          { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
          { code: 'USD', name: 'US Dollar', symbol: '$' },
        ],
      }),
    });
  });

  await page.route('**/api/exchange-rates?**', async (route) => {
    const url = new URL(route.request().url());
    const base = url.searchParams.get('base') ?? 'USD';
    const quote = url.searchParams.get('quote') ?? 'TRY';
    const date = url.searchParams.get('date') ?? today;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        base,
        quote,
        dateRequested: date,
        dateUsed: date,
        rate: 40,
        source: 'Frankfurter',
        status: 'historical',
      }),
    });
  });

  await page.goto('/app');
  await page.getByRole('button', { name: 'Get started' }).click();

  await expect(page.getByRole('heading', { name: 'Choose the currencies you use.' })).toBeVisible();
  await page.getByLabel('Add another currency').selectOption('USD');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  const balanceCards = page.locator('div.mt-5.space-y-4').locator('> div');
  await balanceCards.filter({ hasText: 'TRY' }).getByLabel('Cash').fill('1000');
  await balanceCards.filter({ hasText: 'USD' }).getByLabel('Card').fill('100');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Open TapTrack' }).click();

  await page.goto('/app/conversions');
  await expect(page.getByRole('heading', { name: 'Transfers & exchanges' })).toBeVisible();
  await page.getByRole('button', { name: 'Exchange', exact: true }).click();

  const source = page.locator('[data-move-source]');
  const destination = page.locator('[data-move-destination]');
  await source.getByLabel('Currency').selectOption('USD');
  await source.getByLabel('Method').selectOption('card');
  await destination.getByLabel('Currency').selectOption('TRY');
  await destination.getByLabel('Method').selectOption('cash');
  await source.getByLabel('Amount to move').fill('10');

  await expect(destination.getByLabel('Destination amount')).toHaveValue('400.00');
  await page.getByRole('button', { name: 'Exchange USD to TRY' }).click();
  await expect(page.getByText('Exchange recorded.', { exact: true })).toBeVisible();

  await page.goto('/app/balances');
  await expect(page.getByRole('heading', { name: 'Balances' })).toBeVisible();

  const usd = page.locator('[data-balance-currency="USD"]');
  const tryBalance = page.locator('[data-balance-currency="TRY"]');
  await expect(usd.locator('[data-balance-method="card"]')).toContainText('90');
  await expect(tryBalance.locator('[data-balance-method="cash"]')).toContainText(/1[,.]?400/);
});
