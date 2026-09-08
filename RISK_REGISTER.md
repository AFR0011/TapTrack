# Risk Register

Workflow schema: `agentic-workflow/v2`
Project: TapTrack
Repository profile: software
Initialized: 2026-09-05
Last reconciled: 2026-09-08

## Active and residual risks

| ID | Severity | Status | Risk and current evidence | Required control |
| --- | --- | --- | --- | --- |
| TT-R01 | Critical | Mitigated — production | Cloud access requires explicit device binding and exact user match; explicit disconnect removes binding and pending outbox while preserving local canonical data. | Retain mismatch/disconnect/relink tests and production monitoring. |
| TT-R02 | Critical | Mitigated with residual | Local finance routes remain usable without authentication/network after a warmed shell; Chromium offline-mobile CI passes at 320x720 and 390x844. | Do not claim native installed Safari/iOS relaunch, upgrade, or storage-eviction safety until separately verified. |
| TT-R03 | Critical | Mitigated with residual | Telegram fails closed on incomplete configuration, validates the webhook secret, permits only the configured owner private chat, and writes through an atomic/idempotent server-side RPC keyed by Telegram `update_id`. | Keep private-owner-only policy unless shared/group semantics are explicitly designed and tested. |
| TT-R04 | High | Mitigated with residual | Historical path rewrite changed commit IDs and earlier history handling was reviewed only through reachable GitHub/API evidence, not a complete local all-object secret scan. | Complete a full mirror/object-database secret scan before claiming exhaustive historical cleanliness. |
| TT-R05 | High | Mitigated — production | B002 application and required Supabase migrations are live; production sync was smoke-tested after server credential configuration. | Monitor provider-backed paths for regressions. |
| TT-R06 | High | Mitigated — production | Device-only restore/reset detaches locally; account-wide restore/reset uses authenticated generation-rotating replacement with a safety backup. | Retain destructive-action tests and require explicit scope confirmation in UI. |
| TT-R07 | High | Mitigated | Telegram mutation uses one PostgreSQL operation with `update_id` idempotency. | Retain webhook and database rollback/idempotency tests. |
| TT-R08 | High | Mitigated | Versioned restore validates full payload before mutation, creates a recoverable safety backup, excludes device/sync-derived state, and supports legacy checkpoint migration. | Retain validation/rollback tests. |
| TT-R09 | High | Mitigated with residual | Local finance mutation + outbox intent are atomic; retry state is durable; pending local rows are protected from pull overwrite; ledger generation blocks stale pre-replacement writes. | Do not claim globally transactional cross-provider sync; retain convergence tests and operational monitoring. |
| TT-R10 | High | Mitigated — production | Canonical schema, checkpoint backfill, restore generation, Telegram, quota, and protected-write migrations are applied. | Keep forward migration ordering documented and migrations tracked in Git. |
| TT-R11 | Medium | Open hardening residual | JavaScript `number` remains the application money representation. | Consider integer-minor-unit/decimal representation in a future financial-hardening change. |
| TT-R12 | Medium | Mitigated with residual | Service-worker registration is scoped to the authenticated application layout and warmed offline Chromium navigation/persistence passes. | Run explicit old-worker→new-worker and native Safari/iOS installed-PWA scenarios before platform-specific claims. |
| TT-R13 | Medium | Mitigated | CI retains production build, route smoke, mobile layout/offline persistence, overflow, and page-error browser gates. | Keep browser gate mandatory for release branches. |
| TT-R14 | Medium | Mitigated | Release/governance records now reflect production B002 rather than the old B001 baseline. | Keep state docs synchronized with future production changes. |
| TT-R15 | High | Open residual | Empty-cloud linking rechecks remote emptiness immediately before binding, but binding and initial seed writes are still separate operations. | Future hardening should move claim + initialization into one server-authorized transactional primitive with concurrency tests. |
| TT-R16 | High | Closed — production | Protected-write enforcement was applied only after compatible B002 production code was live and sync was smoke-tested. Canonical finance tables now expose owner SELECT only, while protected mutation RPCs remain service-role-only. | Preserve this server-mediated write boundary. |
| TT-R17 | Low | Open project-level security setting | Supabase leaked-password protection is disabled. | Enable leaked-password protection if supported/desired for the current project plan. |

## Production release state

TT-B002 is deployed to production. The implementation gate passed 32/32 Vitest files (172/172 tests), production build, 9/9 route smoke, and both offline-mobile Playwright projects. Production server configuration was corrected so protected sync/restore/AI/Telegram routes can use the Supabase server credential.

After production smoke testing, `enforce_protected_sync_writes` was applied. Live policy inspection confirmed that authenticated browser users retain SELECT access to canonical finance tables but no direct INSERT/UPDATE/DELETE policies. Protected ledger RPCs remain `SECURITY DEFINER`, service-role executable, and unavailable to ordinary authenticated clients.

The follow-up `optimize_rls_and_indexes` migration removed the RLS-initplan warnings and nine duplicate unique indexes. Remaining database advisor notices are four informational unused-index observations, which are not being removed without representative workload evidence.

Native Safari/iOS behavior, the empty-cloud claim/seed TOCTOU, IndexedDB-at-rest exposure, JavaScript-number precision, and exhaustive all-object historical secret scanning remain explicit residuals.
