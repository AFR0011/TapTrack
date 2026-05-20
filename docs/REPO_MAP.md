# TapTrack Repo Map

Last mapped: 2026-05-20

## Overview

TapTrack is a mobile-first personal finance tracker using Next.js 14 App Router, React, TypeScript, Tailwind CSS, Dexie/IndexedDB, Recharts, PapaParse, Supabase, and Vitest. `BLUEPRINT.md` defines the original product scope; this map reflects the active V2 implementation plus the QA remediation work.

## Active Features

- Multi-entry command parsing and atomic batch saves.
- Supabase auth and local-first sync with pull cursor, push cursor, retry queue, and delete tombstones.
- Telegram bot webhook and registration route.
- Exchange-rate API with TRY-unified reports toggle.
- Local Ollama AI category suggestion.
- Category add/edit/delete with fallback reassignment.
- Monthly, custom date-range, and yearly reports.
- CSV/JSON/PDF export and JSON import.
- PWA manifest, app icons, metadata, and static-asset service worker.
- Sync status panel with last pull, last push, pending retries, online state, and manual sync.

## Active Structure

| Path | Role |
| --- | --- |
| `app/layout.tsx` | Root layout, metadata, theme initializer, and service worker registration. |
| `app/page.tsx` | Root route redirect target handled by middleware/auth flow. |
| `app/(auth)/login/page.tsx` | Email/password authentication UI. |
| `app/(authenticated)/layout.tsx` | Authenticated provider stack, setup gate, toast provider, and app shell. |
| `app/(authenticated)/app/page.tsx` | Dashboard route with quick command, budget summary, balances, and recent activity. |
| `app/(authenticated)/app/transactions/page.tsx` | Transaction history and manual CRUD route. |
| `app/(authenticated)/app/conversions/page.tsx` | Currency exchange and transfer route. |
| `app/(authenticated)/app/budgets/page.tsx` | TRY monthly and category budget route. |
| `app/(authenticated)/app/recurring/page.tsx` | Recurring transaction route. |
| `app/(authenticated)/app/reports/page.tsx` | Month/range/year reports route. |
| `app/(authenticated)/app/settings/page.tsx` | Balances, defaults, AI, sync status, categories, export/import, reset. |
| `app/api/exchange-rates/route.ts` | Public JSON exchange-rate API with fallback rates. |
| `app/api/telegram/webhook/route.ts` | Telegram webhook command handling and Supabase writes. |
| `app/api/telegram/register/route.ts` | Admin-protected Telegram webhook registration. |
| `middleware.ts` | Supabase session refresh, auth redirects, and public API/PWA exemptions. |
| `public/manifest.webmanifest` | PWA install metadata. |
| `public/sw.js` | Static-asset-only service worker. |
| `public/icons/*.svg` | App and maskable SVG icons. |
| `scripts/route-smoke.mjs` | Runtime route/API/PWA smoke checks. |
| `src/types.ts` | Shared domain types and enum-like constants. |
| `src/database.ts` | Dexie database class, table declarations, and seed routine. |
| `src/defaultData.ts` | Default balances, categories, settings, and category suggestion helpers. |
| `src/parser/parseCommand.ts` | Typed command parser. |
| `src/transactions/createTransaction.ts` | Transaction create/update/delete and balance effects. |
| `src/budgets/budgetService.ts` | Monthly/category budgets plus category edit/delete logic. |
| `src/recurring/recurringService.ts` | Recurring CRUD, due checks, and next-run dates. |
| `src/reports/reportService.ts` | Month/range/year report aggregations for UI/tests/exports. |
| `src/reports/reportTransforms.ts` | Pure budget-performance transform. |
| `src/exports/exportService.ts` | CSV, JSON backup/import, and simple PDF exports. |
| `src/sync/syncService.ts` | Supabase push/delete/pull sync, retry queue, full snapshot sync, status helper. |
| `src/components/*.tsx` | App shell, dashboard, route workspaces, setup, status, and UI helpers. |
| `src/**/*.test.ts`, `middleware.test.ts`, `app/api/integration-routes.test.ts` | Vitest coverage for parser, services, sync, exports, routes, and API behavior. |

## Data Flow

1. Middleware refreshes Supabase auth, protects app routes, and leaves public API/PWA assets reachable.
2. `DatabaseProvider` seeds IndexedDB, runs due recurring checks, and starts best-effort sync on app open.
3. `SetupGate` checks `settings.setupCompleted` and shows setup until balances/budget/defaults are saved.
4. `CommandInput` parses one or more commands, previews drafts, optionally fetches an AI category suggestion, and saves through transaction services.
5. Transaction, conversion, budget, category, recurring, and settings writes update Dexie first, then enqueue best-effort Supabase sync.
6. Reports and exports aggregate current Dexie data; TRY unification is view-level only and does not mutate balances.
7. Reset/import replaces local data and calls full snapshot sync to update Supabase and tombstone removed rows.

## Verification Commands

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

`npm.cmd run check` runs the full ladder.

Route smoke against a running server:

```powershell
$env:TAPTRACK_SMOKE_BASE_URL="http://127.0.0.1:<port>"; npm.cmd run smoke:routes
```

Security audit is separate:

```powershell
npm.cmd audit --omit=dev
```

## Known Gaps

- Next/PostCSS advisories require the separate Next 16 upgrade batch.
- PDF export remains simple by design, even though it now includes category names and range/year support.
- Service worker coverage is intentionally static-only and does not try to cache app data.
- Sync retry queue is browser-local only.
- Recurring transactions run on app open only.
- Bank/institution imports, receipt/photo scanning, OCR, and attachments remain out of scope.
