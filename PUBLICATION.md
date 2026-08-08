# Publication Readiness

TapTrack is being prepared as a public engineering portfolio repository. The public presentation should focus on the implemented local-first finance architecture, sync and integration boundaries, data validation, responsive application design, and automated verification without presenting the project as a commercial finance product.

## Required before public visibility

- [x] Upgrade the maintained framework stack to Next.js 16.2.12 / React 19.2.8.
- [x] Pass the complete runtime and development dependency audit at high severity.
- [x] Pass lint, typecheck, 67 automated tests, production build, and route smoke on the publication branch.
- [x] Rewrite the README to distinguish local IndexedDB storage, Supabase Auth, optional Supabase data sync, and optional integrations.
- [x] Add a security policy describing finance-data and secret boundaries.
- [ ] Choose and add an explicit source-code license.
- [ ] Finish the historical Git review for old environment files, credentials, real finance data, screenshots, or provider identifiers.
- [ ] Use only synthetic/demo financial values and transaction descriptions in public screenshots.
- [ ] Perform a final authenticated manual walkthrough using a disposable test Supabase account before presenting screenshots as release evidence.

## Supported portfolio claims

TapTrack can truthfully be described as a mobile-first local-first personal finance application built with Next.js, React, TypeScript, Dexie/IndexedDB, and Supabase Auth, with optional remote sync and integrations.

Implemented engineering evidence includes:

- command and multi-entry transaction parsing;
- balance-aware finance mutations;
- monthly and category budgeting with rollover;
- recurring transaction creation on app open;
- range/year reporting and CSV/JSON/PDF portability;
- local-first IndexedDB persistence;
- optional per-user Supabase synchronization with retry/tombstone behavior;
- Telegram webhook authentication and owner restriction;
- optional local Ollama categorization with graceful fallback;
- server-fetched exchange rates with fallback behavior;
- responsive/PWA presentation and accessibility work;
- automated lint, typecheck, tests, production build, route smoke, and dependency auditing.

## Claims to avoid

Do not describe TapTrack as:

- a commercial/client finance product;
- a bank or payment-network integration;
- an accounting, tax, investment, or financial-advice service;
- fully offline or backend-free;
- end-to-end encrypted finance storage;
- a multi-user/team finance platform;
- a system with a durable server-side synchronization queue;
- a background recurring-payment scheduler;
- proof of production readiness for handling other people's financial data.

## Privacy presentation rule

Screenshots, GIFs, demo exports, and sample database content intended for the public repository must use synthetic names, amounts, account balances, Telegram identifiers, and transaction histories. Do not use cropped real data and assume nobody will notice. Humans invented zoom.

## License blocker

No source-code license is currently committed. Keeping the repository private until a license is intentionally selected avoids creating an ambiguous public-use situation.
