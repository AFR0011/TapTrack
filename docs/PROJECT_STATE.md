# TapTrack Project State

Last updated: 2026-09-11

## Current status

TapTrack V1 is in final release hardening on `hardening/conversion-corrections`, promoted through PR #16 against `main`.

The product is feature-complete for V1. The hardening pass closes the cross-workflow integrity issues found in the pre-marketing audit without adding new product scope.

## Hardening completed

- Transfers and exchanges have full edit/delete correction lifecycle with atomic derived-balance rebuild, negative-balance protection, historical FX handling, and same-day reconciliation ordering.
- Category delete/type changes keep transactions, recurring rules, and category budgets referentially consistent in one local transaction with durable sync intents.
- Currency removal behaves as archival: history and balances remain, active recurring rules block archival, paused rules cannot resume while archived, and archived nonzero holdings still count in Dashboard Available.
- Monthly budget and onboarding numeric input use strict parsing rather than prefix coercion.
- Manual future-dated transaction/conversion writes are rejected in services and constrained in Quick Add/editor UI.
- Reports use local calendar dates for custom-range defaults instead of UTC date truncation.
- Reusable form/select controls use unique generated IDs, removing duplicate-label/ID failures exposed by browser tests.
- Account registration/password reset require at least 8 characters in the client.
- Currency display precision follows the currency formatter rather than forcing two decimals; JavaScript `number` remains the stored money representation for V1.
- Empty-cloud initialization is atomic: first-device claim + initial seed now run through a server-authorized PostgreSQL primitive under the per-account ledger-version lock. A concurrent losing device stays unbound and must reconcile explicitly.

## Canonical ledger and sync model

Balances remain derived cache. Canonical financial truth is opening/reconciliation checkpoints plus transactions and conversions. Reconciliation corrections are not treated as ordinary income or spending.

Local canonical mutation and its sync intent commit atomically in IndexedDB. Network delivery is retried through the durable outbox. Account-wide restore/reset remains generation-aware so stale clients adopt replacement state instead of replaying old work.

The production Supabase project includes protected canonical-write primitives and the `claim_empty_taptrack_ledger` migration. The new claim RPC is callable only through the service role; authenticated browser clients cannot execute it directly.

## Verification

A full green code candidate was established at `de7458adc27fef4d0ce37bae2a12dbaaa55121dc` in GitHub Actions run `34605264268`, including publication guard, dependency audits, lint, typecheck, 260 unit tests, production build, 9/9 route smoke, and responsive/offline Playwright. Subsequent password/currency-formatting and documentation commits require their own exact-head gate before merge.

The exchange browser regression performs the real onboarding and ledger workflow: TRY cash 1000 + USD card 100, then USD 10 -> TRY 400, and verifies final USD card 90 / TRY cash 1400.

## Known residuals after V1 freeze

These are intentionally not expanded into more V1 engineering work:

- JavaScript `number` remains the money representation. Integer minor units/decimal storage is a future financial-hardening migration.
- Native installed Safari/iOS PWA relaunch, upgrade, and storage-eviction behavior is not verified. Do not make platform-specific reliability claims until a real-device test is completed.
- A complete local Git object/reflog historical secret scan has not been performed, so do not claim exhaustive history cleanliness.
- Supabase leaked-password protection is still disabled as a project-level Auth setting and must be enabled manually if available on the deployed plan.
- GitHub `main` currently has no ruleset/branch protection. Repository administration must require PR-only changes, TapTrack CI, and disable force-push/deletion.
- Signing out removes the cloud session but intentionally does not erase the local-first ledger on the device. Account & Sync explains that the device remains usable independently; more prominent sign-out microcopy can be handled with later UI/branding work.

## Release boundary

No further product features are part of this hardening branch. Release acceptance requires:

1. exact documentation-frozen PR #16 head passes the full CI gate;
2. merge to `main` and verify the exact merge SHA;
3. confirm the resulting Vercel production deployment is READY and perform a production smoke check;
4. keep the residual controls above explicit rather than silently calling them solved.

After that boundary, TapTrack V1 product engineering is frozen and work moves to positioning, branding, landing-page presentation, and launch planning.
