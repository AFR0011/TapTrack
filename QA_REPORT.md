# QA Report

Workflow schema: `agentic-workflow/v2`
Project: TapTrack
Repository profile: software

## Current promotion

- Scope: completed editorial redesign plus pre-main ledger/sync/reporting hardening
- Promotion PR: #15
- Base before promotion: `main` at `0057367c2c7bb2bab1a3a13d3fc768766316a255`
- Verified code candidate: `0d03ca1da0888744c374689fcd8015d5d67e5b23`
- Verification run: GitHub Actions `34407468049`
- Candidate verdict: `PASS`

## Automated evidence for candidate `0d03ca1...`

- publication guard: PASS
- `npm audit --audit-level=high`: 0 vulnerabilities at configured threshold
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities at configured threshold
- ESLint: PASS; three non-blocking unused-variable warnings remained at this candidate and are removed by the final cleanup commit in PR #15
- TypeScript: PASS
- Vitest: 44/44 files, 244/244 tests PASS
- Next.js 16.3.4 production build: PASS
- route smoke: 9/9 PASS
- Playwright: 9 passed / 2 intentionally skipped across mobile 320, mobile 390, and desktop 1440 projects
- warmed/fresh offline route coverage, offline local-ledger persistence, recurring mobile editing, settings mobile behavior, navigation overlay regression, and desktop responsive compositions remain in the browser gate

The final PR head after warning cleanup and release-record updates must pass the complete gate again. Earlier green evidence is not substituted for exact-head verification.

## Correctness findings closed in this promotion

### Sync/adoption

Cloud adoption no longer clears/replaces canonical local data and binds the device as separate local transactions. Snapshot replacement, derived-balance rebuild, repair rows, outbox reset, and device binding are committed atomically after validation. Account changes during adoption fail closed.

### Recurring integration

Online startup does not generate due recurring entries unless the pre-sync cycle succeeds. Offline startup remains local-first. Reconciliation-date occurrences use explicit before/after ordering rather than repeatedly failing on unresolved same-day ambiguity.

### Ledger/reconciliation

Future-dated manual transaction/conversion writes are rejected. Monthly reconciliation is evaluated per active balance, including balances introduced during a month, while archived currencies do not block completion.

### FX/reporting

Historical cache fallback cannot select a rate observation later than the requested historical date. Dashboard financial maps are bound to the quote currency that produced them, preventing stale default-currency values after a preference switch. PDF report text wraps and paginates rather than flowing below a one-page content stream.

### Preference conflict domain

Creating ordinary ledger transactions no longer updates the synchronized Settings row merely to remember the most recently used cash/card method. The Settings payment method is treated as an explicit default preference, reducing unnecessary multi-device same-record conflicts.

## Release acceptance rule

Promotion is accepted only when all of the following are true:

1. PR #15 exact head passes the full GitHub Actions gate.
2. PR #15 is mergeable against unchanged `main` and is merged with expected-head protection.
3. GitHub Actions succeeds for the resulting exact `main` merge SHA.
4. The corresponding Vercel production deployment reaches READY.
5. Production smoke confirms the public/authenticated shell responds without fresh deployment errors.

## Residuals not closed by this release

- native Safari/iOS installed-PWA relaunch/upgrade/storage-eviction behavior;
- empty-cloud claim + seed TOCTOU across provider boundaries;
- JavaScript-number monetary precision;
- IndexedDB at-rest exposure without application-level encryption;
- exhaustive all-object/reflog historical secret scanning;
- Supabase leaked-password protection project setting;
- repository branch protection, tracked by issue #14 because repository-administration write permission is unavailable through the connected GitHub App.