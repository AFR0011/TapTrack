# TapTrack Project State

Last updated: 2026-09-08

## Current status

TapTrack is a Next.js 16.3.4 / React 19.2.8 local-first personal finance application with optional authenticated Supabase synchronization and server-side Groq, exchange-rate, restore, sync, and Telegram integration routes.

The working branch is `remediation/taptrack-correctness-b002`. It is ahead of `main` and contains the canonical-ledger/sync correctness redesign plus restore/reset/disconnect and integration hardening. Production `main` remains at `cc43524c99e7944a17df13d76578bf83a79fcb15`; B002 has not been promoted.

The implementation is now mechanically green. Release preparation remains incomplete because the final documentation-frozen head still needs an exact Vercel preview and a provider-backed disposable-account walkthrough before owner approval and coordinated production migration.

## Product and engineering status

### Complete in B002

- checkpoint-based canonical ledger and derived balance cache;
- opening balances and reconciliation checkpoints;
- exact current activity ordering and explicit before/after reconciliation handling for ambiguous historical same-day activity;
- Quick Add, Command mode, detailed editor, and `/app/add` shortcut capture through common ledger services;
- atomic local finance mutation + durable IndexedDB sync intent;
- explicit device-to-account binding and account-mismatch protection;
- cloud-use vs local-merge adoption;
- durable retry, soft deletes, multi-device convergence, and same-record last-successful-sync-wins behavior;
- ledger revision/generation protection for account-wide replacement and stale clients;
- versioned JSON backup validation, safety backup, legacy checkpoint migration, and explicit device/account restore scope;
- explicit device/account reset scope implemented by reusing the restore/replacement invariants;
- explicit device cloud disconnect preserving canonical local data;
- anchored monthly/yearly recurring behavior and deterministic occurrence IDs;
- historical TCMB rates via Frankfurter with prior-published-date fallback only;
- transaction-date TRY report conversion and matching PDF valuation;
- authenticated server-side Groq categorization and server-only quota enforcement;
- Telegram private-owner webhook with timezone handling, canonical reads, atomic/idempotent transaction batches, and fail-closed authorization;
- authenticated-layout service-worker registration and offline-mobile Chromium coverage;
- PKCE/token-hash auth callback handling, CSP/security headers, and dependency/security gates.

### Release verification still pending

- READY Vercel preview for the final documentation-frozen B002 head;
- disposable-account authenticated multi-device walkthrough against that preview;
- real configured private-owner Telegram walkthrough;
- final public-history/demo-artifact review;
- explicit owner approval;
- coordinated production deployment followed by the staged protected-write migration and production smoke.

### Residual limitations, not silently promoted to “done”

- native installed Safari/iOS PWA relaunch/upgrade/storage-eviction behavior is unverified;
- empty-cloud preflight/binding is rechecked and fail-closed, but claim + initial seed is not one server transaction;
- IndexedDB is not application-level encrypted;
- JavaScript `number` remains the money representation;
- no bank/payment-network integration, native interactive widget, receipt OCR, shared/team finance model, or server-side recurring scheduler.

## Canonical ledger model

### Opening and reconciliation checkpoints

Initial setup creates opening checkpoints for configured balances. Later real-world balance corrections are represented as reconciliation checkpoints containing the observed absolute balance, resulting delta, date, and ordering information.

Reconciliation changes canonical balance state without pretending they are ordinary income/expense activity. Reports and budgets therefore do not count a reconciliation adjustment as spending or income.

### Derived balances

The local `balances` table is cache only. Current balances are rebuilt from the latest applicable opening/reconciliation checkpoint plus subsequent transactions and conversions.

Normal application paths do not synchronize or independently mutate `balances` as remote financial truth.

### Same-day ordering

Current activity receives exact occurrence timestamps. If historical activity is entered on the same calendar day as a reconciliation checkpoint and its relative order cannot be inferred, the UI asks whether it happened before or after reconciliation and stores deterministic boundary ordering.

## Synchronization model

### Device binding

Finance sync is opt-in. A browser must hold an explicit binding to the currently authenticated Supabase user before remote finance work is authorized. Signing into a different account while the old binding exists produces an account-mismatch state rather than silently reusing the local ledger with the new account.

B002 also provides an explicit **Disconnect this device** action. Disconnect removes the device binding and pending outbox atomically, keeps canonical local finance data, and does not mutate the cloud account.

### Adoption

Before first link, TapTrack inspects local and cloud state.

- Empty cloud: the device can seed the account after a second fail-closed remote-empty check.
- Cloud data + untouched local device: use cloud data.
- Cloud data + meaningful local data: require an explicit choice between **Use cloud data** and **Merge this device**.

The empty-cloud check is repeated immediately before binding, but the subsequent initial seed is still a separate operation. That narrow claim/seed race remains documented as TT-R15.

### Durable outbox and convergence

Canonical local mutations and their corresponding sync intents are committed in one IndexedDB transaction. Network delivery happens after local commit, so a crash/network failure cannot leave an accepted local finance change without durable retry intent.

The sync system covers canonical transactions, checkpoints, conversions, budgets, categories, recurring rules, and synchronized settings. It supports soft deletes, protects pending optimistic local rows from remote overwrite, rebuilds derived balances after pulls, and uses last-successful-sync-wins behavior for conflicting edits to the same existing record.

