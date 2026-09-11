# Architecture

Ravel is a Next.js 16 App Router PWA with a browser-profile-local Dexie/IndexedDB ledger. The product is local-first: ordinary finance capture and review do not require a network connection or account. Supabase Auth/sync and server-side integrations add capabilities but do not redefine the local ledger's finance semantics.

## Runtime boundaries

- `app/` owns routes, layouts, providers, authentication callbacks, and server endpoints.
- `src/components/` owns client workspaces and application navigation.
- `src/database.ts` owns the IndexedDB schema and additive migrations.
- Domain folders under `src/` own finance behavior.
- `src/sync/` owns device/account binding, outbox delivery, adoption, convergence, and sync status.
- `src/exports/` owns backup/export/restore/reset flows.
- `src/server/` owns server-only integration helpers and privileged boundaries.
- `public/sw.js` owns the versioned offline application-shell cache; finance data remains in IndexedDB.
- `proxy.ts` may refresh an optional valid session but local application use must not require authentication.

## Canonical local ledger

Canonical financial truth is represented by opening/reconciliation balance checkpoints plus transactions and conversions. The `balances` table is derived cache and may be rebuilt from canonical activity.

Finance mutations that participate in sync commit both the canonical local change and durable sync intent atomically inside IndexedDB. Network delivery occurs afterward and retries through the outbox.

The persisted IndexedDB database name remains `TapTrackDB` so existing installations open the same ledger after the Ravel rename. The TypeScript API is `RavelDatabase`; the historical physical name is a compatibility contract.

## Optional account sync

A browser ledger may be explicitly bound to one authenticated Supabase account. Missing/invalid bindings and account mismatches fail closed for remote finance operations.

When both local and cloud ledgers contain data, adoption is explicit rather than silently choosing a winner. Account-wide replacement rotates ledger generation so stale clients adopt the new canonical account state rather than replaying obsolete pending work.

First-device empty-cloud claim plus initial seed is atomic through the server-authorized `claim_empty_taptrack_ledger` PostgreSQL primitive. A concurrent loser receives conflict and remains unbound. The historical RPC name is retained because it is already deployed.

Canonical cloud writes are mediated through protected server/database operations rather than unrestricted authenticated-browser mutation policies.

## Backup and destructive-operation boundaries

The backup wire format is versioned and validated. Device-only and account-wide restore/reset are separate operations with explicit scope and safety backups. Account-wide replacement is generation-aware. Device disconnect removes cloud binding/sync state but preserves the local canonical ledger.

The V2 backup format identifier remains `taptrack-backup` for backward compatibility, while newly downloaded files use Ravel filenames.

## Assistive services

### Smart Categories

Groq categorization is optional, authenticated, server-side, and non-blocking. It suggests existing/new-category candidates but cannot override a manual category choice. A late suggestion may update only the just-created transaction while it still matches the guarded provisional state.

### Exchange rates

Rate lookup is server-mediated and date-aware. Historical reports/conversions use explicit provider observations and do not invent fallback rates.

### Telegram and capture tokens

Telegram is an optional private-owner capture path with fail-closed configuration, secret verification, protected canonical mutation, and `update_id` idempotency. Capture-token entry uses new `ravel_capture_` credentials while accepting previously issued `taptrack_capture_` credentials until revoked.

## PWA/offline boundary

The service worker caches Ravel manifest/icons and application documents/assets needed for verified offline navigation. It uses `ravel-shell-*` cache names and removes historical `taptrack-shell-*` caches during activation.

Chromium CI verifies fresh and warmed offline mobile workflows. Native installed Safari/iOS lifecycle/storage behavior remains a separate unverified residual.

## Security and privacy boundaries

IndexedDB is not application-level encrypted. Optional Supabase, Groq, Telegram, and exchange-rate integrations extend the trust boundary only when enabled. Server-only credentials must never be exposed to browser code.

See `SECURITY.md` for the current security contract and `docs/RAVEL_COMPATIBILITY.md` for historical identifiers that must not be renamed casually.