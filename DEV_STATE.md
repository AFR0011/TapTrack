# Development State

Workflow schema: `agentic-workflow/v2`
Project: TapTrack
Repository profile: software

- Phase: PRE_MAIN_PROMOTION
- Active release: editorial redesign + pre-main correctness hardening
- Promotion PR: #15 (`audit/pre-main-hardening` -> `main`)
- Production branch before promotion: `main` at `0057367c2c7bb2bab1a3a13d3fc768766316a255`
- Verified code candidate: `0d03ca1da0888744c374689fcd8015d5d67e5b23`
- Candidate CI: GitHub Actions run `34407468049` — PASS
- Candidate evidence: publication guard PASS; dependency audits 0 vulnerabilities at configured threshold; TypeScript PASS; 44/44 Vitest files and 244/244 tests PASS; production build PASS; route smoke 9/9 PASS; Playwright 9 passed / 2 intentionally skipped across 320px, 390px, and desktop coverage.
- Final promotion requirement: the exact PR head after release-record/lint cleanup must pass the same complete CI gate before merge.
- Merge requirement: merge PR #15 only if its head is unchanged and mergeable.
- Production requirement: after merge, verify GitHub Actions for the exact `main` merge SHA and confirm the corresponding Vercel production deployment is READY.
- Governance residual: `main` is not protected by a required-check/PR-only rule because the connected GitHub App lacks repository-administration write permission. GitHub issue #14 tracks enabling this manually.

## Hardening included in this release

- Cloud adoption validates the remote snapshot before mutation and commits canonical replacement, outbox clearing, derived-balance rebuild, repairs, and device binding in one Dexie transaction.
- Online recurring generation must complete the pre-sync cycle before creating due occurrences; offline generation remains local-first.
- Recurring/reconciliation same-date ambiguity is surfaced for explicit ordering rather than silently looping.
- Reconciliation completeness is evaluated per active balance and does not let archived currencies block the month.
- Manual future-dated transaction/conversion writes are rejected.
- Cached historical FX fallback cannot use a future observation for an earlier requested date.
- Dashboard budget selection follows the current default currency, and stale FX maps are not reused after the reporting currency changes.
- PDF reports paginate/wrap instead of truncating later report lines.
- Ordinary transaction writes no longer rewrite/sync Settings merely because cash/card was used; the Settings method remains an explicit default preference.
- Editorial page redesign, loading geometry, responsive desktop coverage, and mobile/offline coverage are included in the same promotion lineage.

## Explicit residuals

- Native installed Safari/iOS relaunch, upgrade, and storage-eviction behavior is not proven by Chromium CI.
- Empty-cloud claim + initial seed is still not one server-authorized transaction; a narrow TOCTOU residual remains.
- JavaScript `number` remains the application money representation.
- IndexedDB is not application-level encrypted.
- A complete local mirror/all-object historical secret scan has not been performed.
- Supabase leaked-password protection remains a project-level setting outside this repository release.
- Branch protection remains open as issue #14.

This file records repository release state. A merged PR alone is not evidence of a successful production deployment; production status must be verified against the exact `main` SHA and hosting deployment.