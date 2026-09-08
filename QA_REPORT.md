# QA Report

Workflow schema: `agentic-workflow/v2`
Project: TapTrack
Repository profile: software
Initialized: 2026-09-05

## Current cycle

- Batch: TT-B002 — Canonical ledger/sync correctness, restore/reset/disconnect, integrations, and release hardening
- Implementation verdict: `PASS_WITH_RESIDUAL_RISKS`
- Release verdict: `PRODUCTION_RELEASED_WITH_RESIDUAL_RISKS`
- Evidence date: 2026-09-08
- Production branch: `main`
- Rollback anchor: `backup/main-pre-b002-20260908` at `cc43524c99e7944a17df13d76578bf83a79fcb15`

## Automated evidence

B002 implementation head `2e01cda7e69e80a4b75fa2bcea20f253fb4ebbc5` passed GitHub Actions run `34206762454`:

- dependency audits: 0 vulnerabilities at configured threshold;
- ESLint: 0 errors / 3 non-blocking navigation warnings;
- TypeScript: PASS;
- Vitest: 32/32 files, 172/172 tests PASS;
- Next.js production build: PASS;
- route smoke: 9/9 PASS;
- offline mobile Playwright: 2/2 PASS.

## Production release evidence

The B002 application was promoted to `main` and deployed successfully to Vercel production. Production `/login` exposed the configured Supabase account flow.

Initial protected-sync testing returned `503 {"error":"Protected sync is unavailable."}`. Source inspection showed this response occurs when `SUPABASE_SERVICE_ROLE_KEY` is absent before any database call. The production server credential was then configured, after which the owner confirmed core application/sync behavior was working.

The live Supabase database was verified to contain the required generation-aware and protected RPCs, with protected ledger functions `SECURITY DEFINER`, executable by `service_role`, and unavailable to ordinary authenticated users.

After application smoke testing, `enforce_protected_sync_writes` was applied. Post-migration inspection confirmed canonical finance tables retain owner SELECT policies only; direct authenticated-browser INSERT/UPDATE/DELETE policies are removed.

No fresh runtime errors were observed in the checked post-enforcement window for sync, restore, AI categorization, or Telegram webhook routes.

A follow-up `optimize_rls_and_indexes` migration was tracked in Git and applied. Supabase performance-advisor rerun confirmed the prior 15 RLS initplan warnings and nine duplicate-index warnings were cleared. Four unused-index findings remain informational and are intentionally retained pending representative workload evidence.

## Functional acceptance retained from B002

- checkpoint-based canonical balance reconstruction and reconciliation;
- deterministic ordering around reconciliation checkpoints;
- atomic local canonical mutation + durable IndexedDB outbox intent;
- explicit cloud-use vs local-merge adoption;
- generation-aware multi-device convergence and stale-client protection;
- explicit device/account restore and reset scope;
- explicit device cloud disconnect;
- anchored recurring schedules and deterministic occurrence IDs;
- historical FX/report valuation;
- authenticated server-side Groq categorization with protected quota accounting;
- private-owner Telegram writes with atomic batch semantics and `update_id` idempotency;
- authenticated-layout service-worker registration and offline Chromium coverage.

## Residuals

Release does not prove away:

- native installed Safari/iOS relaunch, upgrade, or storage-eviction behavior;
- the empty-cloud claim/seed TOCTOU between final emptiness check and initial seed;
- JavaScript `number` monetary precision;
- application-level encryption of IndexedDB;
- exhaustive full-object/reflog historical secret scanning;
- Supabase leaked-password protection, which remains disabled as a project-level Auth setting;
- any provider-backed scenario that the owner did not explicitly exercise during production smoke testing.

## Current verdict

TT-B002 is released to production with the intended server-mediated write boundary enforced. Core production behavior and sync were confirmed working after server configuration was corrected, automated verification remains green, and post-release database advisor cleanup is complete except for informational unused-index notices and the separate leaked-password Auth setting.
