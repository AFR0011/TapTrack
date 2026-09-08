# TapTrack

TapTrack is a mobile-first, local-first personal finance tracker built around fast daily capture, deterministic ledger semantics, and optional account sync. Finance activity is written to IndexedDB through Dexie first; supported cloud sync mirrors canonical records to Supabase without making network availability a prerequisite for ordinary use.

TapTrack is a personal engineering application, not a banking, accounting, investment, tax, or financial-advice service.

## What it demonstrates

- **Multiple transaction-entry modes**: guided Quick Add for everyday use, Command mode for keyboard-first capture such as `-120 coffee cash`, and a detailed transaction editor.
- **Shortcut-friendly capture** through `/app/add`, validated deep-link prefills, and Android PWA manifest shortcuts for expense, income, and command entry.
- **Canonical ledger accounting** built from immutable opening checkpoints, monthly reconciliation checkpoints, transactions, and conversions. Display balances are derived cache, not independent truth.
- **Offline-first mutation safety**: local finance writes and their durable sync-outbox intents are committed atomically in IndexedDB; network delivery happens afterward and can retry.
- **Optional multi-device Supabase sync** with explicit cloud-vs-local adoption, durable retry state, soft deletes, deterministic recurring occurrence IDs, and last-successful-sync-wins conflict behavior for the same record.
- **Historical foreign-exchange handling** using TCMB data via Frankfurter. Exchanges and TRY-unified reports use the selected/transaction date and fall back only to the most recent prior published rate.
- **Authenticated hosted AI categorization** using Groq server-side. Signed-out use never consumes Groq quota, the API key stays server-only, and per-account quota enforcement is backed by Supabase.
- **PWA/offline verification** covering mobile layouts, warmed offline navigation, offline Quick Add persistence, and service-worker lifecycle behavior in Chromium.
- **Security hardening** including PKCE/email callback handling, Content Security Policy and related headers, dependency auditing, row-level data boundaries, and server-only privileged integrations.

## Architecture

```mermaid
flowchart LR
    U[Browser / installed PWA] --> A[Next.js App Router]
    A --> D[Dexie / IndexedDB]
    A --> S[Supabase Auth]
    D --> Q[Durable local sync outbox]
    Q --> Y[Optional Supabase canonical sync]
    A --> R[Next.js route handlers]
    R --> F[TCMB via Frankfurter]
    R --> G[Groq categorization]
    R -. deferred .-> T[Telegram integration]
```

### Ledger boundary

Opening and reconciliation checkpoints establish authoritative balance observations. Transactions and conversions after the latest applicable checkpoint are replayed to derive current balances. The `balances` table is a local derived cache and is not treated as an independently synchronized source of truth.

Opening balances can be set only during initial setup. Later real-world balance corrections are recorded as reconciliation checkpoints and are excluded from ordinary income/expense analytics.

### Sync boundary

Sync is optional for finance records. A device must be explicitly bound to an authenticated Supabase account before finance data is mirrored.

When a device with local data links to an account that already contains cloud finance data, TapTrack requires an explicit choice between:

- **Use cloud data**: replace the device's canonical local ledger with the fetched cloud snapshot.
- **Merge this device**: preserve local records and enqueue them into the account before pulling the resulting cloud state.

Normal local finance mutations commit the canonical row and matching durable outbox operation in the same IndexedDB transaction. Failed network delivery leaves the outbox entry intact for later retry. Remote soft deletes propagate back to local state and balances are rebuilt from the canonical ledger afterward.

For conflicting edits to the same existing record, the last successful sync wins.

### Offline/PWA boundary

TapTrack is designed to keep normal finance capture usable without a connection after the PWA shell has been installed/warmed. Current automated Chromium coverage verifies offline navigation and an offline-created Quick Add transaction surviving reload at mobile widths.

The repository does not claim equivalent native Safari/iOS installed-PWA verification yet. Native interactive widgets are also outside the current web build; `/app/add` provides the stable deep-link target for platform shortcuts such as Android launcher shortcuts and user-created iPhone Shortcuts/Back Tap/Action Button flows.

## Transaction capture

### Quick Add

Quick Add is the default on new devices. It is amount-first and keeps the common path short: type, amount, title, category, payment method, save. More details expose date, currency, and notes without forcing every user through a database-shaped form.

The selected Quick/Command entry mode is stored per device rather than synchronized across the account, so a desktop can remain keyboard-first while a phone stays touch-first.

### Command mode

Command mode remains available for power users and supports compact entries such as:

```text
-120 coffee cash
+20000 salary card
```

Parsed commands are previewed before save unless the UI explicitly chooses a faster path.

### Detailed editor

The Transactions workspace remains the full editor for historical records and detailed corrections. Quick Add, Command mode, the detailed editor, recurring generation, and deep-link capture all write through the same transaction/ledger services.

## Balances and reconciliation

- TRY, USD, and EUR.
- Cash and card methods.
- One-time opening balance setup.
- Monthly reconciliation on first app open in a new calendar month.
- Reconciliation stores the observed absolute amount plus the resulting delta.
- Historical activity entered on the same date as a reconciliation checkpoint asks whether it occurred before or after the checkpoint when ordering is otherwise ambiguous.

## Currency conversion and reporting

Currency exchange and cash/card transfers use the same canonical ledger service as transactions.

