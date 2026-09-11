# Risk Register

Workflow schema: `agentic-workflow/v2`
Project: TapTrack
Repository profile: software
Last reconciled: 2026-09-11
Promotion PR: #16

## Active and residual risks

| ID | Severity | Status | Risk and current evidence | Required control |
| --- | --- | --- | --- | --- |
| TT-R01 | Critical | Mitigated | Device/account sync requires explicit binding and exact owner match; cloud adoption validates before canonical replacement and binding. | Retain adoption rollback, owner-mismatch, disconnect, and relink tests. |
| TT-R02 | Critical | Mitigated with residual | Local finance routes/mutations survive fresh and warmed offline Chromium scenarios at mobile widths. | Do not claim native installed Safari/iOS relaunch, upgrade, or storage-eviction safety until separately verified. |
| TT-R03 | Critical | Mitigated with residual | Telegram is private-owner-only, fail-closed, idempotent, and writes through protected server/database paths. | Retain owner/private-chat restrictions and provider-backed smoke testing. |
| TT-R04 | High | Open residual | Historical secret review has not included a complete local mirror/all-object/reflog scan. | Perform a full local object-database/reflog secret scan before claiming exhaustive historical cleanliness. |
| TT-R05 | High | Mitigated | Protected sync/restore/integration paths and server-mediated canonical-write boundary are live. | Verify production deployment and monitor provider-backed errors after promotion. |
| TT-R06 | High | Mitigated | Restore/reset scopes remain explicit and generation-aware; destructive operations preserve safety backups where designed. | Retain restore/reset rollback and scope tests. |
| TT-R07 | High | Mitigated | Recurring online startup requires successful pre-sync; deterministic IDs and reconciliation ordering prevent duplicate/ambiguous replay. Currency archival cannot silently leave an active recurring rule posting into an archived currency. | Retain startup-sync, deterministic occurrence, archive, and reconciliation-date tests. |
| TT-R08 | High | Mitigated | Manual future-dated transaction/conversion writes are rejected; Quick Add/editor constrain dates to today or earlier; balances remain derived from canonical checkpoints/activity. | Retain date-boundary and negative-balance tests. |
| TT-R09 | High | Mitigated with residual | Local canonical mutation + outbox intent are atomic; cloud delivery remains cross-provider and therefore not globally transactional. | Keep durable retry, generation, and convergence tests; do not claim distributed transactions. |
| TT-R10 | High | Mitigated | Historical FX fallback is constrained to requested/prior observations; future observations cannot value earlier ledger dates. | Retain exact/prior/cache provenance tests. |
| TT-R11 | Medium | Open residual | JavaScript `number` remains application money storage. Currency display now respects formatter-specific fraction digits instead of forcing two decimals. | Consider integer minor units or decimal arithmetic in a future financial-hardening migration. |
| TT-R12 | Medium | Mitigated with residual | Service-worker/offline behavior is covered in Chromium. | Run old-worker→new-worker and native Safari/iOS installed-PWA scenarios before platform-specific claims. |
| TT-R13 | Medium | Mitigated | CI includes publication guard, dependency audits, lint, typecheck, unit suite, production build, route smoke, and responsive/offline Playwright. | Require exact-head CI before promotion. |
| TT-R14 | Medium | Mitigated | Dashboard budget/FX selection follows quote currency and archived nonzero holdings remain in Available while active-only shortcuts remain scoped. | Retain dashboard finance selector tests. |
| TT-R15 | High | Mitigated | Empty-cloud claim + initial seed now execute atomically through `claim_empty_taptrack_ledger` under the per-account ledger-version lock and canonical table locks. The server route validates an authenticated backup and uses service-role RPC; authenticated clients cannot execute the RPC directly. A concurrent loser receives conflict and remains locally unbound. Migration is live on the production Supabase project. | Retain route/adoption race tests and service-role-only privilege checks. |
| TT-R16 | High | Mitigated | Reconciliation completeness is evaluated per active balance; archived currencies do not block completion. | Retain active/archived/mid-month reconciliation tests. |
| TT-R17 | Low | Open project setting | Supabase leaked-password protection remains disabled according to the security advisor. | Enable manually in Supabase Auth if available/desired for the deployed plan. |
| TT-R18 | Medium | Open governance residual | GitHub `main` currently has no ruleset. The connected GitHub App lacks repository-administration permission. | Require PR-only changes, TapTrack CI, no force pushes, and no branch deletion on `main` through repository settings. |
| TT-R19 | Medium | Mitigated | Ordinary transaction entry does not rewrite synchronized Settings solely to remember cash/card usage. | Keep payment method an explicit preference. |
| TT-R20 | Medium | Mitigated | PDF output wraps/paginates report content. | Retain multi-page export regression coverage. |
| TT-R21 | High | Mitigated | Transfers/exchanges now support edit/delete with atomic balance rebuild, negative-balance rollback, historical-rate semantics, and sync intent. | Retain correction/delete, archived-currency, historical-ordering, and real-browser balance-movement regressions. |
| TT-R22 | High | Mitigated | Category deletion/type changes repair dependent transactions and recurring rules and remove incompatible category budgets atomically with sync intents. | Retain category dependency regression tests. |
| TT-R23 | Medium | Mitigated | Numeric entry in onboarding/monthly budgets is strict; malformed prefixes are not silently accepted. Reports use local-date defaults instead of UTC truncation. | Retain strict parser and local-date tests. |

## Promotion state

PR #16 is the V1 hardening promotion vehicle. A complete green code candidate at `de7458adc27fef4d0ce37bae2a12dbaaa55121dc` passed GitHub Actions run `34605264268` with publication guard, 0 high dependency vulnerabilities, lint, typecheck, 260 unit tests, production build, 9/9 route smoke, and responsive/offline Playwright including real exchange balance movement.

Subsequent account-password, currency-precision, and documentation changes require an independent exact-head CI pass before merge. Production acceptance additionally requires a green exact `main` merge SHA and READY Vercel production deployment.
