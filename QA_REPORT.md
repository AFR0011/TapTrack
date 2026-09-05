# QA Report

Workflow schema: `agentic-workflow/v2`
Project: TapTrack
Repository profile: software
Initialized: 2026-09-05

## Current cycle

- Batch: TT-B001 — Offline/mobile local core and safe opt-in sync boundary
- Final verdict: `PASS_WITH_RISKS`
- Closure: `COMPLETE_WITH_RISKS`
- Evidence date: 2026-09-05

## Evidence integrity

- Tests used absent/inert provider configuration and synthetic finance data.
- No live Supabase or Telegram mutation was authorized or attempted.
- Browser evidence covers a warmed, service-worker-controlled Chromium application, not a native installed iOS/Safari PWA.
- The first independent tester verdict was `FAIL` and remains part of this record.

## Initial independent failure and repair

The first tester reproduced three unhandled Dexie `NotFoundError` promise rejections after an
ordinary local transaction. Optional sync authorization was reading the new `deviceMetadata`
table while the narrower finance transaction was active. Repair 1 moved optional sync dispatch
after the local transaction commits, passed the originating database through the sync boundary,
made metadata-read failures fail closed, caught remote rejections, and added unit/browser
regression assertions.

## Independent retest

- Former reproduction: `{"transactions":1,"unhandled":[]}`.
- Focused Node 22 verification: 7 files / 38 tests PASS.
- Full Vitest: 16 files / 79 tests PASS.
- ESLint: PASS.
- TypeScript: PASS.
- Next.js production build: PASS.
- Production route smoke: 8/8 PASS.
- Full dependency audit: 0 vulnerabilities.
- Production dependency audit: 0 vulnerabilities.
- Playwright Chromium `320x720`: PASS.
- Playwright Chromium `390x844`: PASS.
- Browser assertions: all seven routes online and offline; offline-created transaction persisted;
  all mobile navigation targets at least 44x44 CSS pixels; no document overflow, external request,
  or captured `pageerror`.
- Source diff integrity: unchanged during independent retest; frozen tracked diff hash
  `d7892a247983e53a98442c284e7ab53803df3926` before documentation reconciliation.

## Acceptance result

- AC1–AC10 and AC12: PASS.
- AC11: PASS_WITH_RISK because cache ownership/version behavior is statically covered and current
  offline behavior passes, but an explicit multi-version upgrade simulation was not run.
- AC13: PASS after this documentation reconciliation.

## Residual risks

- Live disposable two-account Supabase schema, grants, and RLS behavior remain unverified.
- Native Safari/iOS installed-PWA relaunch and storage-eviction behavior remain unverified.
- An explicit old-service-worker-to-new-service-worker upgrade scenario remains unverified.
- IndexedDB remains unencrypted and visible to another person with access to the browser profile.
- The first immutable account binding has no self-service recovery path.
- Empty-remote preflight and later writes are not one server-side transaction and retain a TOCTOU race.
- Authorized Telegram mutation is not atomic or idempotent.
- GitHub presentation and release remain blocked.

## Bootstrap validation

The initial structural audit failed on missing workflow files and stale governance. After the
governance pack and accepted batch were added, the repository-bootstrap audit passed with no
warnings or errors and reported `READY_FOR_DEV_LOOP`.
