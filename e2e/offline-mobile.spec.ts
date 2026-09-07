import { expect, test } from '@playwright/test';

const CORE_ROUTES = [
  { path: '/app', heading: 'Dashboard', nav: 'Home' },
  { path: '/app/transactions', heading: 'Transactions', nav: 'History' },
  { path: '/app/conversions', heading: 'Transfers & exchanges', nav: 'Transfer' },
  { path: '/app/budgets', heading: 'Budgets', nav: 'Budgets' },
  { path: '/app/recurring', heading: 'Recurring', nav: 'Recurring' },
  { path: '/app/reports', heading: 'Reports', nav: 'Reports' },
  { path: '/app/settings', heading: 'Settings', nav: 'Settings' },
] as const;

type Page = import('@playwright/test').Page;
type BrowserDiagnostics = {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
};

async function assertMobileLayout(page: Page) {
  const mobileNav = page.getByRole('navigation', { name: 'Mobile' });
  await expect(mobileNav).toBeVisible();
  const links = mobileNav.getByRole('link');
  await expect(links).toHaveCount(CORE_ROUTES.length);

  for (const route of CORE_ROUTES) {
    const target = mobileNav.getByRole('link', { name: route.nav, exact: true });
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
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
  diagnostics: BrowserDiagnostics
) {
  try {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Welcome to TapTrack' })).toBeVisible();
  await page.getByLabel('TRY cash').fill('1000');
  await page.getByRole('button', { name: 'Start tracking' }).click();
  await expectHeadingWithDiagnostics(page, 'Dashboard', 'Post-setup app state', diagnostics);

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

  const cacheInventory = await page.evaluate(async () => {
    const keys = await caches.keys();
    const tapTrackKeys = keys.filter((key) => key.startsWith('taptrack-shell-'));
    const urls = (
      await Promise.all(
        tapTrackKeys.map(async (key) =>
          (await caches.open(key)).keys().then((requests) => requests.map((r) => r.url))
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

  await page.goto('/app');
  await page.getByLabel('Quick transaction command').fill('-5 offlinecheck cash');
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('offlinecheck', { exact: true }).last()).toBeVisible();
  await page.reload();
  await expectHeadingWithDiagnostics(page, 'Dashboard', 'Offline reload', diagnostics);
  await expect(page.getByText('offlinecheck', { exact: true })).toBeVisible();

  expect(externalRequests).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.failedRequests).toEqual([]);
});
