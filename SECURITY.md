# Security Policy

TapTrack is a personal finance tracking application and engineering portfolio project. It is not a bank, payment processor, accounting service, investment platform, tax service, or financial-advice service.

## Data and trust boundaries

TapTrack is local-first for finance data. Normal finance workflows read and write IndexedDB through Dexie. Optional Supabase synchronization mirrors supported canonical records only after a device is explicitly linked to an authenticated account.

Enabling integrations changes the privacy boundary:

- **Supabase sync** stores canonical finance records in the configured remote project.
- **Groq categorization** sends the transaction title/category context required for classification through an authenticated server route when AI suggestions are enabled.
- **Exchange rates** are fetched through the application server route from TCMB via Frankfurter using currency/date information.
- **Telegram entry** is optional, server-side, and restricted to the configured private owner chat in the current design.

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
- ledger revision/generation metadata for account-wide replacement and stale-client detection;
- derived balance rebuild after canonical remote changes are applied.

A browser/account mismatch fails closed. A linked browser can explicitly disconnect itself without deleting its local finance ledger or changing the cloud account; the device binding and pending outbox are removed together.

### Cloud-link initialization residual

Empty-cloud linking performs a complete remote preflight and rechecks the remote ledger immediately before creating the device binding. However, binding and the subsequent initial seed writes are not one server-side transaction. A narrow time-of-check/time-of-use race therefore remains if another client writes to the same previously empty account between those operations.

The release documentation must not describe initial claim-and-seed as transactional until that server-side primitive exists and is concurrency-tested.

### Protected-write migration ordering

The remediation branch contains `20260908_enforce_protected_sync_writes.sql`, which removes direct authenticated-browser canonical write privileges after the compatible server-mediated sync client is deployed.

Do **not** apply that migration before the B002-compatible application is live. Applying it against the old production application would break its direct browser write path. Deploy the compatible application first, smoke-test it, then apply the protected-write migration as a coordinated release step.

## Backup, restore, reset, and disconnect boundary

Backup replacement is versioned and validated before mutation. Device-only and account-wide destructive actions have explicit scope.

- **Restore only this device** validates the backup, emits a pre-restore safety backup, detaches the browser from sync, and replaces local canonical state.
- **Restore synced account** requires a correctly linked signed-in browser and network access, replaces the canonical account through the authenticated restore route, rotates the ledger generation, and then replaces the local copy while preserving the binding to the new generation.
- **Reset only this device** reuses the device-only restore path with a generated fresh-ledger backup.
- **Reset synced account everywhere** reuses the generation-rotating account replacement path with a generated fresh-ledger backup.
- **Disconnect this device** removes only the local account binding and pending outbox. Canonical local finance rows and the cloud account remain unchanged.

Account-wide replacement can succeed remotely while local replacement subsequently fails. In that case the client surfaces an explicit recovery instruction to reload online and adopt the new generation before making more changes.

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

Production-build responses include Content Security Policy, frame protection, `X-Content-Type-Options: nosniff`, and a referrer policy. Route smoke tests assert those headers.

## PWA/offline boundary

The PWA keeps a versioned offline shell and local IndexedDB ledger. Service-worker registration occurs in the authenticated application layout so an unauthenticated installation cannot cache redirected login responses as application-route documents.

Automated Chromium verification covers warmed offline navigation and an offline-created Quick Add transaction surviving reload at 320x720 and 390x844.

This does not prove native installed Safari/iOS behavior, storage eviction behavior, or every old-service-worker-to-new-service-worker upgrade path. Native interactive widgets are not part of the current web build.

## Telegram boundary

Telegram is implemented as an optional private-owner integration, not as a general group/shared-finance interface.

The webhook:

- fails closed unless bot token, webhook secret, owner chat ID, owner Supabase user ID, timezone, Supabase URL, and service-role access are configured;
- verifies the Telegram secret-token header;
- rejects non-owner chats and non-private chats;
- uses the configured IANA timezone for ledger dates;
- calculates balances from canonical ledger state;
- excludes soft-deleted transaction rows;
- escapes dynamic Telegram HTML;
- applies transaction batches through the server-only `apply_taptrack_telegram_update` PostgreSQL RPC;
- uses Telegram `update_id` as the idempotency key so retries do not create duplicate transactions.

Ledger correctness does not depend on Telegram successfully sending the confirmation message back to the user.

The database primitive and automated webhook tests are implemented. Final release verification still requires a disposable-account / real-bot end-to-end walkthrough with production-equivalent configuration.

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

At B002 head `2e01cda7e69e80a4b75fa2bcea20f253fb4ebbc5`, run `34206762454` passed the complete gate with 32 Vitest files / 172 tests, 9 route-smoke assertions, and both mobile Playwright projects. Both dependency audits reported zero vulnerabilities at the configured threshold.

The current runtime baseline is Node 22.x, Next.js 16.3.4, React 19.2.8, and ESLint 9.39.5 with matching `eslint-config-next`.

## Supabase Auth configuration

Leaked-password protection is configured at the Supabase Auth project level rather than through repository SQL migrations and may depend on the project plan. Deployment owners should enable it when available and appropriate.

## Historical repository review

Before using repository screenshots or examples as public release evidence, review repository history for accidentally committed environment files, credentials, real finance data, screenshots, or provider-specific identifiers. Current-tree guards cannot remove material from historical Git objects.

## Release verification still required

A green credential-free CI gate does not prove provider-backed release safety. Before production promotion, use disposable/synthetic data to verify at minimum:

- first account/device link;
- second-device use-cloud and merge choices;
- two-device offline edits and convergence;
- account-wide and device-only restore;
- account-wide and device-only reset;
- device disconnect/relink;
- Telegram with the configured private owner chat and timezone;
- Groq authenticated categorization;
- staged protected-write migration ordering;
- production smoke after migration.

Native Safari/iOS installed-PWA behavior remains a separate residual unless explicitly tested.

## Reporting

Report security issues privately to the repository owner. Do not open a public issue containing credentials, real finance data, webhook payloads, Supabase identifiers, or exploit details that could expose a deployment.
