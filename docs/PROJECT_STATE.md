# Ravel Project State

Last updated: 2026-09-11

## Current status

Ravel V1 is released on `main` and is in post-release presentation/portfolio work rather than feature hardening. The TapTrack-to-Ravel product, repository, PWA, CI, and Vercel project migration is complete. Ravel is the **Money** module in the broader LifeOS system while remaining fully usable as a standalone application.

Current production baseline before this audit-closure branch: `dd4546cbeec5f9cab1817f67c04ab24dfd017152`.

That exact `main` revision passed Ravel CI and deployed successfully to Vercel. The latest verified gate contained:

- publication guard;
- full and production dependency audits with zero reported vulnerabilities;
- ESLint and TypeScript;
- 49 Vitest files / 268 tests;
- production build;
- 9/9 route smoke checks;
- Playwright: 10 passed / 3 intentionally skipped across 320px, 390px, and desktop coverage.

The public production URL is `https://ravel-fawn.vercel.app`.

## Current architecture

Ravel is a mobile-first, local-first personal ledger. IndexedDB/Dexie is the normal working store. Canonical financial state is opening/reconciliation checkpoints plus transactions and conversions; the balances table is derived cache.

Optional Supabase Auth and sync can bind a device ledger to an account. Canonical local mutations commit with durable sync intent, remote delivery retries through the outbox, and account-wide replacement is generation-aware. Empty-cloud claim plus initial seed is atomic through the server-authorized `claim_empty_taptrack_ledger` RPC. The historical RPC name is intentionally retained as a compatibility contract.

Groq Smart Categories are optional and non-blocking. Telegram and capture-token entry are optional server-mediated integrations. Historical exchange-rate and report valuation remain explicit rather than silently inventing rates.

## Rebrand compatibility boundary

Historical identifiers that existing data or deployed infrastructure already depends on remain intentionally unchanged. This includes `TapTrackDB`, the `taptrack-backup` V2 wire-format identifier, deployed Supabase RPC names, legacy environment/storage keys, old service-worker cache prefixes, and previously issued `taptrack_capture_` credentials.

New user-facing copy, generated filenames, package identity, PWA metadata, current configuration examples, and new credentials use Ravel. See `docs/RAVEL_COMPATIBILITY.md`.

## Open residuals

- GitHub `main` still has no repository ruleset. Issue #14 tracks PR-only / required-Ravel-CI protection, force-push prevention, and deletion protection.
- Supabase leaked-password protection is currently disabled at the Auth project level.
- The Supabase project display name still uses the historical TapTrack name; renaming that display metadata does not require changing the project ref or compatibility RPCs.
- Native installed Safari/iOS PWA relaunch, upgrade, and storage-eviction behavior has not been verified on a real device.
- JavaScript `number` remains the money representation; integer minor units/decimal storage is a future financial-hardening migration.
- A complete local Git all-object/reflog historical secret scan has not been performed.
- IndexedDB is not application-level encrypted at rest.

## Current work boundary

Core V1 engineering is frozen unless a correctness, security, or operational defect is found. Current work should focus on presentation, real product screenshots using synthetic data, portfolio/case-study material, LifeOS integration surfaces, and narrowly scoped release-hygiene fixes.