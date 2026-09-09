# Risk Register

Workflow schema: `agentic-workflow/v2`
Project: TapTrack
Repository profile: software
Last reconciled: 2026-09-10
Promotion PR: #15

## Active and residual risks

| ID | Severity | Status | Risk and current evidence | Required control |
| --- | --- | --- | --- | --- |
| TT-R01 | Critical | Mitigated | Device/account sync requires explicit binding and exact owner match. Cloud adoption now validates first and commits local canonical replacement + derived rebuild + outbox reset + device binding atomically. | Retain adoption rollback, owner-mismatch, disconnect, and relink tests. |
| TT-R02 | Critical | Mitigated with residual | Local finance routes and mutation survive warmed/fresh offline Chromium scenarios at 320px and 390px. | Do not claim native installed Safari/iOS relaunch, upgrade, or storage-eviction safety until separately verified. |
| TT-R03 | Critical | Mitigated with residual | Telegram is private-owner-only, fail-closed, idempotent by update ID, and writes through protected server/database paths. | Retain owner/private-chat restrictions and provider-backed smoke testing. |
| TT-R04 | High | Open residual | Historical rewrite/secret review has not included a complete local mirror/all-object/reflog scan. | Run a full object-database secret scan before claiming exhaustive historical cleanliness. |
| TT-R05 | High | Mitigated | Protected sync/restore/integration paths and server-mediated canonical write boundary remain the intended production architecture. | Verify production deployment and monitor provider-backed errors after promotion. |
| TT-R06 | High | Mitigated | Restore/reset scopes remain explicit and generation-aware; destructive operations preserve safety backups where designed. | Retain restore/reset rollback and scope tests. |
| TT-R07 | High | Mitigated | Recurring online startup now requires a successful pre-sync before due generation; deterministic IDs and same-date reconciliation ordering prevent duplicate/ambiguous replay. | Retain startup-sync, deterministic occurrence, and reconciliation-date tests. |
| TT-R08 | High | Mitigated | Manual future-dated transaction/conversion writes are rejected and ledger balances remain derived from canonical checkpoints/activity. | Retain date-boundary and negative-balance tests. |
| TT-R09 | High | Mitigated with residual | Local canonical mutation + outbox intent are atomic; cloud delivery remains cross-provider and therefore not globally transactional. | Keep durable retry, generation, and convergence tests; do not claim distributed transactions. |
| TT-R10 | High | Mitigated | Historical FX fallback is constrained to the requested date or a prior cached/published observation; future observations cannot value earlier ledger dates. | Retain exact/prior/cache provenance tests. |
| TT-R11 | Medium | Open residual | JavaScript `number` remains the application money representation. | Consider integer minor units or decimal arithmetic in a future financial-hardening migration. |
| TT-R12 | Medium | Mitigated with residual | Service-worker/offline behavior is covered in Chromium, including fresh and warmed route navigation. | Run old-worker to new-worker and native Safari/iOS installed-PWA scenarios before platform-specific claims. |
| TT-R13 | Medium | Mitigated | CI includes publication guard, dependency audits, lint, typecheck, 244-test unit suite at the verified candidate, production build, route smoke, and responsive/offline Playwright. | Require exact-head CI before promotion. |
| TT-R14 | Medium | Mitigated | Dashboard budget selection follows default currency and stale FX maps are invalidated when reporting currency changes. | Retain dashboard finance selector tests. |
| TT-R15 | High | Open residual | Empty-cloud inspection/binding is fail-closed, but claim + initial seed are still separate provider operations. | Move empty-cloud claim + initialization into one server-authorized transactional primitive with concurrency tests. |
| TT-R16 | High | Mitigated | Reconciliation completeness is evaluated per active balance; balances introduced during a month are covered and archived currencies do not block completion. | Retain active/archived/mid-month reconciliation tests. |
| TT-R17 | Low | Open project setting | Supabase leaked-password protection is outside repository code and remains a project-level setting. | Enable in Supabase if supported/desired for the deployed plan. |
| TT-R18 | Medium | Open governance residual | `main` is currently unprotected. The connected GitHub App cannot change repository-administration settings. | Complete issue #14: require TapTrack CI, PR-only changes, no force pushes, and no branch deletion on `main`. |
| TT-R19 | Medium | Mitigated | Ordinary transaction entry no longer rewrites the synchronized Settings record just to remember cash/card usage, reducing needless same-record conflicts. | Keep payment method as an explicit preference and avoid reintroducing write-on-every-transaction Settings updates. |
| TT-R20 | Medium | Mitigated | PDF output now wraps and paginates report lines instead of relying on one overflowing page content stream. | Retain multi-page export regression coverage. |

## Promotion state

PR #15 is the production promotion vehicle for the completed editorial sequence and this hardening set. The code candidate `0d03ca1da0888744c374689fcd8015d5d67e5b23` passed GitHub Actions run `34407468049` with 44/44 Vitest files, 244/244 tests, production build, 9/9 route smoke, and Playwright 9 passed / 2 intentionally skipped.

The final PR head includes lint-warning cleanup and release-record updates and must independently pass the full gate before merge. Production acceptance additionally requires a green exact `main` merge SHA and a READY Vercel production deployment.