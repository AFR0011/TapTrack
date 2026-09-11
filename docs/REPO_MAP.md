# Ravel Repo Map

Last mapped: 2026-09-11

## Overview

Ravel is a Next.js 16 App Router, React, TypeScript, Tailwind, and Dexie/IndexedDB personal-finance PWA. The browser-profile-local ledger is the normal working boundary; Supabase Auth/sync and other network services are optional capabilities.

## Public and application routes

| Path | Role |
| --- | --- |
| `app/page.tsx` | Public Ravel landing page and synthetic product preview. |
| `app/layout.tsx` | Root metadata, fonts, theme initialization, manifest/icons. |
| `app/(auth)/login/page.tsx` | Optional Supabase account entry plus local-ledger access. |
| `app/(authenticated)/layout.tsx` | Application provider stack and shell; route-group name is historical and does not make local use account-dependent. |
| `app/(authenticated)/app/**` | Dashboard, transaction entry/history, transfers/exchanges, balances, budgets, recurring, reports, settings. |
| `app/auth/callback/route.ts` | Supabase PKCE/token-hash callback boundary. |
| `app/api/categorize/route.ts` | Authenticated hosted Smart Categories boundary. |
| `app/api/exchange-rates/**` | Server-mediated currency/rate lookups. |
| `app/api/sync/**` | Protected sync operations and atomic empty-cloud claim. |
| `app/api/restore-account/route.ts` | Protected account-wide replacement route. |
| `app/api/capture/**` / `capture-tokens/**` | External quick-capture token boundary. |
| `app/api/telegram/**` | Fail-closed private-owner Telegram integration. |

## Core data and domain map

| Path | Role |
| --- | --- |
| `src/database.ts` | `RavelDatabase`, Dexie schema/migrations, persisted `TapTrackDB` compatibility name. |
| `src/types.ts` | Shared domain types. |
| `src/defaultData.ts` | Initial categories/settings and canonical defaults. |
| `src/balances/` | Derived balance reconstruction and reconciliation/checkpoints. |
| `src/transactions/` | Transaction mutation/history semantics. |
| `src/conversions/` | Transfers/exchanges and correction lifecycle. |
| `src/currencies/` | Currency catalog, active/archive behavior. |
| `src/budgets/` | Monthly/category budget behavior. |
| `src/recurring/` | Anchored recurring schedules and sync-safe generation. |
| `src/reports/` | Reporting and historical valuation. |
| `src/exports/` | JSON backup/restore/reset and CSV/PDF exports. |
| `src/sync/` | Binding, adoption, durable outbox, convergence, generation handling. |
| `src/server/` | Server-only AI/capture/integration helpers. |
| `src/brand.ts` | Central Ravel/LifeOS product identity constants. |

## PWA and presentation map

| Path | Role |
| --- | --- |
| `public/manifest.webmanifest` | Ravel install metadata and shortcuts. |
| `public/sw.js` | Versioned offline app-shell/cache behavior with legacy TapTrack-cache cleanup. |
| `public/icons/ravel-*.svg` | Current Ravel PWA icons. |
| `app/globals.css` / responsive CSS | Brand tokens and layout behavior. |
| `src/components/` | Application workspaces, navigation, onboarding, and settings UI. |

## Verification map

| Path | Coverage |
| --- | --- |
| `scripts/publication-guard.mjs` | Public-boundary, configuration, documentation, and branding checks. |
| `scripts/route-smoke.mjs` | Nine production route/API/PWA/security expectations. |
| `src/database.migration.test.ts` | IndexedDB migration/data continuity. |
| `src/sync/*.test.ts` | Binding, adoption, convergence, protected operation, race handling. |
| `src/exports/*.test.ts` | Backup/restore/reset/export behavior. |
| `app/api/**/*.test.ts` | Server route auth/fail-closed/integration behavior. |
| `e2e/*.spec.ts` | Real-browser balances, offline/mobile, responsive navigation/settings/recurring flows. |
| `.github/workflows/ci.yml` | Node 22 publication guard, audits, lint, typecheck, unit suite, build, route smoke, Chromium E2E. |

## Current verified baseline

Production baseline `dd4546cbeec5f9cab1817f67c04ab24dfd017152` passed 49 Vitest files / 268 tests, 9/9 route smoke, production build, and Playwright with 10 passed / 3 intentionally skipped.

## Intentional historical identifiers

`TapTrackDB`, `taptrack-backup`, deployed Supabase RPC/function names, legacy environment/storage aliases, historical service-worker cache prefixes, and old capture-token prefixes remain for compatibility. See `docs/RAVEL_COMPATIBILITY.md`.

## Remaining boundaries

- GitHub `main` ruleset/branch protection is still open as issue #14.
- Supabase leaked-password protection is disabled.
- Supabase project display metadata still uses the historical name.
- Native Safari/iOS installed-PWA lifecycle behavior is unverified.
- JavaScript `number` remains the money representation.
- IndexedDB remains browser-profile-visible and unencrypted by the application.
- Exhaustive Git all-object/reflog secret scanning remains outstanding.