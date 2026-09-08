# Security Policy

TapTrack is a personal finance tracking application and engineering portfolio project. It is not a bank, payment processor, accounting service, investment platform, tax service, or financial-advice service.

## Data and trust boundaries

TapTrack is local-first for finance data. Normal finance workflows read and write IndexedDB through Dexie. Optional Supabase synchronization mirrors supported canonical records only after a device is explicitly linked to an authenticated account.

Enabling integrations changes the privacy boundary:

- **Supabase sync** stores canonical finance records in the configured remote project.
- **Groq categorization** sends the transaction title/category context required for classification through an authenticated server route when AI suggestions are enabled.
- **Exchange rates** are fetched through the application server route from TCMB via Frankfurter using currency/date information.
- **Telegram entry** is currently deferred. Its legacy route remains outside the current canonical ledger guarantees and should not be treated as release-ready.

Users should treat browser profiles, Supabase projects, and any enabled third-party integration as part of the security boundary.

## Secrets

Never commit real values for:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- private deployment credentials or provider tokens

The public Supabase browser key is intended for client use, but authorization must still be enforced through authenticated access and row-level security. The service-role key bypasses normal row-level security and must remain server-side.

`.env`, `.env.local`, and related local environment files are ignored by Git. The committed `.env.example` contains placeholders only.

## Local finance boundary

IndexedDB may contain sensitive personal finance history. Shared browser profiles, unlocked devices, browser backups, developer tools, or malware with local-browser access may expose that information. TapTrack does not provide application-level local database encryption at rest.

Canonical balance state is reconstructed from opening/reconciliation checkpoints plus later transactions and conversions. The local `balances` table is derived cache, not independent truth.

Finance mutations commit their canonical local record and durable sync-outbox intent inside one IndexedDB transaction. Network delivery happens after that local commit and can retry without blocking offline-first use.

## Supabase boundary

Remote finance sync is optional, but account features use Supabase Auth. A device must be explicitly linked to an authenticated user before canonical finance synchronization is allowed.

The synchronization model includes:

- owner-scoped remote rows;
- durable device-local outbox operations;
- soft-delete propagation;
- explicit cloud-vs-local adoption when both sides contain data;
- last-successful-sync-wins behavior for conflicting edits to the same existing record;
- deterministic recurring occurrence identifiers to prevent cross-device duplication;
- derived balance rebuild after canonical remote changes are applied.

Live migrations must be deployed together with compatible application code. In particular, the remediation branch contains a Groq quota migration that restricts the quota RPC to service-role execution; do not apply that migration independently from the matching server route, or deploy the route while leaving the old authenticated RPC exposure in place.

## AI boundary

Groq categorization requires a valid Supabase user session.

The application server:

- rejects signed-out requests before calling Groq;
- keeps `GROQ_API_KEY` server-only;
- validates input size;
- validates returned category names against the allowed set;
- enforces a per-account quota in Supabase rather than process memory.

Signed-out users retain local deterministic categorization without consuming Groq quota.

## Exchange-rate boundary

TapTrack does not use hard-coded or estimated exchange-rate fallbacks.

Historical exchange and TRY-unified reporting use TCMB rates via Frankfurter for the requested transaction/conversion date. If no rate is published on that date, only the most recent prior published rate is accepted. If no valid rate can be obtained, the operation/report conversion fails visibly rather than substituting an invented value.

## Authentication boundary

Supabase authentication callbacks support PKCE code exchange and token-hash verification for email confirmation flows. Callback failures return the user to the login flow with an error rather than silently entering the application.

Production responses include Content Security Policy, frame protection, `X-Content-Type-Options: nosniff`, and a referrer policy. Route smoke tests assert those headers.

## PWA/offline boundary

The PWA keeps a versioned offline shell and local IndexedDB ledger. Automated Chromium verification covers warmed offline navigation and an offline-created Quick Add transaction surviving reload at mobile widths.

This does not prove native installed Safari/iOS behavior. Native interactive widgets are not part of the current web build.

## Telegram boundary

Telegram is deliberately deferred. The legacy webhook route may still exist in the repository, but it predates the canonical checkpoint/ledger architecture and must not be represented as equivalent to ordinary TapTrack transaction capture until it is redesigned and reverified.

Do not expose Telegram secrets, bot tokens, webhook payloads, owner identifiers, or real finance data in logs, screenshots, issues, or test fixtures.

## Dependency and release security

GitHub Actions installs the committed npm lockfile and runs:

- publication guard;
- full dependency audit;
- production-only dependency audit;
- ESLint;
- TypeScript typecheck;
- Vitest;
- production build;
- route/API smoke checks;
- offline mobile Playwright verification.

The current runtime baseline is Node 22.x, Next.js 16.3.4, React 19.2.8, and ESLint 9.39.5 with matching `eslint-config-next`.

## Supabase Auth configuration

Leaked-password protection is configured at the Supabase Auth project level rather than through repository SQL migrations and may require a paid Supabase plan. Deployment owners should enable it when available and appropriate.

## Historical repository review

Before using repository screenshots or examples as public release evidence, review repository history for accidentally committed environment files, credentials, real finance data, screenshots, or provider-specific identifiers. Current-tree guards cannot remove material from historical Git objects.

## Reporting

Report security issues privately to the repository owner. Do not open a public issue containing credentials, real finance data, webhook payloads, Supabase identifiers, or exploit details that could expose a deployment.
