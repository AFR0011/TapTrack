# Development Log

Workflow schema: `agentic-workflow/v2`
Project: TapTrack
Repository profile: software
Initialized: 2026-09-05

## 2026-09-05 - Repository bootstrap

- Classified as `software` with traits: none.
- Created missing governance files without modifying product/source artifacts.
- Classification evidence is recorded in `docs/REPO_PROFILE.md`.
- Reconciled stale Next.js 14/`middleware.ts`, audit, auth/offline, and publication-readiness claims against the rewritten source and current CI.
- Recorded the owner-required LifeOS offline/mobile release gate and active privacy/integrity risks.
- Created branch `remediation/offline-mobile-core`; no product code has been changed during INIT/PLAN.

## 2026-09-05 - TT-B001 implementation

- Accepted the independently planned offline/mobile local-core and safe opt-in sync contract in
  `BLUEPRINT.md`; final repository-bootstrap audit returned `PASS` with no warnings.
- Removed the unauthenticated app redirect and fabricated Supabase client. Login now exposes a
  local-ledger path and provider failure cannot gate local routes.
- Added additive Dexie v3 device metadata and an explicit immutable account binding with an
  all-table read-only empty-remote preflight. Centralized sync authorization blocks every remote
  finance entry point unless provider, user, binding, and user ID all match.
- Disabled destructive full remote replacement and removed import/reset calls to it. Local seeding
  and recurring processing now precede optional sync; local and sync errors are reported separately.
- Made Telegram register/webhook paths fail closed before downstream work when required owner or
  provider configuration is missing, and reject non-owner chats without a response call.
- Exposed all seven core routes in a two-row mobile navigation layout and added offline full-document
  navigation. Added a versioned, TapTrack-owned application-shell cache for all core route documents
  and same-origin static assets.
- Added credential-free Playwright verification for 320x720 and 390x844 plus CI integration.
- Repaired only the locked vulnerable transitive resolutions: `browserslist@4.28.9` and
  `postcss-selector-parser@6.1.4`.

### Executor evidence before independent testing

- Publication guard: PASS.
- Focused auth/binding/migration/sync/Telegram tests: 23/23 PASS.
- Full Vitest: 16 files, 78 tests PASS.
- ESLint: PASS. TypeScript: PASS. Next.js production build: PASS.
- Full dependency audit: 0 vulnerabilities. Production dependency audit: 0 vulnerabilities.
- Production route smoke: 8/8 PASS.
- Playwright Chromium: `mobile-320` PASS and `mobile-390` PASS. Both exercised all seven warmed
  routes offline, 44x44 minimum navigation targets, no document overflow, no external requests,
  and an offline-created transaction surviving reload.
- `git diff --check`: PASS (line-ending notices only).
- Product diff frozen for independent TEST; root will not repair source during tester review.

## 2026-09-05 - Independent TEST failure and repair 1

- Tester verdict: `FAIL`. Ordinary `createTransaction()` completed its local write but produced
  three unhandled Dexie `NotFoundError` rejections because sync authorization read the new
  `deviceMetadata` table while the narrower finance transaction was still active.
- Preserved the failing verdict and returned TT-B001 to EXECUTE.
- Repair: transaction-producing services now return their sync payload, commit the local Dexie
  transaction, and only then dispatch optional remote work. Sync dispatch receives the originating
  database, fails closed if binding metadata cannot be read, and catches remote promise rejection.
- Added a transaction-composition regression test and browser `pageerror` assertion. Adding
  `deviceMetadata` to finance transactions or holding a transaction across provider work was
  intentionally rejected.
- Repair executor verification: transaction/conversion/sync focus 16/16 PASS; full Vitest 16 files,
  79 tests PASS; ESLint, TypeScript, production build, full/production audits, and route smoke PASS;
  Playwright `mobile-320` and `mobile-390` PASS with zero captured page errors. The explicit
  Playwright 90-second scenario budget replaces an unsuitable 30-second whole-test default.

## 2026-09-05 - TT-B001 independent retest and closure

- Independent tester verdict: `PASS_WITH_RISKS`; the former reproduction returned one saved
  transaction and zero unhandled rejections.
- Focused Node 22 checks passed 7 files / 38 tests; full Vitest passed 16 files / 79 tests.
- ESLint, TypeScript, production build, route smoke 8/8, full/production dependency audits, and
  both Playwright viewport projects passed.
- Browser evidence covered all seven routes online/offline, local persistence, touch targets,
  overflow, external requests, and page errors using synthetic data.
- Documentation QA recommended `COMPLETE_WITH_RISKS` after reconciliation. The first tester
  `FAIL` remains recorded; presentation/release remains blocked by the documented residuals.

