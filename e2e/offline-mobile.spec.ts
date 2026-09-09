import { expect, test } from '@playwright/test';

const CORE_ROUTES = [
  { path: '/app', heading: 'Dashboard', nav: 'Dashboard', placement: 'primary' },
  { path: '/app/transactions', heading: 'Transactions', nav: 'Transactions', placement: 'primary' },
  { path: '/app/budgets', heading: 'Budgets', nav: 'Budgets', placement: 'primary' },
  { path: '/app/reports', heading: 'Reports', nav: 'Reports', placement: 'primary' },
  { path: '/app/balances', heading: 'Balances', nav: 'Balances', placement: 'more' },
  { path: '/app/conversions', heading: 'Transfers & exchanges', nav: 'Transfers', placement: 'more' },
  { path: '/app/recurring', heading: 'Recurring', nav: 'Recurring', placement: 'more' },
  { path: '/app/settings', heading: 'Settings', nav: 'Settings', placement: 'more' },
] as const;

type Page = import('@playwright/test').Page;
type BrowserDiagnostics = {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
};

async function expectMobileTargetSize(target: ReturnType<Page['getByRole']>) {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function assertNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
}

async function assertMainFocused(page: Page) {
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe('main-content');
}

async function assertMobileLayout(page: Page) {
  const mobileNav = page.getByRole('navigation', { name: 'Mobile' });
  await expect(mobileNav).toBeVisible();

  const primaryRoutes = CORE_ROUTES.filter((route) => route.placement === 'primary');
  const moreRoutes = CORE_ROUTES.filter((route) => route.placement === 'more');
  await expect(mobileNav.getByRole('link')).toHaveCount(primaryRoutes.length);

  for (const route of primaryRoutes) {
    await expectMobileTargetSize(mobileNav.getByRole('link', { name: route.nav, exact: true }));
  }

  const moreButton = mobileNav.getByRole('button', { name: 'More', exact: true });
  await expectMobileTargetSize(moreButton);
  await moreButton.click();

  const moreNavigation = mobileNav.getByRole('group', { name: 'More navigation' });
  await expect(moreNavigation).toBeVisible();
  for (const route of moreRoutes) {
    await expectMobileTargetSize(moreNavigation.getByRole('link', { name: route.nav, exact: true }));
  }

  await moreButton.click();
  await expect(mobileNav.getByRole('link')).toHaveCount(primaryRoutes.length);
  await assertNoHorizontalOverflow(page);
}

