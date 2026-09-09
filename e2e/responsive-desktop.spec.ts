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
}

async function assertNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
}

async function expectSideBySide(left: ReturnType<Page['locator']>, right: ReturnType<Page['locator']>) {
  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  if (!leftBox || !rightBox) return;
  expect(rightBox.x).toBeGreaterThan(leftBox.x + leftBox.width - 8);
  expect(Math.abs(rightBox.y - leftBox.y)).toBeLessThan(24);
}

test('desktop dashboard, transactions, budgets, and reports use responsive compositions', async ({ page }) => {
  await page.goto('/app');
  await completeFreshOnboarding(page);

  const desktopNav = page.getByRole('navigation', { name: 'Primary' });
  await expect(desktopNav).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeHidden();

  const main = page.locator('#main-content');
  const mainBox = await main.boundingBox();
  expect(mainBox?.width ?? 0).toBeGreaterThan(1100);

  const dashboardLayout = page.locator('[data-layout="dashboard-summary"]');
  await expect(dashboardLayout).toBeVisible();
  await expectSideBySide(
    dashboardLayout.locator('[data-dashboard-column="primary"]'),
    dashboardLayout.locator('[data-dashboard-column="secondary"]')
  );
  await assertNoHorizontalOverflow(page);

  await desktopNav.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();
  const transactionsMainBox = await main.boundingBox();
  expect(transactionsMainBox?.width ?? 0).toBeGreaterThan(1100);
  await expect(page.getByRole('group', { name: 'Transaction date scope' })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);

  await desktopNav.getByRole('link', { name: 'Budgets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible();
  const budgetsLayout = page.locator('[data-layout="budgets-content"]');
  await expect(budgetsLayout).toBeVisible();
  await expectSideBySide(budgetsLayout.locator(':scope > section').nth(0), budgetsLayout.locator(':scope > section').nth(1));
  await assertNoHorizontalOverflow(page);

  await desktopNav.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  const reportsLayout = page.locator('[data-layout="reports-summary"]');
  await expect(reportsLayout).toBeVisible();
  await expectSideBySide(reportsLayout.locator(':scope > section').nth(0), reportsLayout.locator(':scope > section').nth(1));
  await assertNoHorizontalOverflow(page);
});
