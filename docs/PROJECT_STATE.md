# TapTrack Project State

Last updated: 2026-09-08

## Current status

TapTrack is a Next.js 16.3.4 / React 19.2.8 local-first personal finance application with an optional authenticated Supabase synchronization layer.

The remediation branch `remediation/taptrack-correctness-b002` has replaced the original mutable-balance/best-effort-sync architecture with a checkpoint-based canonical ledger, durable IndexedDB sync outbox, explicit cloud adoption flow, historical exchange-rate handling, authenticated Groq categorization, and verified mobile/offline transaction capture.

This document describes the remediation branch, not the production `main` deployment. `main` and the production Vercel deployment remain unchanged until an explicit release decision is made.

## Implemented product surface

- Dashboard, transactions, conversions, budgets, recurring items, reports, settings, and `/app/add` shortcut capture.
- Guided Quick Add, Command mode, and detailed transaction editing.
- Per-device Quick/Command preference rather than an account-global UI preference.
- Android PWA shortcuts for Add Expense, Add Income, and Command entry.
- One-time opening balance setup followed by checkpoint-based monthly reconciliation.
- TRY/USD/EUR cash/card ledger handling.
- Historical currency exchange using TCMB via Frankfurter with prior-published-date fallback.
- Month/range/year reports with historical TRY-unified valuation and matching PDF export.
- Monthly/category budgets and anchored recurring transaction generation.
- Optional authenticated Groq category suggestions with local deterministic fallback.
- Optional account synchronization through Supabase.
- Telegram route code remains present but is deliberately deferred and outside the current canonical-ledger release guarantees.

## Canonical ledger model

### Opening and reconciliation checkpoints

Initial setup creates immutable opening checkpoints for all configured balances. Opening amounts cannot be directly edited after setup.

On the first app open in a new calendar month, TapTrack can ask the user to reconcile the calculated balances against real balances. Reconciliation records an authoritative checkpoint containing:

- absolute observed balance;
- computed delta;
- local calendar date;
- exact ordering timestamp;
- reconciliation month.

Reconciliation adjustments are separate from income/expense analytics.

### Derived balances

The `balances` table is derived local cache only. Current balance is rebuilt from the latest applicable checkpoint plus subsequent transactions and conversions.

Transactions, conversions, reconciliation, recurring generation, and setup use canonical ledger services rather than independently mutating remote balance truth.

### Same-day ordering

New current-day activity receives an exact `occurredAt` timestamp. Historical activity normally stores only its selected calendar date.

If a later-entered historical transaction/conversion falls on the same date as a reconciliation checkpoint and its order is ambiguous, the UI asks whether it occurred **Before reconciliation** or **After reconciliation**. The choice is represented at the checkpoint boundary with deterministic ±1ms ordering.

## Transaction capture

### Quick Add

Quick Add is the default for a new device and is optimized for touch/mobile capture.

It supports:

- income/expense choice;
- amount-first entry;
- title;
- local category suggestion;
- cash/card selection;
- expandable currency/date/note details;
- historical reconciliation-order prompts when needed.

### Command mode

Command entry remains available for power users and supports compact input such as `-120 coffee cash` and multi-entry parsing.

### Detailed editor

The Transactions workspace remains the full editor. It uses the same canonical transaction service and the same reconciliation-ordering rules as Quick Add.

### Shortcut capture

`/app/add` is the stable deep-link entry point and accepts validated prefill fields. Android manifest shortcuts target this route. It is also suitable as the target for user-created iPhone Shortcuts, Back Tap, Action Button, or Siri workflows without requiring native TapTrack code.

## Synchronization model

### Device binding and adoption

A device must be explicitly bound to the authenticated Supabase account before finance synchronization proceeds.

When both the device and cloud contain data, TapTrack asks every time:

- **Use cloud data**; or
- **Merge this device's local data into the account**.

The choice is not remembered as a silent default.

### Durable outbox

Canonical finance mutations store their sync operation inside the same IndexedDB transaction as the local finance change. Network delivery occurs only after that local commit.

This removes the crash window where local data could exist without a durable sync intent.

The pattern covers:

- transactions;
- conversions;
- reconciliation checkpoints;
- categories;
- monthly/category budgets;
- recurring rules;
- settings/preferences that are canonical account data;
- initial setup seed records.

### Conflict/delete behavior

- Pending local optimistic rows are protected from remote overwrite during pull.
- Remote soft deletes remove local canonical rows.
- Balances are rebuilt from canonical ledger state after remote changes.
- If two devices edit the same existing record offline, **last successful sync wins**.
- Generated recurring occurrences use deterministic IDs so the same logical occurrence converges to one transaction across devices.

### Startup ordering

