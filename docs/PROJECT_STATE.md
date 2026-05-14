# TapTrack Project State

Last updated: 2026-05-14

## Current Status

TapTrack V2 is implemented. All V2 features are complete with fixes for identified issues.

### V1 Foundation (unchanged)
- Next.js App Router shell with shared dashboard, transactions, budgets, recurring, reports, and settings navigation.
- First-time setup gate captures six starting balances, monthly TRY budget, and default payment method.
- Fast command parsing, preview, save, balance update, negative-balance blocking, and live dashboard updates.
- Manual transaction add/edit/delete with balance reversal validation.
- Monthly TRY budget, rollover calculation, category budgets, and budget usage display.
- Recurring transaction CRUD and app-open due/missed transaction creation.
- Reports cover category spending, spending over time, income vs expense, monthly comparison, and budget performance.
- Settings covers balance updates, default method, category CRUD, CSV/JSON/PDF export and import, and reset.

### V2 Features

**Phase 1 — Multi-entry command parsing**
- `parseCommands(input)` splits on `+/-` boundaries and returns a `ParseCommandResult[]`.
- `createTransactions([...])` atomically saves a batch in a single Dexie transaction with cumulative balance validation.
- Preview card shows stacked previews and a "Save All" button for multi-entry inputs.

**Phase 2 — Cloud infrastructure (Supabase + Auth + Sync)**
- Supabase Postgres mirrors all Dexie tables with `user_id` and RLS policies.
- Single-user magic-link email auth via `@supabase/ssr`; middleware protects all routes; `/login` page provided.
- `pushRecord(table, record)` upserts to Supabase immediately after every local Dexie write (fire-and-forget).
- `pullUpdates()` on app open fetches Supabase rows newer than `lastSyncAt` and merges into Dexie.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` deployed to Vercel.

**Phase 3 — Telegram bot**
- `POST /api/telegram/webhook` verifies `X-Telegram-Bot-Api-Secret-Token`, parses commands, saves directly to Supabase.
- Handles `/balance`, `/today`, `/help` commands and free-text transaction entries.
- `GET /api/telegram/register` registers the webhook URL with Telegram.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `TAPTRACK_OWNER_USER_ID` env vars required.

**Phase 4 — Exchange rates + TRY-unified reports**
- `GET /api/exchange-rates` fetches USD→TRY and EUR→TRY from `open.er-api.com`; cached 1 hour via ISR + Cache-Control.
- Reports page gains a "Unify to TRY" toggle that fetches live rates and re-renders all charts and metrics using converted amounts.
- `ExchangeRates` type added to `src/types.ts`.

**Phase 5 — AI categorization (local Ollama)**
- `POST /api/categorize` proxies to an Ollama server at `OLLAMA_BASE_URL`; returns `{ categoryId }` or `null` on error.
- `src/ai/categoryPrompt.ts` builds a one-shot classification prompt from the user's category list.
- CommandInput shows "AI …" badge while fetching; shows "AI" pill on the suggested category with a "revert" link.
- Settings → "AI categorization" toggle (stored in `settings.aiCategorizationEnabled`) with setup instructions.
- Degrades silently to keyword-rule suggestion when Ollama is unreachable or `OLLAMA_BASE_URL` is unset.

**Phase 6 — Design polish**
- Framer Motion + tailwindcss-animate installed.
- AppShell: glassmorphism header (backdrop-blur + white/80), gradient active nav pill, animated gradient mobile bottom-nav pill with spring layout animation, page fade-slide transitions via `AnimatePresence`.
- DashboardSummary: `AnimatedNumber` count-up for balances and spending figures, animated budget progress bar, card entrance stagger.
- RecentTransactions: `AnimatePresence` list with slide-in items, animated filter pill, `motion.div` layout animation for reorder.
- CommandInput: preview section animates in/out with `AnimatePresence`.
- Tailwind extended with gradient tokens, box-shadow utilities (`glass`, `glass-lg`, `highlight`), and animation keyframes.

## Active Objective

All V2 phases are complete. The app is ready for daily use and cloud sync. Remaining production steps:

1. **Deploy Ollama server** — provision a Render Web Service (or VPS), install Ollama, pull `qwen2.5:1.5b`, set `OLLAMA_BASE_URL` in Vercel.
2. **Register Telegram webhook** — call `GET /api/telegram/register` once after the Vercel URL is stable.
3. **Configure `TAPTRACK_OWNER_USER_ID`** — set to the Supabase `auth.users.id` of the account after first sign-in.

## Verification State

Verification ladder:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Latest verified: 2026-05-13 — all four steps pass clean.

- `npm.cmd run typecheck` — 0 errors.
- `npm.cmd run test` — 7 test files, 26 tests, all passing.
- `npm.cmd run build` — 15 static/dynamic routes, middleware 81.7 kB.

## Remaining Risks And Assumptions

- Supabase sync is fire-and-forget; if the device is offline at write time, the push is silently dropped. A retry queue is a future improvement.
- AI categorization requires a running Ollama server and will silently fall back to keyword rules when unreachable.
- The Telegram bot writes directly to Supabase (not Dexie); changes appear in the PWA on next app open via `pullUpdates`.
- PDF report is intentionally simple; pdfmake layout polish is out of current scope.
- Recurring transactions run on app open only; no background execution or push notifications.
- `npm audit` still reports Next/PostCSS advisories; upgrading to Next 16 is a separate framework-upgrade decision.
