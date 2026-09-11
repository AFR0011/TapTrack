# Security Policy

Ravel is a personal finance ledger and engineering portfolio project. It is **not a banking service**, payment processor, accounting service, investment platform, tax service, or financial-advice service.

## Data and trust boundaries

Ravel is local-first for finance data. Normal finance workflows read and write IndexedDB through Dexie. Optional Supabase synchronization mirrors canonical records only after a device ledger is explicitly linked to an authenticated account.

Enabling integrations expands the privacy boundary:

- **Supabase Auth / sync** stores authenticated account state and optional canonical finance records in the configured Supabase project.
- **Groq Smart Categories** receives the narrowly scoped transaction/category context required for classification through an authenticated server route when AI suggestions are enabled.
- **Exchange-rate providers** receive currency/date requests through the application server route.
- **Telegram / capture endpoints** are optional server-mediated entry paths and must remain explicitly configured and fail closed.

Anyone with access to the browser profile may be able to inspect the local ledger. Ravel does not provide application-level IndexedDB encryption at rest.

## Secrets

Never commit real values for:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- private deployment/provider credentials

The public Supabase browser key is intended for client use, but authorization must still be enforced through authenticated access, row-level security, and protected server/database boundaries. The service-role key bypasses normal RLS and must remain server-side.

`.env`, `.env.local`, and production-local environment files are ignored by Git. The committed `.env.example` contains placeholders only.

## Local ledger boundary

Canonical balance state is reconstructed from opening/reconciliation checkpoints plus transactions and conversions. The local `balances` table is derived cache, not independent truth.

Finance mutations commit their canonical local record and durable sync-outbox intent in one IndexedDB transaction. Network delivery happens afterward and can retry without blocking offline-first use.

The historical IndexedDB name `TapTrackDB` is intentionally retained so existing browser profiles reopen the same ledger after the Ravel rebrand. It is a compatibility identifier, not public branding.

## Supabase sync boundary

Cloud finance sync is optional. A device must be explicitly linked to an authenticated user before remote canonical finance operations are eligible.

The synchronization model includes:

- owner-scoped canonical rows;
- durable device-local outbox operations;
- explicit cloud-vs-local adoption when both sides contain data;
- generation/revision metadata for account-wide replacement and stale-client detection;
- deterministic recurring occurrence identifiers;
- derived-balance rebuild after canonical changes are applied;
- account mismatch and invalid binding checks that fail closed.

### Empty-cloud initialization

First-device empty-cloud claim plus initial canonical seed is atomic through the server-authorized PostgreSQL function `claim_empty_taptrack_ledger`. The function locks the account ledger version and canonical tables, rechecks emptiness, and seeds the initial ledger in one transaction. A concurrent losing device receives conflict and remains locally unbound.

The historical RPC name is intentionally retained because it is a deployed compatibility contract. Authenticated browser clients cannot execute this primitive directly; the service-role server route mediates access.

### Protected canonical writes

Production canonical cloud writes use server-mediated protected paths and PostgreSQL `SECURITY DEFINER` primitives. Ordinary authenticated browser clients do not receive direct canonical table mutation authority merely because they are signed in.

Historical migration files and deployed RPC names containing `taptrack` must remain immutable unless a separate compatibility migration is designed and verified.

## Backup, restore, reset, and disconnect

Backup replacement is versioned and validated before mutation. Device-only and account-wide destructive actions have explicit scope.

- **Restore only this device** validates the backup, creates a safety backup, detaches cloud binding, and replaces local canonical state.
- **Restore synced account** requires a correctly linked signed-in browser and network access, replaces the account canonical ledger through a protected server path, rotates ledger generation, then adopts the new generation locally.
- **Reset only this device** uses the device-local replacement path with a generated fresh-ledger backup.
- **Reset synced account everywhere** uses the generation-rotating account replacement path.
- **Disconnect this device** removes local account binding and pending sync state without erasing the canonical local ledger or deleting the cloud account.

If a remote account replacement succeeds but the subsequent local replacement fails, the client must surface recovery instructions rather than pretending the device is synchronized.

## AI boundary

Groq Smart Categories require a valid Supabase user session for hosted classification.

The application server:

- rejects signed-out requests before calling Groq;
- keeps `GROQ_API_KEY` server-only;
- validates input size and allowed categories;
- requests structured output;
- enforces account-scoped quota state in Supabase;
- treats AI as optional and non-blocking.

Saving a transaction never waits indefinitely for AI. Manual category choices remain authoritative, and late categorization may modify only the just-created unchanged provisional transaction.

## Exchange-rate boundary

Ravel does not use invented or hard-coded exchange-rate fallbacks. Historical exchange/report valuation uses explicit provider data for the requested date or an allowed prior published observation. If no valid rate can be obtained, conversion/report behavior must fail visibly rather than fabricate precision.

## Authentication boundary

Supabase authentication callbacks support PKCE code exchange and token-hash verification for email confirmation flows. Callback failures return to the login flow with an error.

Password length is enforced in the application, but Supabase leaked-password protection is currently disabled at the Auth project level according to the production security advisor. Enable it in Supabase Auth when supported/appropriate for the deployed plan.

## PWA/offline boundary

Ravel keeps a versioned offline shell and local IndexedDB ledger. Service-worker registration occurs inside the application flow, and the service worker caches current Ravel PWA assets while cleaning historical TapTrack shell caches.

Automated Chromium verification covers fresh/warmed offline navigation and local ledger workflows at mobile widths. This does **not** prove native installed Safari/iOS relaunch, upgrade, storage-eviction behavior, or every cross-version service-worker lifecycle edge case.

## Telegram and capture boundary

Telegram is an optional private-owner integration, not a general shared-finance interface. The webhook fails closed when required secrets/owner configuration are absent, verifies the webhook secret, restricts configured owner/chat use, escapes dynamic Telegram HTML, and applies canonical mutation through protected server/database paths. Telegram `update_id` is used as an idempotency key.

New capture credentials use the `ravel_capture_` prefix. Previously issued `taptrack_capture_` credentials remain accepted until revoked normally so the rebrand does not invalidate installed capture workflows.

Do not expose Telegram secrets, capture tokens, webhook payloads, owner identifiers, or real finance data in logs, screenshots, issues, or fixtures.

## Security headers and release gate

Production responses include a Content Security Policy, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, a strict referrer policy, and a restrictive permissions policy. Route smoke asserts the principal header contract.

Ravel CI installs the committed lockfile and runs:

- publication/branding guard;
- full and production dependency audits;
- ESLint;
- TypeScript typecheck;
- Vitest;
- production build;
- route/API smoke;
- Chromium offline/mobile verification.

The verified production baseline `dd4546cbeec5f9cab1817f67c04ab24dfd017152` passed 49 Vitest files / 268 tests, 9/9 route smoke, and Playwright with 10 passed / 3 intentionally skipped.

## Historical repository review

Current-tree guards cannot prove the absence of secrets in unreachable Git objects or reflogs. A complete local mirror/all-object historical secret scan remains outstanding. Do not claim exhaustive history cleanliness until that is performed.

## Governance residual

GitHub `main` currently has no repository ruleset. Issue #14 tracks requiring PR-only changes, successful Ravel CI, and disabling force-pushes/branch deletion.

## Reporting

Report security issues privately to the repository owner. Do not open a public issue containing credentials, real finance data, webhook payloads, Supabase identifiers, or exploit details that could expose a deployment.