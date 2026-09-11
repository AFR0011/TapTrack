# Ravel QA Report

Last updated: 2026-09-11

## Accepted production baseline

Ravel V1 is released. The last fully verified production baseline before this audit-closure branch is `dd4546cbeec5f9cab1817f67c04ab24dfd017152`.

GitHub Actions run `34630711573` passed the complete Ravel CI gate:

- publication guard;
- full dependency audit: 0 reported vulnerabilities;
- production dependency audit: 0 reported vulnerabilities;
- ESLint;
- TypeScript;
- Vitest: 49 files / 268 tests;
- production build;
- route smoke: 9/9;
- Playwright: 10 passed / 3 intentionally skipped across 320px, 390px, and desktop coverage.

The corresponding Vercel production deployment `dpl_FWn9vqGpuNyqkbXb6194KvQV93vK` reached READY. Production runtime-error inspection after the Ravel provider rename found no runtime error clusters in the checked 24-hour window.

## High-value correctness coverage

- Transfers and exchanges support correction/delete with atomic canonical mutation, derived-balance rebuild, overdraft rollback, historical-rate semantics, archived-currency handling, and explicit reconciliation ordering.
- Category delete/type changes repair dependent transactions and recurring rules and remove incompatible category budgets atomically with sync intents.
- Currency archival blocks active recurring rules; paused rules cannot resume into an archived currency; archived nonzero holdings remain represented correctly.
- Manual future-dated transactions/conversions are rejected and UI-constrained.
- Reports use local calendar dates and explicit historical FX behavior.
- Account-wide restore/reset is generation-aware and stale clients adopt replacement state rather than replaying old work.
- Empty-cloud claim plus initial seed is atomic through the server-authorized `claim_empty_taptrack_ledger` RPC; concurrent losers remain unbound.
- Smart Categories are non-blocking, manual choices win, and late AI updates are guarded against overwriting subsequent edits.
- The browser regression performs real exchange balance movement and offline local-ledger workflows.
- Ravel PWA metadata, current icons, service-worker shell, public landing page, security headers, and fail-closed unconfigured Telegram endpoints are protected by route smoke.

## Rebrand QA

The public landing page, login flow, PWA metadata, service-worker fallback, generated artifacts, package identity, current configuration examples, and current GitHub/Vercel provider metadata use Ravel. The old `taptrack-fawn.vercel.app` alias remains as a compatibility redirect toward the Ravel deployment.

Historical TapTrack identifiers remain only where persisted or deployed compatibility requires them. See `docs/RAVEL_COMPATIBILITY.md`.

## Residual controls

- GitHub `main` has no repository ruleset; issue #14 remains open until PR-only + required Ravel CI protection is enabled.
- Supabase leaked-password protection is currently disabled.
- Supabase project display metadata still uses the historical TapTrack name.
- Native installed Safari/iOS PWA behavior has not been verified on a real device.
- Exhaustive Git all-object/reflog secret scanning has not been performed locally.
- JavaScript `number` remains money storage.

These residuals do not invalidate the current V1 ledger release, but they must remain explicit rather than being silently converted into marketing claims.