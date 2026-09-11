# Ravel QA Report

Last updated: 2026-09-11
Promotion PR: #16

## Scope

This report covers the final V1 hardening pass performed after the end-to-end product audit. The objective was to close integrity/release blockers without introducing new product scope before the branding/marketing phase.

## Hardening coverage

### Transfers and exchanges

- full edit/delete lifecycle;
- atomic canonical mutation + derived balance rebuild + sync intent;
- overdraft rollback;
- historical FX refresh when rate-affecting fields change;
- preserved rate for metadata-only edits;
- explicit same-day reconciliation ordering;
- corrections remain possible for historical moves involving archived currencies.

The browser regression uses real application onboarding and verifies an exchange changes actual balances: TRY cash `1000` + USD card `100`, USD `10` -> TRY `400`, ending at USD card `90` and TRY cash `1400`.

### Cross-entity integrity

- category delete/type-change repairs dependent transactions and recurring rules;
- incompatible category budgets are deleted atomically;
- currency archival is blocked while an active recurring rule uses the currency;
- paused rules in archived currencies cannot resume until the currency is active again;
- archived nonzero holdings remain part of Dashboard Available.

### Validation and calendar behavior

- strict onboarding and monthly-budget amount parsing;
- future-dated manual transactions/conversions rejected in services and constrained in UI;
- Reports custom ranges default using local calendar date rather than UTC truncation;
- reusable select controls generate unique IDs;
- account registration/reset client minimum raised to 8 characters;
- currency formatting follows currency-specific fraction digits rather than forcing two decimals.

### Sync race hardening

TT-R15 is mitigated through the server-authorized `claim_empty_taptrack_ledger` PostgreSQL function. The function locks the account ledger version, locks canonical finance tables, rechecks emptiness, and seeds the full initial ledger in one transaction. The route returns a conflict to a concurrent losing first-device claim, and the browser remains unbound.

The migration is live on production Supabase. Privilege verification confirms `authenticated` cannot execute the function and `service_role` can.

## Verified baseline

GitHub Actions run `34605264268` on candidate `de7458adc27fef4d0ce37bae2a12dbaaa55121dc` passed:

- publication guard;
- full dependency audit: 0 high vulnerabilities;
- production dependency audit: 0 high vulnerabilities;
- ESLint;
- TypeScript;
- Vitest: 260 tests;
- production build;
- route smoke: 9/9;
- responsive/offline Playwright, including the real exchange balance workflow.

Later password/currency-formatting and documentation commits require the same full exact-head gate before merge. The release is not accepted solely from this earlier baseline.

## Residual release controls

The following are explicit residuals rather than hidden failures:

- Supabase leaked-password protection is disabled and requires a manual Auth setting change if supported on the plan.
- GitHub `main` has no ruleset/branch protection and requires repository-admin configuration.
- Native installed Safari/iOS PWA behavior has not been verified on a real device.
- Exhaustive Git all-object/reflog secret scanning has not been performed locally.
- JavaScript `number` remains money storage; integer minor-unit/decimal storage is deferred to a future migration.

## Release gate

PR #16 may be promoted only after its documentation-frozen head passes the complete CI gate. After merge, the exact `main` merge SHA must also be green and the corresponding Vercel production deployment must be READY with a production smoke check.
