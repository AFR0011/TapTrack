# Development State

Workflow schema: `agentic-workflow/v2`
Project: Ravel
Repository profile: software

- Phase: RELEASED_V1_POST_BRAND
- Production branch: `main`
- Current public product/repository name: Ravel
- LifeOS role: standalone-capable **Money** module
- Verified production baseline before this audit branch: `dd4546cbeec5f9cab1817f67c04ab24dfd017152`
- Ravel CI run: `34630711573` — PASS
- Vercel production deployment: `dpl_FWn9vqGpuNyqkbXb6194KvQV93vK` — READY
- Public production URL: `https://ravel-fawn.vercel.app`
- Verification evidence: publication guard PASS; dependency audits reported 0 vulnerabilities; ESLint PASS; TypeScript PASS; 49 Vitest files / 268 tests PASS; production build PASS; route smoke 9/9 PASS; Playwright 10 passed / 3 intentionally skipped across mobile and desktop coverage.

## Current engineering state

V1 product engineering is feature-complete and frozen except for correctness, security, compatibility, or operational defects.

Implemented release boundaries include:

- local-first canonical ledger with derived balances;
- explicit transfers/exchanges/reconciliation semantics;
- multi-currency reporting with historical rate handling;
- durable local sync outbox and explicit device/account binding;
- generation-aware account replacement and restore/reset semantics;
- server-authorized atomic empty-cloud claim + initial seed;
- optional Supabase Auth/sync, Groq Smart Categories, Telegram capture, and capture-token workflows;
- PWA/offline shell verified in Chromium at mobile widths;
- complete Ravel visual/public identity and provider rename for GitHub and Vercel.

## Compatibility state

Historical TapTrack identifiers remain only when already persisted or deployed. Do not rename `TapTrackDB`, backup wire-format identifiers, deployed Supabase RPC/function names, old environment/storage aliases, or legacy capture-token prefixes without an explicit migration plan. See `docs/RAVEL_COMPATIBILITY.md`.

## Open residuals

- GitHub `main` has no repository ruleset; issue #14 tracks required Ravel CI + PR-only protection.
- Supabase leaked-password protection is disabled at the Auth project level.
- Supabase project display metadata still uses the historical TapTrack name.
- Native installed Safari/iOS PWA lifecycle behavior remains unverified.
- JavaScript `number` remains money storage.
- IndexedDB is not encrypted by Ravel.
- A complete all-object/reflog Git history secret scan has not been performed.

Current development work should be narrowly scoped. Presentation, portfolio evidence, real synthetic-data screenshots, and LifeOS integration are the normal next steps.