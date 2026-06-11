# TapTrack Project State

Last updated: 2026-06-11

## Current Status

TapTrack V2 is implemented. The QA remediation plan and the `modifications.md` UI/UX pass (#1–#40) are complete in the working tree. The app remains a local-first Next.js 14 App Router product with Dexie/IndexedDB as the client data source and optional Supabase, Telegram, Ollama, exchange-rate, and PWA integrations.

Visual direction is **Calm Personal Ledger**: flat semantic-token surfaces, 1px borders, shared UI primitives, route-aware page widths, skeleton loading states, and tokenized dark-mode overlays/toasts/charts/dialogs.

The Next/PostCSS production audit remains intentionally deferred to a dedicated framework-upgrade batch.

## Implemented Foundation

- Authenticated App Router shell with dashboard, transactions, conversions, budgets, recurring, reports, and settings.
- First-time setup gate for starting balances, monthly TRY budget, and default payment method.
- Command-first transaction capture with multi-entry parsing, preview, batch save, balance validation, and AI category suggestions when enabled.
- Manual transaction add/edit/delete with balance reversal validation.
- Monthly TRY budgets, rollover calculation, category budgets, and budget usage display.
- Recurring transaction CRUD and app-open due/missed transaction creation.
- Reports for month, custom date range, and yearly summaries, with the existing TRY-unified report toggle kept view-local.
- Settings for balances, defaults, AI toggle, dark mode, category add/edit/delete, export/import, reset, and sync status.
- CSV/JSON export/import and simple PDF report export for monthly, date-range, and yearly reports.

## V2 Integrations

- Supabase auth and mirrored remote tables with per-user sync cursors, retry queue, delete tombstones, reset/import full-sync replacement, and manual sync-now status.
- Telegram webhook and registration routes with JSON auth failures and middleware exemptions.
- Exchange-rate API using `open.er-api.com` with a server-side cache and fallback rates.
- Local Ollama categorization route with graceful failure back to rule-based/manual category selection.
- PWA manifest, SVG app icons, metadata, and a static-asset-only service worker.

## QA Remediation Added

- Route/API smoke script: `npm.cmd run smoke:routes`.
- Vitest coverage for middleware redirect policy, public API exemptions, PWA asset exemptions, exchange-rate fallback JSON, and Telegram auth failures.
- Category editing service and UI for name, type, color, and icon.
- Category delete protection for defaults and transaction reassignment to the matching income/expense fallback category.
- Tests for category edit, delete reassignment, default-category protection, and sync side effects.
- Tests for date-range aggregation, yearly aggregation, PDF range/year content, and existing CSV/JSON regressions.
- Daily-use UI polish for clearer empty states, recent activity category labels/colors/icons, command multi-entry errors, and explicit balance failure messaging.
- Production checklist and separate dependency security upgrade plan.

## UI/UX Modifications (#1–#40)

Completed per `modifications.md` (see also `docs/Design and UIUX Audit 110626.md` for the original audit).

Highlights from the final batches in this session:

- **#32 Touch targets** — 44px minimum on row actions, mobile nav, toggles, filter pills, and command preview Revert; misleading hover removed from non-clickable rows.
- **#33 Accessible feedback** — `role="alert"` + `aria-live="polite"` on inline errors in command, transactions, conversions, setup, and recurring flows.
- **#34 Hover affordance** — hover elevation/background only on clickable elements; static cards stay flat.
- **#35 Skeleton states** — `Skeleton`, `SkeletonCard`, `SkeletonMetric`, `SkeletonListRows`, and `SkeletonListCard` on dashboard and all main workspaces while Dexie loads.
- **#36 Shared helpers** — `src/lib/download.ts`; workspaces use `Field`/`SelectField`, `StatCard`/`StatRow`, and shared `EmptyState` instead of local clones.
- **#37 Dark-mode sweep** — `--overlay` and `--shadow-overlay` tokens; tokenized `ConfirmDialog`, Sonner toasts (theme-synced), and Recharts tooltips.
- **#38 Page widths** — `AppShell` route-aware `main` max-width: dashboard/settings `max-w-2xl`, reports `max-w-7xl`, other workspaces `max-w-6xl`.
- **#39 PageHeader** — shared `PageHeader` on dashboard and all workspace routes with short one-line subtitles and optional action slots.
- **#40 Verification** — full automated ladder plus route smoke (see below).

Earlier mods (#1–#31) covered semantic tokens, UI primitives (`Button`, `Card`, `Field`, `SelectField`, `Toggle`, `ProgressBar`, etc.), workspace restyling, copy pass, focus rings, transaction form, reports category bars, setup/login tokenization, and related polish.

## Verification State

Verification ladder:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

`npm.cmd run check` runs the same ladder.

Latest verification in this working tree (2026-06-11, mods #32–#40 close-out):

- `npm.cmd run lint` — pass.
- `npm.cmd run typecheck` — pass.
- `npm.cmd run test` — 14 files, 67 tests passing.
- `npm.cmd run build` — pass (17 app routes).
- `npm.cmd run smoke:routes` — 8/8 checks passing against `next start` on port 3000 (root/login/app redirects, exchange API JSON, manifest, service worker, Telegram JSON 401s).
- `npm.cmd run check` — same ladder as above (lint → typecheck → test → build); does not include smoke.

Manual walkthrough still recommended before release:

- Light and dark mode on all screens, toasts, dialogs, and chart tooltips.
- ~390px mobile: bottom nav, filters, row actions, no horizontal overflow.
- Keyboard-only navigation and visible focus rings.
- Setup → first transaction → budget → report flow; transaction and recurring CRUD; export/import/reset.
- Throttled reload shows skeletons, not false empty states.

Authenticated workspace browser checks remain blocked until a real Supabase session is available in the browser profile. Route smoke verifies that unauthenticated `/app` correctly redirects to `/login`.

`npm.cmd audit --omit=dev` — still reports Next/PostCSS advisories that require a breaking Next 16 upgrade.

## Remaining Risks And Assumptions

- Supabase sync is still browser-local and best-effort; there is no server-side durable job queue.
- Telegram writes directly to Supabase; the app sees those changes after pull sync.
- AI categorization requires a reachable Ollama deployment and remains optional.
- PDF export is more readable and supports range/year, but still uses the current lightweight in-repo PDF flow rather than a full layout engine.
- Recurring transactions run on app open only; there is no background execution or push notification layer.
- PWA offline support is intentionally limited to static shell assets. IndexedDB remains the data source.
- `npm.cmd audit --omit=dev` still needs the dedicated Next 16 security-upgrade batch documented in `docs/DEPENDENCY_SECURITY_UPGRADE_PLAN.md`.
- Bank/institution imports, receipt/photo scanning, OCR, and attachments remain out of current scope.