For cross-currency exchange, TapTrack calculates the destination amount from the source amount and selected date using TCMB rates exposed through the server-side Frankfurter integration. If the exact date has no published rate, the most recent prior published date is used. TapTrack does not substitute hard-coded or estimated fallback rates.

Reports support Month, Range, and Year views. By default they show TRY transactions only. **Convert all to TRY** values each USD/EUR transaction using its own transaction date, with the same prior-published-date rule. PDF export follows the currently selected report FX mode and uses the already-loaded historical-rate map so screen and export totals match.

Monthly budget performance remains a TRY-budget view even when report activity is converted to TRY.

## Budgets and recurring entries

- Monthly TRY budget and category budgets.
- Rollover support.
- Recurring income/expense rules.
- Deterministic occurrence IDs prevent the same recurring event from becoming duplicate transactions across devices.
- Monthly recurrence preserves the original day anchor: for example, Jan 31 → Feb 28/29 → Mar 31.
- Yearly Feb 29 recurrence clamps to Feb 28 in non-leap years and returns to Feb 29 in leap years.
- Online startup pulls cloud state before generating due recurring entries; offline startup still generates locally.

## AI categorization

AI categorization is optional and requires a signed-in TapTrack account.

- Provider: **Groq**.
- Default model: `openai/gpt-oss-20b`.
- `GROQ_API_KEY` is server-only.
- The server validates the Supabase session before calling Groq.
- Input size and returned category values are validated.
- Per-account quota enforcement is stored in Supabase rather than process memory.
- Signed-out users retain local deterministic category suggestions without calling Groq.

The live TapTrack Supabase project has applied the server-only quota hardening migration: browser roles cannot execute the `SECURITY DEFINER` quota RPC, while the authenticated application route verifies the user and consumes quota through the service-role client.

## Authentication and security

Supabase Auth powers the account layer. The callback route supports PKCE code exchange and token-hash verification for email confirmation flows.

Production responses include Content Security Policy, frame protection, `nosniff`, and referrer-policy headers, with route smoke assertions protecting those headers from accidental removal.

The current dependency baseline is audited in CI with no high-severity findings.

## Technology

- **Next.js 16.3.4** App Router
- **React / React DOM 19.2.8**
- **TypeScript**
- **Dexie / IndexedDB**
- **Supabase Auth + optional canonical data sync**
- **Groq** for optional authenticated AI categorization
- **Tailwind CSS**
- **Framer Motion**
- **Recharts**
- **Vitest**
- **Playwright**

Node.js **22.x** is the supported runtime and is pinned in `package.json`/CI.

## Local setup

Install the locked dependency graph:

```bash
npm ci
```

Copy the environment template:

```bash
cp .env.example .env.local
```

On PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Start development:

```bash
npm run dev
```

## Environment variables

| Variable | Purpose | Required for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project endpoint | Auth/account features and optional sync |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe Supabase key | Auth/account features and optional sync |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-side Supabase access | Server-only integration/admin paths, including hardened AI quota RPC |
| `GROQ_API_KEY` | Groq API credential | Authenticated AI categorization |
| `GROQ_MODEL` | Optional Groq model override | AI categorization; defaults to `openai/gpt-oss-20b` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API credential | Deferred Telegram integration |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook validation | Deferred Telegram integration |
| `TAPTRACK_OWNER_TELEGRAM_CHAT_ID` | Telegram owner-chat restriction | Deferred Telegram integration |
| `TAPTRACK_OWNER_USER_ID` | Supabase user mapped to Telegram | Deferred Telegram integration |

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, or Telegram secrets to browser code or commit them to the repository.

## Verification

Run the main local ladder:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Or:

```bash
npm run check
```

CI additionally performs dependency audits, production route smoke, and offline mobile Playwright verification.

The current remediation suite contains **24 Vitest files / 137 tests** and covers parser behavior, ledger/reconciliation semantics, recurring anchors, atomic local+outbox mutation, cloud adoption and two-device convergence, historical FX, Groq auth/quota behavior, authentication callbacks, exports, migrations, security policy, and integration routes.

## Known limitations / deferred work

- No bank or payment-network connection.
- No receipt/photo OCR or attachment workflow.
- Telegram entry is deliberately deferred and its legacy webhook accounting path should not be treated as part of the current canonical ledger design.
- Native interactive iOS/Android widgets are not implemented; current device integration uses PWA/deep-link shortcuts.
- Native installed Safari/iOS offline behavior still needs dedicated verification.
- Versioned JSON restore/replace is implemented for unlinked/local ledgers, including pre-restore safety backup, strict validation, and legacy-backup checkpoint migration. Restore is intentionally blocked on cloud-linked ledgers until device-only versus account-wide scope is decided.
- Reset/account-unlink cloud scope remains unresolved and must be decided before release.
- Supabase leaked-password protection is a dashboard-level configuration option and may depend on the project plan; it is not controlled by repository SQL migrations.
- The final authenticated release walkthrough should use disposable/synthetic finance data.

## Privacy

IndexedDB may contain sensitive personal finance history. Anyone with access to the browser profile may be able to inspect that data; TapTrack does not provide application-level local database encryption.

Enabling Supabase sync stores supported canonical records in the configured project. Enabling Groq categorization sends the transaction title/category context required for classification through the authenticated server route to Groq. Exchange-rate requests send currency/date pairs to the application's rate provider but not transaction titles or amounts.

## License

TapTrack is released under the **MIT License**. See [`LICENSE`](LICENSE).
