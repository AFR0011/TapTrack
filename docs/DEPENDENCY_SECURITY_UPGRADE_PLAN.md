# Dependency Security Upgrade Plan

Last updated: 2026-05-20

## Current Finding

`npm.cmd audit --omit=dev` reports production advisories in the current Next/PostCSS dependency set. The automated fix path requires a breaking framework upgrade to Next 16.

## Decision

Do not mix the Next 16 upgrade with product or QA remediation work. Treat it as a dedicated branch and verification batch after the smaller product batches are clean.

## Upgrade Batch

1. Create a dedicated branch for the framework upgrade.
2. Read the current official Next.js migration notes for the target version before changing packages.
3. Upgrade Next and related framework dependencies.
4. Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd audit --omit=dev
```

5. Start a fresh dev server.
6. Run route smoke checks against the fresh server:

```powershell
$env:TAPTRACK_SMOKE_BASE_URL="http://127.0.0.1:<port>"; npm.cmd run smoke:routes
```

7. Browser-check desktop and mobile for login, setup, dashboard, transactions, reports, settings, and mobile nav overflow.
8. Accept only when auth redirects, API JSON responses, PWA assets, and mobile layouts remain clean.

## Remaining Risk

Next 16 may require App Router, middleware, metadata, lint, or build-tooling changes. This is intentionally deferred until the app-level remediation work is verified.