async function completeFreshOnboarding(page: Page) {
  await expect(page.getByRole('heading', { name: 'Track money without slowing down.' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await expectMobileTargetSize(page.getByRole('button', { name: 'Get started' }));
  await page.getByRole('button', { name: 'Get started' }).click();

  await expect(page.getByRole('heading', { name: 'Choose the currencies you use.' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.getByLabel('Cash', { exact: true }).fill('1000');
  await expectMobileTargetSize(page.getByRole('button', { name: 'Continue' }));
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Make daily logging faster.' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'You’re ready.' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await expectMobileTargetSize(page.getByRole('button', { name: 'Open TapTrack' }));
  await page.getByRole('button', { name: 'Open TapTrack' }).click();
}

async function getRouteDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const keys = await caches.keys();
    const cacheEntries = Object.fromEntries(
      await Promise.all(
        keys.map(async (key) => {
          const requests = await (await caches.open(key)).keys();
          return [key, requests.map((request) => request.url)] as const;
        })
      )
    );

    return {
      url: location.href,
      title: document.title,
      bodyText: document.body.innerText.slice(0, 2000),
      readyState: document.readyState,
      online: navigator.onLine,
      controlled: Boolean(navigator.serviceWorker.controller),
      controllerScript: navigator.serviceWorker.controller?.scriptURL ?? null,
      registrations: registrations.map((registration) => ({
        scope: registration.scope,
        active: registration.active?.scriptURL ?? null,
        waiting: registration.waiting?.scriptURL ?? null,
        installing: registration.installing?.scriptURL ?? null,
      })),
      cacheEntries,
    };
  });
}

async function expectHeadingWithDiagnostics(
  page: Page,
  heading: string,
  phase: string,
  diagnostics: BrowserDiagnostics,
  level?: 1 | 2 | 3 | 4 | 5 | 6
) {
  try {
    await expect(page.getByRole('heading', { name: heading, exact: true, level })).toBeVisible();
  } catch (error) {
    const routeDiagnostics = await getRouteDiagnostics(page);
    throw new Error(
      `${phase} did not render heading "${heading}". Diagnostics: ${JSON.stringify({
        ...routeDiagnostics,
        ...diagnostics,
      })}\n${error instanceof Error ? error.message : String(error)}`
    );
  }
}

test('device-local ledger works across warmed offline mobile routes', async ({ page, context }) => {
  const externalRequests: string[] = [];
  const diagnostics: BrowserDiagnostics = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
  };
  const configuredBaseUrl = test.info().project.use.baseURL;
  if (typeof configuredBaseUrl !== 'string') throw new Error('Playwright baseURL is required');
  const appOrigin = new URL(configuredBaseUrl).origin;

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.stack ?? `${error.name}: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    diagnostics.failedRequests.push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown failure'}`
    );
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== appOrigin) externalRequests.push(request.url());
  });

  await page.goto('/app');
  await completeFreshOnboarding(page);
  await expectHeadingWithDiagnostics(page, 'Dashboard', 'Post-setup app state', diagnostics);
  await assertNoHorizontalOverflow(page);
  await expectMobileTargetSize(page.getByLabel('Add transaction', { exact: true }));

  const mobileNav = page.getByRole('navigation', { name: 'Mobile' });
  await mobileNav.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expectHeadingWithDiagnostics(page, 'Transactions', 'Client navigation to transactions', diagnostics);
  await assertMainFocused(page);
  await mobileNav.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expectHeadingWithDiagnostics(page, 'Dashboard', 'Client navigation back to dashboard', diagnostics);
  await assertMainFocused(page);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expectHeadingWithDiagnostics(page, 'Dashboard', 'Service-worker-controlled reload', diagnostics);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  for (const route of CORE_ROUTES) {
    await page.goto(route.path);
    await expectHeadingWithDiagnostics(page, route.heading, `Warmed route ${route.path}`, diagnostics);
    await assertMobileLayout(page);
  }

  await page.goto('/app/add');
  await expectHeadingWithDiagnostics(page, 'Add transaction', 'Warmed capture route', diagnostics, 1);
  await assertNoHorizontalOverflow(page);

  const cacheInventory = await page.evaluate(async () => {
    const keys = await caches.keys();
    const tapTrackKeys = keys.filter((key) => key.startsWith('taptrack-shell-'));
    const urls = (
      await Promise.all(
        tapTrackKeys.map(async (key) =>
          (await caches.open(key)).keys().then((requests) => requests.map((request) => request.url))
        )
      )
    ).flat();
    return { keys, tapTrackKeys, urls };
  });
  expect(cacheInventory.tapTrackKeys).toHaveLength(1);
  expect(cacheInventory.urls.some((url) => url.includes('/api/') || url.includes('/auth/'))).toBe(false);
  expect(cacheInventory.urls.every((url) => new URL(url).origin === appOrigin)).toBe(true);

  await context.setOffline(true);

  for (const route of CORE_ROUTES) {
    await page.goto(route.path);
    await expectHeadingWithDiagnostics(page, route.heading, `Offline route ${route.path}`, diagnostics);
    await assertMobileLayout(page);
  }

  await page.goto('/app/add');
  await expectHeadingWithDiagnostics(page, 'Add transaction', 'Offline capture route', diagnostics, 1);
  await page.getByLabel('Amount', { exact: true }).fill('5');
  await page.getByLabel('What was it?').fill('offlinecheck');
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expectHeadingWithDiagnostics(page, 'Dashboard', 'Post-save offline dashboard', diagnostics);
  await expect(page.getByText('offlinecheck', { exact: true }).last()).toBeVisible();
  await page.reload();
  await expectHeadingWithDiagnostics(page, 'Dashboard', 'Offline reload', diagnostics);
  await expect(page.getByText('offlinecheck', { exact: true })).toBeVisible();

  expect(externalRequests).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.failedRequests).toEqual([]);
});
