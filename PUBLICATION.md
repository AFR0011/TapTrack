# Publication Readiness

Ravel is a public engineering portfolio repository for a mobile-first, local-first personal finance ledger built with Next.js, React, TypeScript, Dexie/IndexedDB, optional Supabase Auth/sync, and optional server-side integrations.

## Release status

Ravel V1 is released on `main`. The public product, GitHub repository, PWA identity, CI workflow, and Vercel project use the Ravel name. The public production URL is `https://ravel-fawn.vercel.app`.

The last fully verified production baseline before the release-closure audit branch is `dd4546cbeec5f9cab1817f67c04ab24dfd017152`.

Ravel CI run `34630711573` passed:

- publication guard;
- full and production dependency audits with 0 reported vulnerabilities;
- ESLint;
- TypeScript;
- 49 Vitest files / 268 tests;
- production build;
- 9/9 route-smoke checks;
- Playwright: 10 passed / 3 intentionally skipped across mobile and desktop coverage.

The corresponding Vercel production deployment `dpl_FWn9vqGpuNyqkbXb6194KvQV93vK` is READY, and no runtime error clusters were found in the checked 24-hour production window.

## Implemented release capabilities

- canonical checkpoint-based ledger reconstruction and reconciliation;
- atomic local finance mutation plus durable IndexedDB sync intent;
- explicit cloud-use vs local-merge adoption;
- generation-aware multi-device convergence and account replacement;
- server-authorized atomic empty-cloud claim plus initial seed;
- versioned backup/restore with explicit device/account scope;
- explicit device-only vs account-wide reset semantics;
- explicit per-device cloud disconnect;
- anchored recurring schedules and deterministic occurrence IDs;
- historical exchange-rate support and transaction-date report valuation;
- authenticated server-side Groq categorization with non-blocking save behavior;
- private-owner Telegram capture through protected server/database paths;
- capture-token workflow with legacy-token compatibility;
- PKCE/token-hash auth callback handling;
- production CSP/security headers;
- authenticated-shell PWA registration and Chromium offline/mobile verification;
- complete Ravel public visual identity and provider rename for GitHub/Vercel.

## Public claims currently supportable

Ravel can accurately claim that:

- finance capture is local-first and can operate offline after the application shell is prepared;
- cash, cards, multiple currencies, transfers, exchanges, reconciliations, income, and expenses coexist in one ledger;
- balances are derived from canonical checkpoints, transactions, and conversions rather than synchronized as independent truth;
- normal local finance writes durably queue sync intent atomically with local mutation;
- cloud binding is explicit and account mismatches fail closed;
- account-wide replacement rotates ledger generation so stale clients adopt instead of replaying old pending work;
- first-device empty-cloud claim and initial seed are one server-authorized transaction;
- restore/reset have explicit device-only and account-wide semantics;
- historical FX/report conversion follows explicit date-aware behavior rather than inventing rates;
- hosted AI categorization is authenticated, server-side, optional, and non-blocking;
- Telegram mutation is private-owner-only, atomic at the database primitive, and idempotent by Telegram `update_id`;
- canonical production writes use server-mediated protected routes rather than direct browser mutation policies.

Do not claim that:

- native installed Safari/iOS behavior has been comprehensively verified;
- IndexedDB is encrypted by Ravel;
- money uses exact integer-minor-unit or decimal arithmetic;
- the repository's entire unreachable/reflog/object history has been exhaustively secret-scanned;
- all account-security protections are enabled while Supabase leaked-password protection remains disabled.

## Rebrand compatibility

A small set of historical TapTrack identifiers remains intentionally because existing devices, backups, environment configuration, credentials, or deployed database contracts depend on them. They are compatibility identifiers, not public branding. See `docs/RAVEL_COMPATIBILITY.md`.

## Residuals

- Native installed Safari/iOS relaunch, upgrade, and storage-eviction behavior remains unverified.
- JavaScript `number` remains the money representation.
- IndexedDB remains visible to anyone with access to the browser profile and is not application-level encrypted.
- A complete local Git all-object/reflog historical secret scan remains outstanding.
- Supabase leaked-password protection is currently disabled at the Auth project level.
- GitHub `main` still lacks a repository ruleset; issue #14 tracks the governance control.
- The Supabase project display name still uses the historical TapTrack label.

## Privacy presentation rule

Screenshots, GIFs, demo exports, database examples, and sample sync payloads intended for the public repository must use synthetic names, amounts, account balances, provider identifiers, and transaction histories.

Never publish screenshots containing real Supabase server credentials, Groq credentials, Telegram tokens, webhook secrets, real user IDs, or personal finance history.

## License

Ravel source code is released under the MIT License. See `LICENSE`.