## 2026-09-05 - CI harness repair

- The first push/PR CI executions reached the browser step after all preceding gates, then failed
  before Playwright ran because the route-smoke server left a child process bound to port 3000.
- Isolated the Playwright-managed production server on port 3100. This changes test orchestration
  only; the same credential-free two-viewport scenario and product build remain in use.
- Removed two hard-coded port-3000 assumptions from the browser test by deriving the configured
  application origin. Local rerun: `mobile-320` PASS, `mobile-390` PASS, 2/2 in 51.4 seconds.
- Published repair head `fad68f42859c6e0eb3231b76f32bdd6166d85e0f`; push run
  `33980471775` and pull-request run `33980469736` both passed the complete CI workflow. Vercel
  preview checks also passed. PR #4 remained open at that point and was subsequently merged into
  `main` as `cc43524c99e7944a17df13d76578bf83a79fcb15`.

## 2026-09-07 to 2026-09-08 - TT-B002 correctness remediation

- Continued on `remediation/taptrack-correctness-b002` from the TT-B001 production baseline.
- Rebuilt balance semantics around immutable opening/reconciliation checkpoints plus transaction
  and conversion replay. `balances` is derived cache, not synchronized canonical truth.
- Added durable local finance + outbox atomicity across canonical mutation paths and expanded
  two-device convergence coverage.
- Added explicit cloud adoption: use-cloud, merge-local, and fail-closed empty-cloud linking.
- Added ledger revision/generation support so account-wide replacement rotates the account generation
  and stale devices adopt the new snapshot instead of replaying pre-replacement pending writes.
- Added versioned JSON backup validation, safety backups, legacy checkpoint migration, and linked
  restore scope: restore only this device vs restore the synced account.
- Anchored recurring schedules and deterministic occurrence IDs; online startup now pulls cloud
  recurring state before due-occurrence generation.
- Replaced estimated/hard-coded FX fallback behavior with historical TCMB rates via Frankfurter and
  added transaction-date TRY report/PDF conversion.
- Replaced the old local Ollama assumption with authenticated server-side Groq categorization and
  live server-only Supabase quota hardening.
- Rebuilt Telegram against canonical ledger state. `/balance` uses calculated ledger balance,
  `/today` is timezone-aware, dynamic HTML is escaped, non-owner/non-private chats fail closed, and
  transaction batches use a server-only atomic/idempotent RPC keyed by Telegram `update_id`.
- Moved service-worker registration into the authenticated app layout so unauthenticated installs
  cannot cache login redirects under app-route cache keys.
- Fixed the stale Telegram integration fixtures by adding `TAPTRACK_TIME_ZONE=Europe/Istanbul` to
  the complete test environment and `.env.example`; cleaned webhook test warnings.
- Implemented reset by reusing restore/replacement invariants: device-only reset detaches and replaces
  only local canonical state; account-wide reset rotates generation and replaces the synced account
  with a fresh ledger. Both produce pre-reset safety backups.
- Added explicit device cloud disconnect: binding + pending outbox are removed atomically while local
  canonical finance data and the cloud account remain unchanged. Disconnect is idempotent when the
  device is already unlinked.

### TT-B002 implementation evidence

- Implementation head: `2e01cda7e69e80a4b75fa2bcea20f253fb4ebbc5`.
- GitHub Actions run `34206762454`: PASS.
- Publication guard: PASS.
- Full dependency audit: 0 vulnerabilities.
- Production dependency audit: 0 vulnerabilities.
- ESLint: 0 errors, 3 non-blocking internal-navigation warnings.
- TypeScript: PASS.
- Vitest: 32/32 files, 172/172 tests PASS.
- Next.js production build: PASS.
- Route smoke: 9/9 PASS.
- Playwright: `mobile-320` PASS, `mobile-390` PASS.

### TT-B002 release-preparation state

- Production `main` remains at `cc43524c99e7944a17df13d76578bf83a79fcb15`.
- The latest READY preview observed before documentation reconciliation was `df77b3370ca4f71edd8b72a8bf68aba444540e38`, not the final Settings/documentation head.
- README, SECURITY, project state, QA, risk, and publication records were therefore reconciled after
  implementation closure.
- Final release still requires: CI on the documentation-frozen head; matching READY Vercel preview;
  disposable-account provider-backed walkthrough; historical/public-artifact review; explicit owner
  approval; deployment of compatible B002 code; then application of
  `20260908_enforce_protected_sync_writes.sql` followed by a second production smoke test.
- Native installed Safari/iOS PWA behavior, JavaScript-number money precision, IndexedDB-at-rest
  exposure, and the narrow empty-cloud claim/seed TOCTOU remain documented residuals.
