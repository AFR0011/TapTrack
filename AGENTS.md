# TapTrack Agent Notes

## Source Of Truth

- `BLUEPRINT.md` defines product scope, V1 non-goals, build order, and acceptance criteria.
- `docs/PROJECT_STATE.md` is the current implementation snapshot.
- `docs/REPO_MAP.md` maps active files, data flow, and verification commands.
- `.claude/` contains companion workflow notes; do not treat it as the app architecture source of truth.

## Project Shape

- Next.js 14 App Router application in `app/`.
- TypeScript domain model and local-first data layer in `src/`.
- Dexie/IndexedDB is the V1 persistence boundary.
- Tailwind CSS is the styling layer.
- Vitest is the unit/integration test runner for parser and database service logic.

## Working Rules

- V2 features (cloud sync, Telegram bot, AI categorization, exchange rates, etc.) are complete. Focus on bug fixes and UX improvements.
- Cloud sync: Use Supabase for remote storage. Push updates fire-and-forget; pull updates on app open. See `src/sync/syncService.ts`.
- Telegram: Webhook routes at `app/api/telegram/webhook` and `app/api/telegram/register`. Requires `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TAPTRACK_OWNER_USER_ID` env vars.
- AI categorization: Local Ollama via `app/api/categorize`. Requires `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
- Exchange rates: Fetch live rates from `open.er-api.com` via `app/api/exchange-rates`.
- Prefer small diffs that advance the current build phase in `BLUEPRINT.md`.
- Shared domain types belong in `src/types.ts`.
- Canonical persistence should flow through `src/database.ts` and service modules under `src/`; avoid parallel client-only transaction stores unless the persistence boundary is made explicit.
- Dexie schema changes require a versioned migration and tests around seeding or data writes.
- Use `npm.cmd` in PowerShell if `npm.ps1` is blocked.

## Verification

Run the relevant subset while working. Before claiming an implementation task is complete, run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

`npm.cmd run check` runs the same ladder in sequence.

## Done Criteria

- Code builds and typechecks.
- Tests cover new parser/service/database behavior.
- `docs/PROJECT_STATE.md` is updated when the task materially changes current status, next steps, or verification state.
- Remaining risks are stated plainly, especially for local data persistence and mobile capture flow.
