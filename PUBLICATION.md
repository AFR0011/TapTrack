# Publication Readiness

TapTrack is being prepared as a public engineering portfolio repository. The public presentation should focus on the local-first canonical ledger, durable offline/sync design, explicit destructive-action semantics, multiple transaction-capture modes, historical FX handling, authenticated Groq integration, private-owner Telegram integration, responsive/PWA behavior, and automated verification.

This file describes the B002 remediation branch. Production `main` remains on the earlier TT-B001 baseline until an explicit release decision is made.

## Required before public release

### Engineering implementation

- [x] Upgrade to the patched Next.js 16.3.4 / React 19.2.8 baseline.
- [x] Align ESLint with the supported Next lint stack.
- [x] Pass full and production dependency audits at the configured severity threshold.
- [x] Replace mutable synced balances with checkpoint-based canonical ledger semantics.
- [x] Make normal canonical finance writes and durable sync intent atomic in IndexedDB.
- [x] Add explicit cloud-vs-local adoption and multi-device convergence coverage.
- [x] Add ledger revision/generation handling for account-wide replacement and stale clients.
- [x] Add Quick Add while preserving Command and detailed transaction entry.
- [x] Add `/app/add` deep-link capture and Android PWA shortcuts.
- [x] Replace hard-coded FX fallbacks with historical TCMB rates via Frankfurter.
- [x] Make TRY-unified reports and PDF export use each transaction's historical date.
- [x] Replace Ollama with authenticated server-side Groq categorization.
- [x] Restrict the live Groq quota RPC to service-role execution and verify browser roles cannot execute it.
- [x] Add production CSP/security headers and smoke assertions.
- [x] Repair Supabase auth callback handling for PKCE/email confirmation flows.
- [x] Implement versioned JSON backup/restore with strict validation, pre-restore safety backup, and legacy checkpoint migration.
- [x] Implement explicit **restore only this device** and **restore synced account** behavior.
- [x] Implement explicit **reset only this device** and **reset synced account everywhere** behavior by reusing the validated restore/replacement machinery.
- [x] Add explicit **disconnect this device** behavior that preserves canonical local data and leaves the cloud account unchanged.
- [x] Rebuild Telegram against the canonical ledger with private-owner authorization, timezone-aware dates, atomic batch writes, and `update_id` idempotency.
- [x] Scope service-worker registration to the authenticated application shell.
- [x] Pass the complete B002 gate on implementation head `2e01cda7e69e80a4b75fa2bcea20f253fb4ebbc5`: 32 Vitest files / 172 tests, production build, 9 route-smoke checks, and both offline-mobile Playwright projects.
- [x] License the source code under the MIT License.

### Final release evidence

- [ ] Finish documentation reconciliation and freeze the final B002 head.
- [ ] Pass the complete CI gate on that documentation-frozen head.
- [ ] Obtain a READY Vercel preview whose Git commit SHA exactly matches the final head.
- [ ] Configure preview/provider secrets without exposing them to the repository.
- [ ] Perform a disposable-account authenticated walkthrough covering first device, second-device use-cloud, second-device merge, two-device offline convergence, reconciliation, recurring, FX/reporting, account/device restore, account/device reset, disconnect/relink, Telegram, and Groq.
- [ ] Complete the historical Git/public-artifact review for old environment files, credentials, real finance data, screenshots, or provider identifiers.
- [ ] Use only synthetic/demo financial values and transaction descriptions in public screenshots/exports.
- [ ] Enable Supabase leaked-password protection if available/appropriate for the project plan, or record the accepted project-level limitation.
- [ ] Obtain explicit owner approval before merging/promoting B002.
- [ ] Deploy the compatible application before applying `20260908_enforce_protected_sync_writes.sql`.
- [ ] Smoke-test production before and after the protected-write migration.

## Project scope

TapTrack is a mobile-first, local-first personal finance application built with Next.js, React, TypeScript, Dexie/IndexedDB, and Supabase Auth, with optional remote canonical sync and server-side integrations.

Implemented engineering features include:

- guided Quick Add, command/multi-entry parsing, and detailed transaction editing;
- one-time opening balance checkpoints and monthly reconciliation checkpoints;
- derived balance rebuilding from checkpoints, transactions, and conversions;
- deterministic same-day ordering around reconciliation boundaries;
- monthly/category budgeting and rollover;
- anchored recurring schedules and deterministic recurring occurrence IDs;
- durable IndexedDB sync outbox with atomic finance+intent commits;
- explicit cloud-use vs local-merge account adoption;
- two-device convergence tests including conflicting offline edits and deletes;
- generation-aware account restore/reset and stale-client protection;
- device-only/account-wide restore and reset choices;
- explicit per-device cloud disconnect;
- historical TCMB FX conversion with prior-published-date fallback only;
- Month/Range/Year reporting and matching historical-FX PDF export;
- authenticated Groq categorization with server-only credentials and per-account quota;
- private-owner Telegram capture through an atomic/idempotent server-side write primitive;
- PKCE/token-hash auth callback handling;
- CSP and related production security headers;
- PWA/offline mobile Chromium verification;
- Android manifest shortcuts and stable `/app/add` deep-link capture.

## Product boundaries

TapTrack does not implement:

- bank or payment-network integrations;
- accounting, tax, or investment advice;
- application-level encrypted local finance storage;
- team/shared-account finance workflows;
- native iOS/Android interactive widgets;
- receipt/photo OCR;
- a server-side background recurring scheduler.

Telegram is intentionally a **single private-owner** integration in the current release design. Group/shared financial mutation is fail-closed rather than supported implicitly.

Native installed Safari/iOS behavior has not been verified. The empty-cloud binding path rechecks remote emptiness before binding but does not make claim + initial seed one server transaction. JavaScript `number` remains the money representation. These are documented residuals, not claims to be hidden in portfolio copy.

## Public claims currently supportable from implementation + CI

B002 can accurately claim that:

- ordinary finance capture is local-first and can operate offline after the PWA shell is warmed;
- opening/reconciliation checkpoints plus later finance events define canonical balance state;
- display balances are derived rather than independently synchronized truth;
- normal canonical finance writes store durable sync intent atomically with the local mutation;
- devices require explicit account binding and mismatched accounts fail closed;
- same-record conflicts use last successful sync wins;
- recurring occurrence IDs converge across devices;
- versioned device/account restore and reset semantics are implemented;
- explicit device disconnect preserves the local canonical ledger while removing the sync binding/outbox;
- account-wide replacement rotates ledger generation so stale clients can adopt rather than replay pre-replacement work;
- historical FX values are fetched from TCMB via Frankfurter and do not use estimated hard-coded fallbacks;
- TRY-unified report screen and PDF export use transaction-date valuation;
- hosted AI categorization is authenticated and server-side;
- Telegram canonical transaction batches are applied by an atomic/idempotent server-side primitive and group access is fail-closed;
- current automated Chromium coverage verifies offline mobile navigation and persistence of an offline Quick Add transaction;
- exact implementation head `2e01cda7...` passed 32/32 Vitest files, 172/172 tests, build, 9/9 route smoke, and both mobile Playwright projects.

Do **not** claim that:

- B002 is already production;
- native installed Safari/iOS behavior has been verified;
- a final production-equivalent real-bot or two-device provider walkthrough has already been completed on the release head;
- empty-cloud claim-and-seed is a single server-side transaction;
- IndexedDB is encrypted by TapTrack;
- money uses exact integer-minor-unit/decimal arithmetic;
- the protected-write migration is already safe to apply while old `main` remains production.

## Privacy presentation rule

Screenshots, GIFs, demo exports, database examples, and sample sync payloads intended for the public repository must use synthetic names, amounts, account balances, provider identifiers, and transaction histories.

Never publish screenshots containing real Supabase service-role credentials, Groq credentials, Telegram tokens, webhook secrets, real user IDs, or personal finance history.

## Required release sequence

1. Finish/freeze B002 documentation and implementation.
2. Pass the complete CI gate on the exact final head.
3. Obtain a READY Vercel preview for that exact Git SHA.
4. Configure preview/provider secrets and complete the disposable-account walkthrough.
5. Complete history/public-artifact review and owner release review.
6. Merge/promote the compatible B002 application.
7. Smoke-test production while existing direct-write privileges still support rollback/recovery.
8. Apply `20260908_enforce_protected_sync_writes.sql`.
9. Smoke-test production again, including canonical browser mutation through the server-mediated sync route.
10. Only then describe the protected-write production boundary as deployed.

## Current readiness judgment

The major engineering remediation is complete enough for release preparation. The remaining work is evidence and coordinated deployment, not another broad redesign.

Release is **not approved yet** because the exact final preview, provider-backed walkthrough, history/public-artifact review, owner approval, and protected-write migration sequence remain outstanding.

## License

TapTrack source code is released under the MIT License. See `LICENSE`.