When online, app bootstrap pulls cloud state before generating due recurring occurrences, then synchronizes any new local occurrence. Offline startup still generates due occurrences locally.

## Recurring semantics

Monthly/yearly recurrence preserves the original schedule anchor rather than JavaScript rollover behavior.

Examples:

- Jan 31 → Feb 28/29 → Mar 31 → Apr 30.
- Feb 29 yearly → Feb 28 in non-leap years → Feb 29 again in leap years.

## Exchange rates and reports

The server exchange-rate route requires:

- valid ISO date;
- supported base/quote currency;
- real provider response.

Source: TCMB via Frankfurter.

If no rate is published on the selected date, TapTrack walks backward to the most recent prior published rate. It never substitutes the former hard-coded estimated fallback.

### Reports

By default Reports shows TRY transactions only.

With **Convert all to TRY** enabled, each USD/EUR transaction is converted using its own transaction date. The view reports how many historical rates were required and whether prior-published-date fallbacks were used.

PDF export follows the same toggle and consumes the already-loaded historical-rate map, so screen and PDF totals use the same valuation snapshot. The PDF also records the FX basis and preserves each transaction's original currency alongside the TRY equivalent.

Budget performance remains a TRY-budget calculation.

## AI categorization

Groq replaces the earlier Ollama design.

- AI requires a signed-in Supabase account.
- Groq credentials remain server-only.
- Default model: `openai/gpt-oss-20b`.
- Server validates input length and returned category.
- Signed-out users do not trigger Groq requests.
- Per-account quota is stored in Supabase.

A follow-up migration on the remediation branch hardens the quota function so only `service_role` can execute it. That migration is staged in source but must be coordinated with the matching server route during release.

## Authentication and security

- Supabase callback route handles PKCE code exchange and token-hash verification.
- Registration messaging reflects whether email confirmation is actually pending.
- Production CSP and related security headers are configured and asserted by route smoke.
- `.claude/settings.local.json` is removed from version control and ignored.
- Node runtime is pinned to 22.x.
- Next.js is upgraded to 16.3.4.
- ESLint is aligned to 9.39.5 with matching `eslint-config-next`.
- Full and production dependency audits currently report zero vulnerabilities at the configured threshold.

## Offline/PWA verification

The service worker maintains a versioned offline shell without taking over a running Next.js session mid-navigation.

The previous `ReadOnlyError` after setup was traced to reconciliation state code performing database seeding from inside a Dexie live-query read context. Reconciliation-state reads are now side-effect-free and have a regression test that executes them inside an explicit read transaction.

Playwright verifies at 320x720 and 390x844 that a warmed PWA can:

- render the application;
- navigate the warmed application routes offline;
- avoid horizontal overflow;
- avoid page/runtime errors;
- create a transaction through Quick Add while offline;
- retain that transaction after offline reload.

Next App Router prefetch is disabled where it would otherwise create unnecessary offline RSC requests, and the conversion workspace does not attempt exchange-rate network calls while disconnected.

Native installed Safari/iOS behavior remains unverified.

## Framework and verification baseline

- Next.js 16.3.4.
- React / React DOM 19.2.8.
- Node.js 22.x.
- ESLint 9.39.5.
- Vitest 4.1.10.
- Playwright 1.63.0.

Current remediation verification:

- publication guard: PASS;
- full dependency audit: PASS;
- production dependency audit: PASS;
- lint: PASS (with known intentional internal-navigation warnings for offline document fallback paths);
- TypeScript: PASS;
- Vitest: **24 files / 137 tests PASS**;
- production build: PASS;
- route smoke: PASS;
- offline mobile Playwright: PASS.

## Remaining release blockers / deferred work

### Requires product decision

- **JSON import semantics**: merge vs replace for the checkpoint-based canonical ledger.
- **Reset semantics**: reset only this device vs delete/reset the account ledger everywhere.
- Account unlink/delete-account behavior where local and cloud copies diverge.

The current legacy JSON backup/import path predates balance checkpoints and should not be treated as release-ready for synced ledgers until those decisions are implemented.

### Requires release coordination

- Apply the staged server-only AI quota migration together with the matching Groq route.
- Verify deployment environment variables and live Supabase migrations before merging.
- Complete a disposable-account authenticated manual walkthrough.
- Review live Supabase security advisor results after coordinated migrations.
- Enable Supabase leaked-password protection if available on the project plan and desired.

### Deferred

- Telegram integration redesign against the canonical ledger.
- Native iOS/Android widgets; use PWA/deep-link shortcuts for now.
- Native Safari/iOS installed-PWA verification.
- Receipt/photo OCR.

## Release boundary

Do not merge this remediation branch into `main` or promote its Vercel preview to production until the remaining product decisions and coordinated live migrations are resolved and the owner explicitly approves release.
