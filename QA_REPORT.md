# QA Report

Workflow schema: `agentic-workflow/v2`
Project: TapTrack
Repository profile: software
Initialized: 2026-09-05

## Current cycle

- Batch: TT-B002 — Canonical ledger/sync correctness, restore/reset/disconnect, integrations, and release hardening
- Implementation verdict: `PASS_WITH_RISKS`
- Implementation closure: `COMPLETE_WITH_RESIDUAL_RISKS`
- Release verdict: `NOT_YET_APPROVED`
- Evidence date: 2026-09-08
- Production baseline: `main@cc43524c99e7944a17df13d76578bf83a79fcb15` remains unchanged

## Evidence integrity

Automated B002 evidence is tied to GitHub head `2e01cda7e69e80a4b75fa2bcea20f253fb4ebbc5` and Actions run `34206762454`.

The automated gate uses synthetic/inert provider configuration for credential-free CI. It proves repository build/test/offline behavior, not a production-equivalent two-account Supabase session, real Telegram delivery, or native installed Safari/iOS behavior.

During the B002 audit, the live Supabase schema/advisors and server-side primitives were inspected and the canonical ledger, restore-generation, AI quota, and Telegram atomic-write migrations were verified/applied as documented. The final provider-backed disposable-account walkthrough is still required before production promotion.

## What B002 changed

B002 replaced or hardened the major correctness paths that remained after TT-B001:

- checkpoint-based canonical balance reconstruction and reconciliation;
- exact/current and historical same-day ordering around reconciliation checkpoints;
- atomic local canonical mutation + durable IndexedDB outbox intent;
- explicit cloud-use vs local-merge adoption;
- multi-device convergence, soft deletes, and same-record last-successful-sync-wins behavior;
- ledger revision/generation handling so stale clients cannot replay pre-restore operations into a replaced account ledger;
- versioned backup validation, safety backup, legacy checkpoint migration, and explicit device/account restore scope;
- anchored recurring schedules and deterministic occurrence IDs;
- historical TCMB/Frankfurter FX and transaction-date report/PDF valuation;
- authenticated server-side Groq categorization with server-only quota enforcement;
- Telegram canonical ledger reads/writes, timezone handling, private-owner policy, atomic transaction batches, and `update_id` idempotency;
- authenticated-layout service-worker registration and strengthened offline-mobile coverage;
- explicit device/account reset semantics;
- explicit device cloud disconnect preserving local canonical data.

## Exact-head automated verification

GitHub Actions run `34206762454` checked out exactly `2e01cda7e69e80a4b75fa2bcea20f253fb4ebbc5` and completed the full `verify` job successfully.

- Locked dependency install: PASS; 553 packages audited.
- Publication guard: PASS.
- Full dependency audit: 0 vulnerabilities.
- Production dependency audit: 0 vulnerabilities.
- ESLint: PASS with 0 errors / 3 non-blocking internal-navigation warnings.
- TypeScript: PASS.
- Vitest: **32/32 files PASS; 172/172 tests PASS**.
- Next.js 16.3.4 production build: PASS.
- Route smoke: **9/9 PASS**.
- Offline mobile Playwright: **2/2 PASS**.
  - `mobile-320`: PASS.
  - `mobile-390`: PASS.

The three lint warnings are the Next.js `no-location-assign-relative-destination` rule on intentional internal document-navigation fallback code in `/app/add`, `DashboardSummary`, and `TransactionEntry`; they do not fail the current gate.

## Destructive-action acceptance

### Restore

- Device-only restore validates first, emits a safety backup, detaches the device, and replaces local canonical state.
- Account-wide restore requires a correctly linked signed-in device and network access, replaces the account through the authenticated route, rotates the ledger generation, then applies the prepared snapshot locally while preserving the binding to the new generation.
- Restore service tests pass in the exact-head suite.

### Reset

- Reset builds a canonical fresh-ledger backup rather than using a separate destructive implementation.
- Device-only reset therefore reuses the validated detach-and-replace path.
- Account-wide reset reuses the generation-rotating account replacement path.
- Reset service tests pass in the exact-head suite.

### Disconnect

- Device disconnect atomically clears the device binding and pending outbox while preserving local canonical finance rows.
- Repeating disconnect when already unlinked is an idempotent no-op.
- Disconnect service tests pass in the exact-head suite.

## Telegram acceptance

The current webhook:

- fails closed on incomplete configuration;
- requires a valid Telegram webhook secret;
- rejects non-owner chats and non-private chats;
- uses the configured IANA timezone for ledger dates;
- calculates `/balance` from canonical ledger state;
- excludes soft-deleted rows from `/today`;
- escapes dynamic Telegram HTML;
- uses `apply_taptrack_telegram_update` for atomic transaction batches;
- uses Telegram `update_id` for retry idempotency.

Webhook tests pass 4/4 on the exact head. The server-side database primitive was rollback-tested during the B002 audit. A configured real-bot end-to-end walkthrough remains release evidence, not automated CI evidence.

## PWA acceptance

The service worker is registered from the authenticated application layout rather than the root layout. This prevents an unauthenticated service-worker install from precaching redirected login content under authenticated application-route cache keys.

The exact B002 head passes the current Chromium offline-mobile suite at both required viewports. Native installed Safari/iOS behavior and an explicit old-service-worker-to-new-service-worker upgrade scenario remain outside this evidence.

## Release-state verification

- PR #4 / TT-B001 was merged into `main` on 2026-09-05.
- B002 remains a separate remediation branch and is not merged into `main`.
- Production remains on the TT-B001 `main` baseline.
- The latest READY Vercel preview observed before documentation reconciliation was `df77b3370ca4f71edd8b72a8bf68aba444540e38`, which predates final Settings wiring/cleanup and these documentation commits.
- Therefore a READY Vercel preview of the final documentation-frozen B002 head is still required.

## Residual risks / release gates

See `RISK_REGISTER.md` for the authoritative list. Release-relevant residuals include:

- provider-backed disposable two-account/multi-device walkthrough not yet completed on the final preview;
- native installed Safari/iOS behavior not verified;
- empty-cloud binding + initial seed is rechecked/fail-closed but not one server transaction;
- JavaScript `number` remains the money representation;
- IndexedDB is not application-level encrypted;
- historical/public-artifact review remains required;
- Supabase leaked-password protection remains a project-level setting;
- `20260908_enforce_protected_sync_writes.sql` must be applied only after the compatible application is deployed and smoke-tested.

## Current verdict

B002's implementation is mechanically green and the previously unresolved restore/reset/disconnect/Telegram correctness paths are implemented. That is sufficient to move from engineering remediation into release preparation.

It is **not** sufficient to merge/promote immediately. Freeze documentation, obtain an exact-head READY preview, complete the disposable-account provider walkthrough, review public/history artifacts, obtain explicit owner approval, deploy the compatible app, then apply the protected-write migration and run a final production smoke test.
