# Risk Register

Workflow schema: `agentic-workflow/v2`
Project: Ravel
Repository profile: software
Last reconciled: 2026-09-11
Verified production baseline: `dd4546cbeec5f9cab1817f67c04ab24dfd017152`

## Active and residual risks

| ID | Severity | Status | Risk and current evidence | Required control |
| --- | --- | --- | --- | --- |
| TT-R02 | Critical | Mitigated with residual | Local finance workflows survive fresh and warmed offline Chromium scenarios at mobile widths. | Do not claim native installed Safari/iOS lifecycle/storage safety until separately verified on a real device. |
| TT-R04 | High | Open residual | Historical secret review has not included a complete local mirror/all-object/reflog scan. | Perform a full local Git object/reflog secret scan before claiming exhaustive history cleanliness. |
| TT-R09 | High | Mitigated with residual | Local canonical mutation + durable outbox intent are atomic; network delivery remains cross-provider and cannot be globally transactional. | Keep retry/generation/convergence coverage; do not claim distributed transactions. |
| TT-R11 | Medium | Open residual | JavaScript `number` remains application money storage. | Consider integer minor units or decimal arithmetic in a future financial-hardening migration. |
| TT-R12 | Medium | Mitigated with residual | Chromium covers current service-worker/offline behavior. | Test native Safari/iOS installed-PWA lifecycle and significant cross-version worker upgrades before platform-specific claims. |
| TT-R17 | Low | Open project setting | Production Supabase security advisor reports leaked-password protection disabled. | Enable leaked-password protection in Supabase Auth when supported/appropriate for the plan. |
| TT-R18 | Medium | Open governance residual | GitHub repository ruleset list is empty; issue #14 tracks protection. | Require PR-only changes, Ravel CI, no force pushes, and no branch deletion on `main`. |
| RV-R24 | Low | Open provider metadata | Production Supabase project display name still uses the historical TapTrack label. Stable project ref/RPC names must not change. | Rename only the Supabase project display name to Ravel; retain stable ref, URLs, credentials, migrations, and RPC names. |
| RV-R25 | Low | Open configuration drift | Vercel project settings advertise Node 24.x while `package.json` and CI require Node 22.x. Vercel correctly honors 22.x but emits a warning. | Align the Vercel project Node setting to 22.x, or deliberately migrate package/CI together in a future runtime upgrade. |
| RV-R26 | Low | Mitigated by audit branch | Multiple current-state documents had obsolete B001/B002/PR15/PR16 architecture/release claims and an Ollama deployment checklist. | Keep publication guard checks for current docs and review state docs at each release boundary. |

The `TT-*` identifiers predate the Ravel name and are retained as stable historical risk IDs. Renaming risk IDs would add churn without changing risk ownership.

## Material risks already mitigated in V1

The release includes explicit device/account binding, protected server-mediated canonical writes, generation-aware account replacement, server-authorized atomic empty-cloud claim + initial seed, restore/reset scope controls, transfer/exchange correction lifecycle, category/currency referential integrity, historical-rate constraints, fail-closed Telegram behavior, non-blocking AI categorization, future-date validation, per-balance reconciliation, and a complete CI/browser gate.

Historical details remain available in earlier commits and merged pull requests. They should not be treated as the current release state.

## Verification baseline

Ravel CI run `34630711573` on production baseline `dd4546cbeec5f9cab1817f67c04ab24dfd017152` passed:

- publication guard;
- full and production dependency audits with 0 reported vulnerabilities;
- ESLint and TypeScript;
- 49 Vitest files / 268 tests;
- production build;
- 9/9 route smoke;
- Playwright with 10 passed / 3 intentionally skipped.

The corresponding Vercel production deployment `dpl_FWn9vqGpuNyqkbXb6194KvQV93vK` is READY, and no runtime error clusters were found in the checked 24-hour window.