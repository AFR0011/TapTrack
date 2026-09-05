# TapTrack Agent Notes

## Authority order

1. Active user and repository `AGENTS.md` instructions.
2. `DEV_STATE.md` for the active workflow phase and owner.
3. The **Active batch** section in `BLUEPRINT.md` for authorized scope and acceptance.
4. Actual code, migrations, manifests, and tests for implemented behavior.
5. `docs/PROJECT_STATE.md` and `docs/REPO_MAP.md` for reconciled summaries.

## Source Of Truth

- `BLUEPRINT.md` defines product scope, V1 non-goals, build order, and acceptance criteria.
- `docs/PROJECT_STATE.md` is the current implementation snapshot.
- `docs/REPO_MAP.md` maps active files, data flow, and verification commands.
- `.claude/` contains companion workflow notes; do not treat it as the app architecture source of truth.

## Project Shape

- Next.js 16 App Router application in `app/`, with `proxy.ts` as the route/session boundary.
- TypeScript domain model and local-first data layer in `src/`.
- Dexie/IndexedDB is the V1 persistence boundary.
- Tailwind CSS is the styling layer.
- Vitest is the unit/integration test runner for parser and database service logic.

## Working Rules

- The local finance core is device/browser-profile-local and must remain usable without authentication or network access. Sign-in enables optional capabilities; it must never gate local setup, CRUD, budgets, recurring checks, reports, settings, import, or export.
- Cloud sync, Telegram, AI categorization, and exchange rates exist but are not presumed release-safe. Follow `RISK_REGISTER.md`; gate or disable unsafe integration paths until their dedicated batches pass.
- Cloud sync: Use Supabase for remote storage. Push updates fire-and-forget; pull updates on app open. See `src/sync/syncService.ts`.
- Telegram: Webhook routes at `app/api/telegram/webhook` and `app/api/telegram/register`. Requires `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TAPTRACK_OWNER_USER_ID` env vars.
- AI categorization: Local Ollama via `app/api/categorize`. Requires `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
- Exchange rates: Fetch live rates from `open.er-api.com` via `app/api/exchange-rates`.
- Prefer small diffs that advance the current build phase in `BLUEPRINT.md`.
- Shared domain types belong in `src/types.ts`.
- Canonical persistence should flow through `src/database.ts` and service modules under `src/`; avoid parallel client-only transaction stores unless the persistence boundary is made explicit.
- Dexie schema changes require a versioned migration and tests around seeding or data writes.
- A local ledger must never be silently uploaded to a newly signed-in or switched account. Any account binding requires explicit user confirmation and mismatch blocking.
- Do not perform GitHub presentation, screenshots, metadata, or release work until the offline/mobile acceptance gate passes.
- Never use real finance records, credentials, provider identifiers, or production mutations in tests or evidence.
- Use `npm.cmd` in PowerShell if `npm.ps1` is blocked.

## Protected paths

- `.env*`, provider configuration, and deployment secrets.
- `src/database.ts`, `src/sync/**`, and `supabase/migrations/**` because they affect financial-data ownership, compatibility, and remote integrity.
- `app/api/telegram/**` because it can read or mutate finance records remotely.
- Private pre-rewrite mirrors, bundles, and commit maps outside this repository.
- User IndexedDB, exports, screenshots, and any real finance data.

Generated outputs such as `.next/`, `node_modules/`, coverage, Playwright results, and `tsconfig.tsbuildinfo` are not authoritative inputs and must not be committed.

## Required commands

Run the relevant subset while working. Before claiming an implementation task is complete, run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd audit --audit-level=high
npm.cmd audit --omit=dev --audit-level=high
```

`npm.cmd run check` runs the same ladder in sequence.

Offline/mobile changes additionally require production-browser evidence at 320px and 390px, plus a warmed then offline relaunch covering the local core.

## Done Criteria

- Code builds and typechecks.
- Tests cover new parser/service/database behavior.
- `docs/PROJECT_STATE.md` is updated when the task materially changes current status, next steps, or verification state.
- Remaining risks are stated plainly, especially for local data persistence and mobile capture flow.
