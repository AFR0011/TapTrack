# TapTrack Project State

Last updated: 2026-04-30

## Current Status

TapTrack is in the initial scaffold stage, covering the start of `BLUEPRINT.md` Phase 1 and Phase 2:

- Next.js App Router shell is present.
- Tailwind is configured.
- Dexie database schema exists for the planned V1 tables.
- Default categories, settings, and six minimal balances are seeded locally.
- Fast command parsing is implemented as a typed, tested module.
- Transaction saves go through a Dexie-backed service that updates balances atomically and blocks negative balances.
- Dashboard and recent transactions read from Dexie live queries.
- Vitest, typecheck, lint, build, and aggregate `check` scripts are available.

## Active Objective

Get the local-first logging spine reliable before expanding to budgets, reports, recurring transactions, or exports.

The next product step should be a minimal first-time setup or balance-adjustment path, because seeded balances start at `0` and expense transactions will be blocked until the chosen cash/card balance is funded.

## Verification State

Verification ladder:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Latest full verification: passed on 2026-04-30 with `npm.cmd run check`.

## Remaining Risks And Assumptions

- No committed baseline exists yet.
- No setup flow means the app can record income immediately, but expense examples require funded balances.
- Monthly budget is hardcoded at `20000 TRY`.
- Local data migrations are not needed yet because this is schema version 1, but future Dexie schema edits must be versioned.
- `npm audit --omit=dev` still reports Next/PostCSS advisories after updating to Next 14.2.35; npm's suggested automatic fix moves to Next 16 and needs a separate framework-upgrade decision.
