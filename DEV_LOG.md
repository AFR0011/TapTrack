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
