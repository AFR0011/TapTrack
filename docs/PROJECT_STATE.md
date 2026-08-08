# TapTrack Project State

Last updated: 2026-08-08

## Current Status

TapTrack V2 is implemented and has been migrated to a supported Next.js 16 / React 19 baseline. The application is a mobile-first, local-first personal finance tracker with Dexie/IndexedDB as the browser data source, Supabase Auth for the standard authenticated shell, optional Supabase data synchronization, and optional Telegram, Ollama, exchange-rate, and PWA integrations.

The previous Next/PostCSS security-upgrade batch is complete. The publication branch now gates both runtime and development dependencies, lint, typecheck, tests, production build, and route smoke.

Visual direction remains **Calm Personal Ledger**: semantic-token surfaces, shared UI primitives, responsive route-aware layouts, accessible feedback, skeleton loading states, and tokenized dark-mode overlays/toasts/charts/dialogs.

## Implemented Product Surface

- Authenticated App Router shell with dashboard, transactions, conversions/transfers, budgets, recurring items, reports, and settings.
- First-time setup for starting balances, monthly TRY budget, and default payment method.
- Command-first transaction capture with multi-entry parsing, preview, batch save, balance validation, and optional AI category suggestions.
- Manual transaction create/edit/delete with balance reversal validation.
- TRY/USD/EUR balances with cash/card methods.
- Currency exchange and cash/card transfer flows.
- Monthly TRY budgets, category budgets, rollover calculation, and usage display.
- Recurring transaction CRUD and app-open due/missed transaction creation.
- Month, custom date-range, and yearly reporting plus an optional TRY-unified view.
- CSV/JSON import/export and lightweight PDF report export.
- Settings for balances, defaults, AI toggle, dark mode, categories, reset/import/export, and sync status.

## Persistence and Integration Model

### Local data

Core finance data is stored in IndexedDB through Dexie and remains the browser application's normal read/write source.

### Supabase

Supabase Auth protects the standard application shell. Optional remote synchronization mirrors supported user-scoped finance records and includes sync cursors, retry handling, delete tombstones, reset/import full replacement, and manual sync status.

The current sync path is best-effort and browser-driven. There is no server-side durable job queue.

### Telegram

Telegram webhook/register routes support remote transaction entry. Requests use a webhook secret, can be restricted to a configured owner chat ID, and map writes to a configured Supabase user. Telegram entry therefore changes the privacy boundary and is not equivalent to local-only browser entry.

### AI categorization

A configured Ollama endpoint can provide category suggestions. Failure degrades to the deterministic/manual path; the feature is not required for core transaction capture.

### Exchange rates

The server route fetches public exchange-rate data and provides fallback values when the upstream service is unavailable.

### PWA

The project includes manifest/icon metadata and a static-asset service worker. Offline support is intentionally limited to the application shell; IndexedDB remains the finance data source.

## Framework and Security Baseline

- Next.js 16.2.12
- React / React DOM 19.2.8
- TypeScript
- Node.js 20.9+; CI uses Node 22
- ESLint 10.8.0 with `@eslint/compat` around the current Next plugin configs
- Vitest 4.1.10

The complete publication dependency graph has been refreshed and the full high-severity npm audit passes with zero reported vulnerabilities on the verified branch.

See `docs/DEPENDENCY_SECURITY_UPGRADE_PLAN.md` for the completed migration record.

## Verification State

Permanent CI verifies the committed tree with:

```text
npm ci
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
npm run lint
npm run typecheck
npm run test
npm run build
npm run smoke:routes
```

Verified automated results during the publication pass:

- dependency audits: pass
- lint: pass
- typecheck: pass
- Vitest: 14 files / 67 tests pass
- production build: pass
- route/API smoke: 8/8 pass

The route smoke covers unauthenticated redirects, public login/PWA assets, exchange-rate JSON behavior, and invalid Telegram secret handling.

## Manual Verification Still Recommended

Before public screenshots or deployment claims:

- Perform an authenticated walkthrough using a disposable Supabase test account.
- Verify setup → transaction → budget → report flow.
- Exercise transaction, conversion, recurring, category, export/import, and reset workflows.
- Check light/dark modes, dialogs, toasts, chart tooltips, and loading states.
- Check ~390px mobile layout, bottom navigation, filters, touch targets, and horizontal overflow.
- Verify keyboard navigation and visible focus behavior.
- Use synthetic finance data only for screenshots or demo exports.

## Current Limitations

- No bank or payment-network integration.
- No receipt/photo OCR or attachment workflow.
- No server-side durable synchronization queue.
- No background recurring scheduler or push-notification layer.
- Telegram writes become visible to the browser after synchronization rather than through a live shared client datastore.
- Optional cloud sync means configured finance records leave local browser storage and enter the selected Supabase project.
- IndexedDB finance data is not encrypted by TapTrack at rest.
- PDF reporting remains intentionally lightweight.
- Authenticated end-to-end browser automation requires a disposable real Supabase session and is not currently part of CI.

## Publication Status

The code and automated verification are substantially publication-ready. Remaining blockers are non-code release boundaries:

1. choose and add an explicit source-code license;
2. complete Git-history/privacy review for old secrets or real finance data;
3. use synthetic screenshots/demo records;
4. complete an authenticated manual walkthrough before presenting the repository as a polished portfolio release.
