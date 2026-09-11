# Publication Readiness

Ravel is a public engineering portfolio repository for a mobile-first, local-first personal finance application built with Next.js, React, TypeScript, Dexie/IndexedDB, and Supabase Auth, with optional remote canonical sync and server-side integrations.

## Release status

TT-B002 is now deployed to production on `main`.

The production release includes:

- canonical checkpoint-based ledger reconstruction and reconciliation;
- atomic local finance mutation + durable IndexedDB sync intent;
- explicit cloud-use vs local-merge adoption;
- multi-device convergence and generation-aware account replacement;
- versioned backup/restore with explicit device/account scope;
- explicit reset-only-this-device vs reset-synced-account-everywhere semantics;
- explicit per-device cloud disconnect;
- anchored recurring schedules and deterministic occurrence IDs;
- historical TCMB/Frankfurter FX and transaction-date report/PDF valuation;
- authenticated server-side Groq categorization with server-only quota enforcement;
- private-owner Telegram capture using atomic/idempotent server-side mutation;
- PKCE/token-hash auth callback handling;
- production CSP/security headers;
- authenticated-shell PWA registration and offline-mobile Chromium verification.

## Verification

The B002 automated gate passed on implementation head `2e01cda7e69e80a4b75fa2bcea20f253fb4ebbc5` in GitHub Actions run `34206762454`:

- 32/32 Vitest files PASS;
- 172/172 tests PASS;
- TypeScript PASS;
- production build PASS;
- 9/9 route-smoke checks PASS;
- 2/2 mobile offline Playwright projects PASS;
- dependency audits reported 0 vulnerabilities at the configured threshold.

The compatible B002 application was promoted to `main` and deployed to Vercel production. Production Supabase server credentials were configured, protected sync was confirmed working, and `enforce_protected_sync_writes` was then applied.

Post-enforcement verification confirmed:

- canonical finance tables expose owner SELECT policies only;
- direct authenticated-browser INSERT/UPDATE/DELETE policies are removed;
- protected mutation and replacement RPCs remain `SECURITY DEFINER`, service-role executable, and unavailable to ordinary authenticated clients;
- no fresh production runtime errors were observed in the checked sync/restore/AI/Telegram route window.

The subsequent `optimize_rls_and_indexes` migration removed RLS initplan warnings and duplicate unique indexes while preserving policy semantics.

## Public claims currently supportable

Ravel can accurately claim that:

- finance capture is local-first and can operate offline after the application shell is warmed;
- balances are derived from canonical checkpoints, transactions, and conversions rather than synchronized as independent truth;
- normal local finance writes durably queue sync intent atomically with local mutation;
- cloud binding is explicit and account mismatches fail closed;
- same-record conflicts use last-successful-sync-wins behavior;
- account-wide replacement rotates ledger generation so stale clients adopt instead of replaying old pending work;
- restore/reset have explicit device-only and account-wide semantics;
- device disconnect preserves the canonical local ledger while removing cloud binding and pending sync intent;
- historical FX and TRY-unified reports use transaction-date valuation;
- hosted AI categorization is authenticated and server-side;
- Telegram mutation is private-owner-only, atomic, and idempotent by Telegram `update_id`;
- canonical production writes are now enforced through server-mediated protected routes rather than browser mutation policies.

Do not claim that:

- native installed Safari/iOS behavior has been comprehensively verified;
- empty-cloud claim + initial seed is one transactional server operation;
- IndexedDB is encrypted by Ravel;
- money uses exact integer-minor-unit or decimal arithmetic;
- the repository's entire unreachable/reflog/object history has been exhaustively secret-scanned unless a full local mirror scan is completed.

## Residuals

The following are intentionally retained as documented residuals rather than hidden behind release wording:

- native installed Safari/iOS relaunch, upgrade, and storage-eviction behavior;
- empty-cloud claim/seed TOCTOU between final emptiness check and initial seed;
- JavaScript `number` monetary precision;
- local IndexedDB at-rest exposure;
- exhaustive full-object historical secret scan;
- Supabase leaked-password protection remains disabled at the Auth project level unless enabled separately.

## Privacy presentation rule

Screenshots, GIFs, demo exports, database examples, and sample sync payloads intended for the public repository must use synthetic names, amounts, account balances, provider identifiers, and transaction histories.

Never publish screenshots containing real Supabase server credentials, Groq credentials, Telegram tokens, webhook secrets, real user IDs, or personal finance history.

## License

Ravel source code is released under the MIT License. See `LICENSE`.
