# TapTrack Project State

Last updated: 2026-09-05

## Current status

TapTrack is a Next.js 16 / React 19 browser-profile-local personal finance application. TT-B001
is `COMPLETE_WITH_RISKS`: the local core is auth-optional, all seven routes have warmed offline
Chromium coverage at 320x720 and 390x844, cloud finance access is blocked until an explicit
immutable account binding matches the authenticated user, destructive snapshot replacement is
disabled, and the locked dependency graph reports zero vulnerabilities.

This is not a presentation or release verdict. Live Supabase schema/RLS behavior, native
Safari/iOS installed-PWA behavior, service-worker multi-version upgrade, and authorized Telegram
transactionality/idempotency remain unverified or unresolved.

## Implemented product surface

- Dashboard, transactions, conversions, budgets, recurring items, reports, and settings.
- First-time local setup for balances, TRY budget, and payment defaults.
- Command-first and manual transaction capture with preview and balance validation.
- TRY/USD/EUR cash/card balances, conversion/transfer workflows, budgets, and recurring entries.
- Month/range/year reporting plus CSV/JSON import/export and lightweight PDF reports.
- Optional local Ollama categorization and public exchange-rate lookup with fallback behavior.
- Optional Supabase auth/sync behind explicit ledger/account linking.
- Telegram register/webhook routes that fail closed when required configuration is incomplete.

## Persistence and integration model

### Local data

Dexie/IndexedDB is the normal source of truth. Schema v3 adds device metadata without changing
existing finance rows or creating a binding implicitly. Data is browser-profile-local and is not
encrypted by TapTrack; anyone with access to that profile may be able to inspect it.

Local seeding and recurring work complete before optional synchronization. Import and reset affect
only local data. Optional remote dispatch occurs after the enclosing local transaction commits.

### Supabase

Local routes do not require Supabase configuration or authentication. Every remote finance
read/write/delete/retry/manual/background entry point centrally requires configured Supabase, an
authenticated user, an existing device-ledger binding, and an exact user-ID match.

First linking requires explicit confirmation and a successful read-only preflight showing every
supported remote finance table and tombstone set is empty. The binding is immutable in this batch.
Full delete-before-upsert snapshot replacement is disabled. The preflight and later writes are not
atomic, live schema/RLS is unverified, and binding recovery is not implemented.

### Telegram

Register/webhook routes require bot, webhook, owner-chat, owner-user, and Supabase configuration
before downstream work. Invalid secrets and non-owner chats fail before admin/database/bot work.
Authorized mutation is still neither atomic nor idempotent and must remain disabled until repaired.

### Offline/PWA and mobile

The service worker owns a versioned TapTrack-only shell cache for the seven route documents,
manifest/icons, and eligible same-origin static GET resources. It excludes API/auth and
cross-origin requests, keeps the existing complete cache until installation succeeds, and deletes
only obsolete TapTrack-owned caches. Mobile navigation exposes all seven destinations in a
two-row layout.

Credential-free production Playwright proves a warmed service-worker-controlled Chromium session
can navigate all seven routes offline, retain an offline-created synthetic transaction after
reload, keep targets at least 44x44 CSS pixels, avoid horizontal overflow, external requests, and
page errors at 320x720 and 390x844. It does not prove native installed Safari/iOS behavior.

## Framework and security baseline

- Next.js 16.2.12; React / React DOM 19.2.8; TypeScript.
- Node.js 20.9+; CI and independent retest use Node 22.
- ESLint 10.8.0; Vitest 4.1.10; Playwright 1.63.0.
- Locked advisory repairs: `browserslist@4.28.9` and `postcss-selector-parser@6.1.4`.
- Full and production dependency audits: 0 vulnerabilities.

## Verification state

Independent retest verdict: `PASS_WITH_RISKS`.

- Former Dexie failure reproduction: one transaction, zero unhandled rejections.
- Focused Node 22: 7 files / 38 tests PASS.
- Full Vitest: 16 files / 79 tests PASS.
- ESLint, TypeScript, production build: PASS.
- Production route smoke: 8/8 PASS.
- Full/production dependency audits: 0 vulnerabilities.
- Playwright Chromium at 320x720 and 390x844: PASS.

The first independent tester verdict was `FAIL` due to unhandled Dexie rejections after a local
transaction and remains recorded in `QA_REPORT.md`, `DEV_LOG.md`, and shared history.

## Publication status

A reviewed remediation branch/PR may be published, but do not merge, release, deploy, capture
presentation evidence, or claim complete cloud/native safety until the remaining provider,
Safari/iOS, service-worker-upgrade, and remote transaction risks are addressed. GitHub Support
ticket `#4730630` continues to track residual read-only PR refs/cache cleanup from the earlier
strict history rewrite.
