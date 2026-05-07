# TapTrack Project State

Last updated: 2026-05-07

## Current Status

TapTrack now has a broad local-first V1 app surface in the Ledger Console direction:

- Next.js App Router shell with shared dashboard, transactions, budgets, recurring, reports, and settings navigation.
- First-time setup gate captures six starting balances, monthly TRY budget, and default payment method before normal use.
- Fast command parsing, preview, save, balance update, negative-balance blocking, and live dashboard updates are implemented.
- Manual transaction add/edit/delete is implemented with balance reversal validation.
- Monthly TRY budget, total rollover calculation, category budgets, and budget usage display are implemented.
- Recurring transaction CRUD and app-open due/missed transaction creation are implemented.
- Reports cover category spending, spending over time, income vs expense, monthly comparison, budget performance, and detailed transaction lists.
- Settings covers balance updates, default method, category creation, CSV export, JSON backup/import, PDF report export, and reset.
- CSV export uses PapaParse; JSON backup covers all Dexie tables; PDF export generates a simple local PDF blob.

## Active Objective

The local-first V1 acceptance surface is now usable enough for end-to-end daily logging and monthly review testing. The next product step should be tightening the user experience around transaction/category editing, export polish, and mobile navigation details after real usage.

Bank/institution imports and receipt/photo scanning or attachments are out of current product scope, including the V1.5/V2 roadmap unless explicitly re-scoped.

## Verification State

Verification ladder:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Latest verification on 2026-05-05:

- `npm.cmd run lint` passed.
- `npm.cmd run typecheck` passed.
- `npm.cmd run test` passed with 7 files and 20 tests.
- `npm.cmd run build` passed with routes for dashboard, transactions, budgets, recurring, reports, and settings.
- Browser smoke used Edge headless on `http://127.0.0.1:3001` because the existing port `3000` listener was serving an older route manifest.

## Remaining Risks And Assumptions

- The PDF report is intentionally simple and local; it is a valid downloadable PDF blob but not yet a polished pdfmake layout.
- Reports are TRY-primary and do not convert USD/EUR, per V1 scope.
- Recurring transactions run on app open only; there is no background execution or push notification.
- Category management supports creation and display, but not full edit/delete controls yet.
- PWA install/service-worker polish is still outside this implementation pass.
- `npm audit --omit=dev` still reports Next/PostCSS advisories; moving to Next 16 remains a separate framework-upgrade decision.
