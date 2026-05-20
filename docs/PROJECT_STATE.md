# TapTrack Project State

Last updated: 2026-05-20

## Current Status

TapTrack V2 is implemented and the QA remediation plan is now mostly implemented in the working tree. The app remains a local-first Next.js 14 App Router product with Dexie/IndexedDB as the client data source and optional Supabase, Telegram, Ollama, exchange-rate, and PWA integrations.

The Next/PostCSS production audit remains intentionally deferred to a dedicated framework-upgrade batch.

## Implemented Foundation

- Authenticated App Router shell with dashboard, transactions, conversions, budgets, recurring, reports, and settings.
- First-time setup gate for starting balances, monthly TRY budget, and default payment method.
- Command-first transaction capture with multi-entry parsing, preview, batch save, balance validation, and AI category suggestions when enabled.
- Manual transaction add/edit/delete with balance reversal validation.
- Monthly TRY budgets, rollover calculation, category budgets, and budget usage display.
- Recurring transaction CRUD and app-open due/missed transaction creation.
- Reports for month, custom date range, and yearly summaries, with the existing TRY-unified report toggle kept view-local.
- Settings for balances, defaults, AI toggle, dark mode, category add/edit/delete, export/import, reset, and sync status.
- CSV/JSON export/import and simple PDF report export for monthly, date-range, and yearly reports.

## V2 Integrations

- Supabase auth and mirrored remote tables with per-user sync cursors, retry queue, delete tombstones, reset/import full-sync replacement, and manual sync-now status.
- Telegram webhook and registration routes with JSON auth failures and middleware exemptions.
- Exchange-rate API using `open.er-api.com` with a server-side cache and fallback rates.
- Local Ollama categorization route with graceful failure back to rule-based/manual category selection.
- PWA manifest, SVG app icons, metadata, and a static-asset-only service worker.

## QA Remediation Added

- Route/API smoke script: `npm.cmd run smoke:routes`.
- Vitest coverage for middleware redirect policy, public API exemptions, PWA asset exemptions, exchange-rate fallback JSON, and Telegram auth failures.
- Category editing service and UI for name, type, color, and icon.
- Category delete protection for defaults and transaction reassignment to the matching income/expense fallback category.
- Tests for category edit, delete reassignment, default-category protection, and sync side effects.
- Tests for date-range aggregation, yearly aggregation, PDF range/year content, and existing CSV/JSON regressions.
- Daily-use UI polish for clearer empty states, recent activity category labels/colors/icons, command multi-entry errors, and explicit balance failure messaging.
- Production checklist and separate dependency security upgrade plan.

## Verification State

Verification ladder:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

`npm.cmd run check` runs the same ladder.

Latest verification in this working tree:

- `npm.cmd run test -- middleware.test.ts app/api/integration-routes.test.ts src/budgets/budgetService.test.ts src/reports/reportService.test.ts src/exports/exportService.test.ts src/sync/syncService.test.ts` - 6 files, 28 tests passing.
- `npm.cmd run typecheck` - 0 errors.
- `npm.cmd run check` - lint, typecheck, 14 test files, 67 tests, and production build all passing.
- `$env:TAPTRACK_SMOKE_BASE_URL="http://127.0.0.1:3002"; npm.cmd run smoke:routes` - root/login/app redirects, exchange API JSON, Telegram JSON auth failures, manifest, and service worker all passing.
- Browser DOM smoke on `/login` desktop and mobile viewport - no horizontal overflow detected; manifest link present.
- `npm.cmd audit --omit=dev` - still reports Next/PostCSS advisories that require a breaking Next 16 upgrade.

Authenticated workspace browser checks remain blocked until a real Supabase session is available in the browser profile. Route smoke verifies that unauthenticated `/app` correctly redirects to `/login`.

## Remaining Risks And Assumptions

- Supabase sync is still browser-local and best-effort; there is no server-side durable job queue.
- Telegram writes directly to Supabase; the app sees those changes after pull sync.
- AI categorization requires a reachable Ollama deployment and remains optional.
- PDF export is more readable and supports range/year, but still uses the current lightweight in-repo PDF flow rather than a full layout engine.
- Recurring transactions run on app open only; there is no background execution or push notification layer.
- PWA offline support is intentionally limited to static shell assets. IndexedDB remains the data source.
- `npm.cmd audit --omit=dev` still needs the dedicated Next 16 security-upgrade batch documented in `docs/DEPENDENCY_SECURITY_UPGRADE_PLAN.md`.
- Bank/institution imports, receipt/photo scanning, OCR, and attachments remain out of current scope.
