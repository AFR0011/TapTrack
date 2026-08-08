# Security Policy

TapTrack is a personal finance tracking application and engineering portfolio project. It is not a bank, payment processor, accounting service, investment platform, or financial-advice service.

## Data and trust boundaries

TapTrack is local-first for finance data: normal browser workflows read and write IndexedDB through Dexie. The standard application shell uses Supabase Auth, and optional sync can mirror supported records to a configured Supabase project.

Enabling integrations changes the privacy boundary:

- **Supabase sync** stores mirrored finance records in the configured remote project.
- **Telegram entry** sends user commands through Telegram and the application's webhook route before server-side storage/sync behavior.
- **Ollama categorization** sends transaction titles/category context to the configured Ollama endpoint when AI suggestions are enabled.
- **Exchange rates** are fetched through the application's server route from the configured public rate source.

Users should treat browser profiles, Supabase projects, Telegram chats, and Ollama endpoints as parts of the security boundary when those features are enabled.

## Secrets

Never commit real values for:

- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- private deployment credentials or provider tokens

The public Supabase anon key is designed for browser use, but authorization must still be enforced through Supabase policies and user-scoped access. A service-role key bypasses normal row-level security and must remain server-side.

`.env`, `.env.local`, and related local environment files are ignored by Git. The committed `.env.example` contains placeholders only.

## Telegram boundary

Telegram webhook requests are validated with `TELEGRAM_WEBHOOK_SECRET`. The integration can optionally restrict accepted chat messages to `TAPTRACK_OWNER_TELEGRAM_CHAT_ID`, and writes are mapped to the configured `TAPTRACK_OWNER_USER_ID`.

Do not expose the webhook secret or bot token in client bundles, screenshots, logs, repository issues, or committed test fixtures.

## Supabase boundary

Remote synchronization is optional for finance records, but Supabase Auth is part of the standard authenticated application flow. Deployment owners are responsible for maintaining appropriate row-level security, protecting privileged credentials, and using a dedicated project/environment suitable for the data involved.

## Local storage

IndexedDB may contain sensitive personal finance history. Shared browser profiles, unlocked devices, browser backups, developer tools, or malware with local-browser access may expose that information. TapTrack does not provide local database encryption at rest.

## Dependency and release security

GitHub Actions installs the committed npm lockfile and requires both a full dependency audit and a production-only audit at high severity before lint, typecheck, tests, build, and route smoke.

The publication branch uses ESLint 10 with the official `@eslint/compat` wrapper because the current Next.js lint plugin stack still contains rules written against the ESLint 9 API. This keeps the dependency graph audited without disabling lint coverage.

## Historical repository review

Before public visibility, repository history should be reviewed for accidentally committed environment files, credentials, personal finance data, screenshots, or provider-specific identifiers. Current-tree guards cannot remove material from historical Git objects.

## Reporting

Report security issues privately to the repository owner. Do not open a public issue containing credentials, real finance data, webhook payloads, Supabase identifiers, or exploit details that could expose a deployment.
