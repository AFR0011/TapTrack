# Publication Readiness

TapTrack is being prepared as a public engineering portfolio repository. The public presentation should focus on the local-first canonical ledger, durable offline/sync design, multiple transaction-capture modes, historical FX handling, authenticated Groq integration, responsive/PWA behavior, and automated verification.

## Required before public release

- [x] Upgrade to the patched Next.js 16.3.4 / React 19.2.8 baseline.
- [x] Align ESLint with the supported Next lint stack.
- [x] Pass full and production dependency audits at the configured severity threshold.
- [x] Replace mutable synced balances with checkpoint-based canonical ledger semantics.
- [x] Make normal canonical finance writes and durable sync intent atomic in IndexedDB.
- [x] Add explicit cloud-vs-local adoption and multi-device convergence coverage.
- [x] Add Quick Add while preserving Command and detailed transaction entry.
- [x] Add `/app/add` deep-link capture and Android PWA shortcuts.
- [x] Replace hard-coded FX fallbacks with historical TCMB rates via Frankfurter.
- [x] Make TRY-unified reports and PDF export use each transaction's historical date.
- [x] Replace Ollama with authenticated server-side Groq categorization.
- [x] Add production CSP/security headers and smoke assertions.
- [x] Repair Supabase auth callback handling for PKCE/email confirmation flows.
- [x] Pass lint, typecheck, **24 Vitest files / 137 tests**, production build, route smoke, and offline mobile Playwright verification on the remediation branch.
- [x] License the source code under the MIT License.
- [x] Update primary architecture/security/project-state documentation to match the remediation branch.
- [ ] Decide and implement JSON import semantics for the checkpoint-based canonical ledger.
- [ ] Decide and implement device-local vs account-wide reset semantics.
- [ ] Coordinate the staged server-only Groq quota migration with the matching application route.
- [ ] Re-run live Supabase security advisors after coordinated migration deployment.
- [ ] Enable Supabase leaked-password protection if available/appropriate for the project plan.
- [ ] Complete the historical Git review for old environment files, credentials, real finance data, screenshots, or provider identifiers.
- [ ] Use only synthetic/demo financial values and transaction descriptions in public screenshots.
- [ ] Perform a final authenticated walkthrough using a disposable Supabase account.
- [ ] Obtain explicit owner approval before merging the remediation branch or promoting it to production.

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
- historical TCMB FX conversion with prior-published-date fallback only;
- Month/Range/Year reporting and matching historical-FX PDF export;
- authenticated Groq categorization with server-only credentials and per-account quota;
- PKCE/token-hash auth callback handling;
- CSP and related production security headers;
- PWA/offline mobile verification;
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

Telegram integration is deliberately deferred. Legacy Telegram route code should not be presented as part of the canonical ledger guarantees until it is redesigned and verified.

The existing legacy JSON import/reset path is also not release-ready for the new checkpoint-based synchronized ledger until merge/replace and device/account reset semantics are explicitly decided and implemented.

## Public claims that are currently supportable

The remediation branch can accurately claim that:

- ordinary finance capture is local-first and can operate offline after the PWA shell is warmed;
- opening/reconciliation checkpoints plus later finance events define canonical balance state;
- display balances are derived rather than independently synchronized truth;
- normal canonical finance writes store durable sync intent atomically with the local mutation;
- same-record conflicts use last successful sync wins;
- recurring occurrence IDs converge across devices;
- historical FX values are fetched from TCMB via Frankfurter and do not use estimated hard-coded fallbacks;
- TRY-unified report screen and PDF export use transaction-date valuation;
- hosted AI categorization is authenticated and server-side;
- current automated Chromium coverage verifies offline mobile navigation and persistence of an offline Quick Add transaction.

Do **not** claim native Safari/iOS offline verification, production Telegram correctness, or release-ready synced import/reset behavior yet.

## Privacy presentation rule

Screenshots, GIFs, demo exports, database examples, and sample sync payloads intended for the public repository should use synthetic names, amounts, account balances, provider identifiers, and transaction histories.

Never publish screenshots containing real Supabase service-role credentials, Groq credentials, Telegram tokens, webhook secrets, real user IDs, or personal finance history.

## Release sequence

1. Resolve import/reset/account-unlink product semantics.
2. Implement and test those decisions.
3. Coordinate remaining Supabase migrations with matching branch code.
4. Re-run Supabase advisors and automated CI.
5. Perform disposable-account authenticated manual testing.
6. Review the final Vercel preview and repository diff/history.
7. Merge/promote only after explicit owner approval.

## License

TapTrack source code is released under the MIT License. See `LICENSE`.
