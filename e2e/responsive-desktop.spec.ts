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

test('desktop app routes use responsive compositions through settings', async ({ page }) => {
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

  await desktopNav.locator('summary').filter({ hasText: 'More' }).click();
  let moreNavigation = desktopNav.getByRole('group', { name: 'More navigation' });
  await expect(moreNavigation).toBeVisible();
  await moreNavigation.getByRole('link', { name: 'Balances', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Balances', exact: true })).toBeVisible();

  const balancesMainBox = await main.boundingBox();
  expect(balancesMainBox?.width ?? 0).toBeGreaterThan(1000);
  const balancesGrid = page.locator('[data-layout="balances-grid"]');
  await expect(balancesGrid).toBeVisible();
  const balanceCards = balancesGrid.locator('[data-balance-currency]');
  if ((await balanceCards.count()) > 1) {
    await expectSideBySide(balanceCards.nth(0), balanceCards.nth(1));
  }

  const balanceRow = page.locator('[data-balance-method]').first();
  await expect(balanceRow).toBeVisible();
  await balanceRow.click();
  const balanceDialog = page.getByRole('dialog');
  await expect(balanceDialog).toBeVisible();
  await expect(balanceDialog.getByText('Current balance', { exact: true })).toBeVisible();
  await balanceDialog.getByRole('button', { name: 'Close' }).click();
  await expect(balanceDialog).toBeHidden();
  await assertNoHorizontalOverflow(page);

  await desktopNav.locator('summary').filter({ hasText: 'More' }).click();
  moreNavigation = desktopNav.getByRole('group', { name: 'More navigation' });
  await expect(moreNavigation).toBeVisible();
  await moreNavigation.getByRole('link', { name: 'Transfers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Transfers & exchanges', exact: true })).toBeVisible();

  const conversionsMainBox = await main.boundingBox();
  expect(conversionsMainBox?.width ?? 0).toBeGreaterThan(1000);
  const conversionsLayout = page.locator('[data-layout="conversions-workspace"]');
  await expect(conversionsLayout).toBeVisible();
  await expectSideBySide(
    conversionsLayout.locator('[data-conversions-column="editor"]'),
    conversionsLayout.locator('[data-conversions-column="preview"]')
  );
  const moveType = page.getByRole('group', { name: 'Move type' });
  await expect(moveType.getByRole('button', { name: 'Transfer', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-move-source]')).toBeVisible();
  await expect(page.locator('[data-move-destination]')).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await desktopNav.locator('summary').filter({ hasText: 'More' }).click();
  moreNavigation = desktopNav.getByRole('group', { name: 'More navigation' });
  await expect(moreNavigation).toBeVisible();
  await moreNavigation.getByRole('link', { name: 'Recurring', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recurring', exact: true })).toBeVisible();

  const recurringMainBox = await main.boundingBox();
  expect(recurringMainBox?.width ?? 0).toBeGreaterThan(1000);
  const recurringSummary = page.locator('[data-layout="recurring-summary"]');
  await expect(recurringSummary).toBeVisible();
  await expect(recurringSummary.locator(':scope > div')).toHaveCount(3);
  await page.getByRole('button', { name: 'New recurring', exact: true }).first().click();
  const recurringDialog = page.getByRole('dialog');
  await expect(recurringDialog).toBeVisible();
  await expect(recurringDialog.getByRole('heading', { name: 'New recurring transaction', exact: true })).toBeVisible();
  await expect(recurringDialog.getByRole('group', { name: 'Recurring transaction type' })).toBeVisible();
  await recurringDialog.getByRole('button', { name: 'Close' }).click();
  await expect(recurringDialog).toBeHidden();
  await assertNoHorizontalOverflow(page);

  await desktopNav.locator('summary').filter({ hasText: 'More' }).click();
  moreNavigation = desktopNav.getByRole('group', { name: 'More navigation' });
  await expect(moreNavigation).toBeVisible();
  await moreNavigation.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  const settingsMainBox = await main.boundingBox();
  expect(settingsMainBox?.width ?? 0).toBeGreaterThan(1000);
  const settingsLayout = page.locator('[data-layout="settings-workspace"]');
  const settingsNavigation = settingsLayout.locator('[data-settings-navigation]');
  const settingsPanel = settingsLayout.locator('[data-settings-panel="general"]');
  await expect(settingsNavigation).toBeVisible();
  await expect(settingsPanel).toBeVisible();
  await expectSideBySide(settingsNavigation, settingsPanel);
  await expect(page.locator('[data-settings-section="general"]')).toBeVisible();

  await settingsNavigation.getByRole('link', { name: /Data/ }).click();
  await expect(page.locator('[data-settings-section="data"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download backup', exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
