# TapTrack Repo Map

Last mapped: 2026-05-14

## Overview

TapTrack is a mobile-first personal finance tracker using Next.js 14 App Router, React, TypeScript, Tailwind CSS, Dexie/IndexedDB, Recharts, PapaParse, and Vitest. `BLUEPRINT.md` defines the original V1 scope and non-goals; this repo map documents the current V2 implementation.

### V2 Features Implemented
- Multi-entry command parsing (e.g., `-250 dinner -500 lunch +300 loan`)
- Supabase cloud sync (fire-and-forget push, pull on app open)
- Telegram bot webhook for logging transactions from Telegram
- Exchange rate API (open.er-api.com, cached 1h) with TRY-unified reports toggle
- Local AI categorization (Ollama fallback to keyword rules)
- Framer Motion + glassmorphism design polish

### V1 Foundation (unchanged)
- Next.js App Router shell with shared dashboard, transactions, budgets, recurring, reports, and settings navigation.
- First-time setup gate captures six starting balances, monthly TRY budget, and default payment method.
- Fast command parsing, preview, save, balance update, negative-balance blocking, and live dashboard updates.
- Manual transaction add/edit/delete with balance reversal validation.
- Monthly TRY budget, rollover calculation, category budgets, and budget usage display.
- Recurring transaction CRUD and app-open due/missed transaction creation.
- Reports cover category spending, spending over time, income vs expense, monthly comparison, and budget performance.
- Settings covers balance updates, default method, category CRUD, CSV/JSON/PDF export and import, and reset.

## Active Structure

| Path | Role |
| --- | --- |
| `app/layout.tsx` | Root layout, providers, setup gate, and shared app shell. |
| `app/page.tsx` | Dashboard route with quick command, budget summary, balances, and recent transactions. |
| `app/transactions/page.tsx` | Transactions workspace route. |
| `app/budgets/page.tsx` | Budget workspace route. |
| `app/recurring/page.tsx` | Recurring transactions route. |
| `app/reports/page.tsx` | Reports and chart route. |
| `app/settings/page.tsx` | Settings, balances, categories, export/import, reset route. |
| `app/providers/DatabaseProvider.tsx` | Seeds IndexedDB and runs due recurring transaction checks on app open. |
| `src/types.ts` | Shared domain types and enum-like constants. |
| `src/database.ts` | Dexie database class, V1 table declarations, and seed routine. |
| `src/defaultData.ts` | Default categories, balances, settings, and category suggestion helpers. |
| `src/dates.ts` | Local date/month helpers and recurring frequency date increments. |
| `src/format.ts` | Money formatting, amount parsing, and percent clamping helpers. |
| `src/parser/parseCommand.ts` | Typed fast-command parser. |
| `src/transactions/createTransaction.ts` | Create, update, delete transaction logic with balance effects and negative-balance blocking. |
| `src/setup/setupService.ts` | First-time setup persistence for balances, monthly budget, and settings. |
| `src/budgets/budgetService.ts` | Monthly/category budget upsert, status, and rollover logic. |
| `src/recurring/recurringService.ts` | Recurring CRUD, next-run dates, and due/missed app-open creation. |
| `src/reports/reportService.ts` | Report aggregations for tests and exports. |
| `src/reports/reportTransforms.ts` | Pure budget-performance transform used by reports UI and service. |
| `src/exports/exportService.ts` | CSV, JSON backup/import, and simple PDF report export. |
| `src/components/*.tsx` | Ledger Console shell, setup form, dashboard, and route workspaces. |
| `src/**/*.test.ts` | Vitest coverage for parser, transactions, setup, budgets, recurring, reports, and exports. |

## Data Flow

1. `DatabaseProvider` calls `ensureDatabaseSeeded()` on the client, then `createDueRecurringTransactions()`.
2. `SetupGate` reads `settings.setupCompleted`; first use shows `SetupForm` until balances and the monthly budget are saved.
3. `CommandInput` parses commands with Dexie-backed categories and settings, previews the draft, then calls `createTransaction()`.
4. Transaction create/update/delete operations apply balance effects atomically and reject negative resulting balances.
5. Dashboard, transaction lists, budgets, recurring lists, reports, and settings read Dexie live queries so UI updates after local writes.
6. Export/import flows read or restore all Dexie tables through `exportService`.

## Runtime And Build Signals

- Package manager: npm with `package-lock.json`.
- Runtime app: Next.js 14 App Router.
- Styling: Tailwind CSS.
- Persistence: Dexie/IndexedDB only.
- Charts: Recharts on the reports route.
- CSV: PapaParse.
- Tests: Vitest with `fake-indexeddb`.
- Lint: `next lint` with `eslint-config-next`.

## Verification Commands

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

`npm.cmd run check` runs the full ladder.

Latest browser smoke command target: `http://127.0.0.1:3001`.

## Known Gaps

- The PDF report is functional but visually basic.
- Category editing/deleting is not complete.
- No service worker or install manifest polish yet.
- No custom date-range/yearly reports yet.
- No automatic currency conversion in reports by design for V1.
- The existing port `3000` process may serve stale routes if it was started before the new route build; use a fresh dev server or restart that process when verifying routes.
