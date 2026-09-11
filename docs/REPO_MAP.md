# Ravel Repo Map

Last mapped: 2026-09-05

## Overview

Ravel is a Next.js 16 App Router, React, TypeScript, Tailwind, and Dexie/IndexedDB personal
finance PWA. The browser-profile-local ledger is the normal source of truth; Supabase sync is an
optional, explicitly bound capability. `BLUEPRINT.md` defines product scope and completed batch
TT-B001; `DEV_STATE.md`, `QA_REPORT.md`, and `RISK_REGISTER.md` carry current closure evidence.

## Route and runtime map

| Path | Role |
| --- | --- |
| `app/layout.tsx` | Root metadata, theme initialization, and service-worker registration. |
| `app/(auth)/login/page.tsx` | Optional provider login plus always-available local-ledger entry. |
| `app/(authenticated)/layout.tsx` | Provider stack, setup gate, toast provider, and app shell; name is historical, not an auth requirement. |
| `app/(authenticated)/app/**` | Seven local routes: dashboard, transactions, conversions, budgets, recurring, reports, settings. |
| `app/providers/DatabaseProvider.tsx` | Opens/seeds local data and processes recurring items before eligible optional sync. |
| `proxy.ts` | Non-gating optional Supabase session refresh and authenticated-login redirect. |
| `public/sw.js` | Versioned Ravel-owned route/static cache and offline document fallback. |
| `public/manifest.webmanifest` | PWA install metadata with `/app` start route. |
| `app/api/telegram/**` | Fail-closed bot registration/webhook boundaries. |
| `app/api/exchange-rates/route.ts` | Public exchange-rate lookup with fallback behavior. |

## Data and service map

| Path | Role |
| --- | --- |
| `src/database.ts` | Dexie v3 schema, tables, backup/import/reset boundaries, and seed routine. |
| `src/types.ts` | Shared domain types including device metadata. |
| `src/sync/syncBinding.ts` | Immutable device-ledger binding, empty-remote preflight, and central eligibility guard. |
| `src/sync/syncService.ts` | Guarded push/delete/pull/retry/status; destructive full snapshot replacement disabled. |
| `src/transactions/createTransaction.ts` | Local transaction CRUD/batches and after-commit optional sync dispatch. |
| `src/conversions/conversionService.ts` | Local conversion/transfer transactions and after-commit optional sync dispatch. |
| `src/budgets/`, `src/recurring/`, `src/setup/` | Local domain services with guarded optional sync dispatch. |
| `src/reports/`, `src/exports/` | Local aggregation and export/import services. |
| `src/components/AppShell.tsx` | Desktop and complete seven-route mobile navigation; offline full-document navigation. |
| `src/components/SettingsWorkspace.tsx` | Local settings/import/reset plus explicit sync-binding UI and status. |

## Verification map

| Path | Coverage |
| --- | --- |
| `middleware.test.ts` | Auth-optional local routing and configured/unconfigured provider behavior. |
| `src/database.migration.test.ts` | Dexie v2→v3 row preservation and absence of implicit binding. |
| `src/sync/syncBinding.test.ts` | Provider/auth/binding/mismatch/preflight authorization matrix. |
| `src/sync/syncService.test.ts` | Guarded remote operations, local-only replacement boundary, and sync status. |
| `app/api/integration-routes.test.ts` | Telegram configuration/secret/owner fail-closed behavior. |
| `src/transactions/createTransaction.test.ts` | Transaction behavior including zero-unhandled-rejection composition regression. |
| `e2e/offline-mobile.spec.ts` | Production Chromium online/offline workflow, persistence, cache, navigation, targets, overflow, request, and page-error assertions. |
| `scripts/route-smoke.mjs` | Eight production route/API expectations with absent provider configuration. |
| `.github/workflows/ci.yml` | Node 22 audit/lint/typecheck/unit/build/smoke and Chromium browser gate. |

## Commands

```powershell
npm.cmd audit --audit-level=high
npm.cmd audit --omit=dev --audit-level=high
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run smoke:routes
npx.cmd playwright test
node scripts/publication-guard.mjs
```

## Remaining boundaries

- Live disposable two-account Supabase schema/grant/RLS verification is unavailable.
- Empty-remote preflight and later writes retain a server-side TOCTOU race.
- Immutable binding has no recovery path; IndexedDB remains profile-visible and unencrypted.
- Native installed Safari/iOS relaunch, storage eviction, and multi-version SW upgrade are unverified.
- Authorized Telegram mutation remains non-atomic and non-idempotent.
- Retry/outbox redesign, atomic cross-table pull, strict import redesign, and money representation remain later work.
- Presentation, merge/release, and deployment are blocked.
