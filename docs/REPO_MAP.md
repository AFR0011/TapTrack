# TapTrack Repo Map

Last mapped: 2026-04-30

## Overview

TapTrack is a mobile-first, local-first personal income and expense tracker. The active stack follows `BLUEPRINT.md`: Next.js, React, TypeScript, Tailwind CSS, Dexie/IndexedDB, and small service modules for domain behavior.

The repository is currently an initial scaffold with no committed history yet.

## Active Structure

| Path | Role |
| --- | --- |
| `app/layout.tsx` | App Router root layout and provider wiring. |
| `app/page.tsx` | Current single-screen dashboard shell. |
| `app/providers/DatabaseProvider.tsx` | Seeds the local IndexedDB database on the client. |
| `app/providers/ReactQueryProvider.tsx` | React Query provider, currently available but not central to the local Dexie flow. |
| `app/globals.css` | Tailwind base styles and global color variables. |
| `src/types.ts` | Shared domain types and supported enum-like constants. |
| `src/database.ts` | Dexie database class, table declarations, and seed routine. |
| `src/defaultData.ts` | Default categories, balances, settings, category suggestion helpers, and balance IDs. |
| `src/parser/parseCommand.ts` | Typed fast-command parser. |
| `src/transactions/createTransaction.ts` | Atomic transaction creation, balance update, last-method update, and negative-balance blocking. |
| `src/balances/balanceEffects.ts` | Balance delta helpers and insufficient-balance message. |
| `src/components/CommandInput.tsx` | Command capture, preview, save, and save errors. |
| `src/components/DashboardSummary.tsx` | Dashboard summary backed by Dexie live queries. |
| `src/components/RecentTransactions.tsx` | Recent transaction list backed by Dexie live queries. |
| `src/**/*.test.ts` | Vitest coverage for parser and transaction/database behavior. |
| `.claude/` | Local companion workflow and agent notes, not runtime code. |

## Data Flow

1. `DatabaseProvider` calls `ensureDatabaseSeeded()` on the client.
2. `ensureDatabaseSeeded()` creates default categories, six zeroed balances, and default settings when missing.
3. `CommandInput` reads categories and settings from Dexie live queries.
4. `parseCommand()` converts a command such as `-120 coffee cash` into a `TransactionDraft`.
5. `createTransaction()` saves the transaction inside a Dexie write transaction, updates the matching balance, blocks negative balances, and stores the last used method.
6. `DashboardSummary` and `RecentTransactions` update from Dexie live queries after writes.

## Runtime And Build Signals

- Package manager: npm with `package-lock.json`.
- Runtime app: Next.js 14 App Router.
- Styling: Tailwind CSS.
- Persistence: Dexie/IndexedDB only.
- Tests: Vitest with `fake-indexeddb` for database behavior.
- Lint: `next lint` with `eslint-config-next`.

## Verification Commands

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

`npm.cmd run check` runs the full ladder.

## Known Gaps

- First-time setup screen is not implemented yet, so all seeded balances start at `0`.
- Expense saves are correctly blocked when the selected balance is not funded.
- PWA manifest/service worker setup is not implemented yet.
- Monthly budget is still a dashboard constant, not persisted budget state.
- Manual entry, recurring transactions, reports, exports, and JSON import are not implemented yet.
- `npm audit --omit=dev` still reports Next/PostCSS advisories after updating to Next 14.2.35; the suggested automatic fix moves to Next 16 and should be handled as a separate framework upgrade.
