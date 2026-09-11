# Test Strategy

Ravel verification proceeds from deterministic source/configuration checks through unit/integration behavior, production compilation, route contracts, and real-browser offline workflows.

## CI ladder

1. `scripts/publication-guard.mjs` protects publication/security/configuration boundaries, current release documentation, and user-facing Ravel branding.
2. Full and production-only `npm audit` checks must have no findings at the configured High/Critical threshold.
3. ESLint and TypeScript verify static correctness.
4. The complete Vitest suite protects database migrations, finance-domain behavior, backups/restores, sync/adoption/convergence, integration routes, AI contracts, and compatibility behavior.
5. `next build` verifies production compilation under Node 22.x.
6. `scripts/route-smoke.mjs` checks nine public/application/API/PWA/security contracts against the production build.
7. Playwright Chromium exercises real application workflows at 320x720, 390x844, and desktop width, including exchange balance movement, fresh/warmed offline navigation, offline transaction persistence, recurring/settings usability, and responsive desktop composition.

## Current verified baseline

Production baseline `dd4546cbeec5f9cab1817f67c04ab24dfd017152` passed:

- 49 Vitest files / 268 tests;
- 9/9 route-smoke checks;
- Playwright: 10 passed / 3 intentionally skipped;
- production build;
- lint and typecheck;
- full and production dependency audits with 0 reported vulnerabilities.

## Test-data boundary

Automated tests use synthetic finance data and absent/inert provider configuration unless a test explicitly mocks a provider contract. CI must not contact live Supabase, Groq, Telegram, or other production services and must not retain screenshots/traces containing real personal finance data or credentials.

## What CI does not prove

Credential-free CI does not by itself prove live provider configuration. Provider-backed release checks are performed separately when configuration or server/database boundaries change, including production deployment status/runtime errors and targeted synthetic/disposable-account checks.

Native installed Safari/iOS PWA lifecycle/storage behavior remains outside the automated Chromium gate and must not be claimed as verified until exercised on a real device.