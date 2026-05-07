# TapTrack Repo Map

Last mapped: 2026-05-07

## Overview

TapTrack is a mobile-first, local-first personal finance tracker using Next.js 14 App Router, React, TypeScript, Tailwind CSS, Dexie/IndexedDB, Recharts, PapaParse, and Vitest. `BLUEPRINT.md` remains the source of truth for V1 scope, non-goals, build order, and acceptance criteria.

The active architecture keeps persistence behind `src/database.ts` and service modules under `src/`. No cloud sync, backend, user accounts, bank/institution import, receipt/photo scanning or attachments, exchange-rate API, or AI categorization has been added. Bank/institution imports and receipt/photo scanning are not in the current V1.5/V2 roadmap unless explicitly re-scoped.

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