Recurring occurrences use deterministic IDs so two devices generating the same logical due item converge instead of duplicating it.

### Ledger generation

Account-wide restore/reset rotates a server-side ledger generation. A linked client that later observes a different generation adopts the replaced account snapshot rather than replaying stale pre-replacement pending work into it.

## Backup, restore, reset, and disconnect

### Backup/restore

The backup format is versioned. Restore prepares and validates the complete payload before mutation, produces a pre-restore safety backup, excludes device-local/derived sync state, and migrates valid legacy balance data into checkpoint form.

A linked user chooses scope explicitly:

- **Restore only this device**: detach from sync and restore locally.
- **Restore synced account**: authenticated server-side replacement, generation rotation, then local replacement while preserving the binding to the new generation.

### Reset

Reset deliberately reuses the same replacement machinery by generating a valid fresh-ledger backup.

- **Reset only this device**: safety backup, detach, fresh local ledger, setup shown again.
- **Reset synced account everywhere**: safety backup, generation-rotating account replacement, fresh canonical ledger for the account, linked devices adopt the new generation.

This avoids maintaining a second destructive-action implementation with different invariants.

### Disconnect

Disconnect is not restore or reset. It leaves both local and cloud canonical ledgers intact while removing only this browser's binding and pending outbox for the old link.

## Telegram integration

Telegram is implemented as an optional private-owner integration rather than a deferred legacy path.

Configuration requires:

- `TELEGRAM_BOT_TOKEN`;
- `TELEGRAM_WEBHOOK_SECRET`;
- `TAPTRACK_OWNER_TELEGRAM_CHAT_ID`;
- `TAPTRACK_OWNER_USER_ID`;
- `TAPTRACK_TIME_ZONE`;
- server-side Supabase configuration.

The webhook fails closed when configuration is incomplete, validates the Telegram secret, rejects non-owner and non-private chats, calculates `/balance` from canonical ledger state, uses timezone-aware `/today`, excludes soft-deleted rows, escapes HTML, and applies transaction batches through `apply_taptrack_telegram_update` with Telegram `update_id` as the idempotency key.

The database primitive and automated tests are in place. A final production-equivalent real-bot/disposable-account walkthrough remains release evidence.

## Recurring, FX, and reporting

Monthly/yearly recurring schedules preserve their original anchor rather than allowing JavaScript date rollover to drift the rule. Deterministic occurrence IDs prevent duplicate cross-device generation.

Historical cross-currency exchange uses real TCMB data exposed via Frankfurter. If the selected date has no published rate, TapTrack uses only the most recent prior published rate; it does not invent a hard-coded fallback.

Reports support Month, Range, and Year. With **Convert all to TRY**, each foreign-currency transaction is valued using its own transaction date. PDF export consumes the same historical-rate map as the on-screen report.

## AI categorization

Groq categorization requires a valid Supabase session. The API key is server-only, request/response values are validated, signed-out use remains local/deterministic, and per-account quota consumption is enforced through a server-only Supabase path.

## Offline/PWA

Service-worker registration is scoped to the authenticated application layout. The current CI verifies warmed offline navigation and an offline-created Quick Add transaction persisting after reload at 320x720 and 390x844.

This automated evidence is Chromium evidence only. It does not imply native Safari/iOS installed-PWA behavior.

## Verification baseline

Runtime/tooling baseline:

- Next.js 16.3.4;
- React / React DOM 19.2.8;
- Node.js 22.x;
- ESLint 9.39.5;
- Vitest 4.1.10;
- Playwright 1.63.0.

Exact implementation evidence is GitHub Actions run `34206762454` on head `2e01cda7e69e80a4b75fa2bcea20f253fb4ebbc5`:

- publication guard: PASS;
- full dependency audit: 0 vulnerabilities;
- production dependency audit: 0 vulnerabilities;
- ESLint: 0 errors / 3 known non-blocking warnings;
- TypeScript: PASS;
- Vitest: **32 files / 172 tests PASS**;
- production build: PASS;
- route smoke: **9/9 PASS**;
- offline mobile Playwright: **2/2 PASS**.

Documentation commits after that evidence require a final CI pass on the documentation-frozen head before release review.

## Supabase release boundary

The live project has already been inspected/hardened through the B002 work, including canonical-ledger, backfill, quota, ledger-generation/restore, Telegram atomic-write, and Telegram RLS changes described by the repository migrations.

`20260908_enforce_protected_sync_writes.sql` is intentionally staged and must remain unapplied while old `main` is production. It removes direct authenticated-browser canonical write privileges that the old application still depends on.

Release ordering is therefore mandatory:

1. freeze B002 implementation/docs and obtain a green exact-head CI run;
2. obtain a READY exact-head Vercel preview;
3. configure preview/provider secrets and complete the disposable-account walkthrough;
4. review public/history artifacts and obtain explicit owner approval;
5. deploy the compatible B002 application;
6. smoke-test production before privilege removal;
7. apply `20260908_enforce_protected_sync_writes.sql`;
8. run a second production smoke test.

## Release status

B002 is no longer in major-redesign territory. The code is in release preparation, not production approval.

Do not merge/promote solely because automated CI is green. The remaining work is exact-head deployment evidence, provider-backed verification, artifact/history review, owner approval, and correct migration ordering.
