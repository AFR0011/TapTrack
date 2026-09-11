# Ravel

**Your money doesn’t live in one place. Your ledger can.**

Ravel is a local-first personal finance ledger for people whose money is split across cash, cards, currencies, devices, and places. It is designed around fast capture, accurate ledger semantics, offline use, and user-controlled data rather than mandatory bank integrations or cloud dependence.

> **Product status:** Ravel is the current public product and repository name. Historical TapTrack identifiers remain only where compatibility requires them; see [`docs/RAVEL_COMPATIBILITY.md`](docs/RAVEL_COMPATIBILITY.md).

[Open the live app](https://ravel-ali-farrokhnejads-projects.vercel.app) · [Read the architecture notes](docs/ARCHITECTURE.md) · [Security notes](SECURITY.md)

## Why Ravel exists

Most finance apps assume money lives neatly in one bank account and one currency. Real life is often less cooperative.

Ravel is built for people who may have:

- cash and cards at the same time;
- balances in several currencies;
- transfers and currency exchanges that must not be mistaken for spending;
- expenses captured from different devices and interfaces;
- unreliable connectivity or no useful bank integration;
- a preference to keep the primary ledger on their own device.

The goal is simple: **record something in seconds, then keep one dependable picture of what happened.**

Ravel is **not a banking service** and does not move, custody, or hold funds. It is a personal ledger for recording and understanding financial activity.

## Product principles

### One ledger, not one bank

Cash, cards, currencies, transfers, exchanges, reconciliations, income, and expenses belong in one coherent record. Unlike currencies are kept distinct rather than collapsed into a misleading single balance.

### Local first

IndexedDB is the ordinary working store. Core capture and ledger use do not require an account or network connection. Optional Supabase sync can connect devices without turning the cloud into the only copy of the data.

### Fast capture

Ravel supports Quick Add, keyboard-first command entry, recurring transactions, PWA shortcuts, and optional iPhone Shortcut capture. Common transactions should take seconds rather than become a small administrative ceremony.

### Automation assists; the user decides

Smart Categories can suggest existing categories and help organize transactions, but manual choices remain authoritative. AI does not block saving a transaction, and late suggestions are guarded against overwriting subsequent edits.

### Ledger semantics matter

Moving money is not spending money. Reconciliation corrections are not income. Currency exchange is not a purchase. Ravel keeps these events explicit so reports and balances describe what actually happened.

## What is implemented

- Multi-currency cash and card balances
- Income and expense tracking
- Quick Add and command-style transaction capture
- Transfers and currency exchanges
- Balance reconciliation and checkpoint history
- Recurring transactions
- Budgets and reports
- Historical exchange-rate support
- Custom categories
- Optional Groq-powered Smart Categories
- Offline-capable PWA behavior
- JSON backup / restore and CSV export
- Optional account sync through Supabase
- iPhone Shortcut / capture-token workflow
- Telegram capture integration
- Responsive desktop and mobile layouts
- Light and dark themes

## Product architecture

Ravel deliberately separates the **local ledger**, **optional sync**, and **assistive services**.

```text
User interfaces
  ├─ Quick Add / command entry
  ├─ Dashboard / transactions / balances
  ├─ Transfers / recurring / budgets / reports
  └─ Settings / backup / sync
          │
          ▼
Canonical local ledger
  ├─ transactions
  ├─ balance checkpoints
  ├─ currencies / categories / settings
  └─ recurring and reconciliation state
          │
          ├──────── optional sync ────────► Supabase
          │
          ├──────── optional AI ─────────► Groq
          │
          └──────── optional capture ────► Shortcuts / Telegram
```

The local ledger remains the normal application boundary. Network services add capabilities; they are not allowed to redefine core finance semantics.

For the detailed boundary map, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/REPO_MAP.md`](docs/REPO_MAP.md), and [`SECURITY.md`](SECURITY.md).

## Engineering decisions worth noting

### Offline mutation safety

User-facing finance mutations are designed to work from the local ledger first. The service worker and browser-verification suite protect the offline path rather than treating offline support as a decorative PWA badge.

### Sync adoption is explicit

When a device and a synced account both contain data, Ravel does not silently choose a winner. The user can merge both ledgers or explicitly replace local data with the synced account copy. Destructive replacement paths create safety backups first.

### Multi-currency reporting avoids false precision

Ravel does not simply add TRY, USD, EUR, or other currencies into one meaningless total. Historical conversion is handled explicitly where a comparable reporting currency is needed.

### AI categorization is non-blocking

Live suggestions are opportunistic. Saving a transaction never waits for the model. If a suggestion arrives after save, it may update only the just-created transaction and only while the transaction remains unchanged. Manual category choices win.

### Transfers and exchanges are first-class ledger events

Transfers, exchanges, and reconciliation adjustments are represented separately from ordinary income and spending so derived balances and reports remain interpretable.

## Visual identity

Ravel uses an editorial-ledger visual system rather than conventional blue-fintech styling:

- **Bone** for the paper-like base
- **Espresso** for structure and high-contrast surfaces
- **Olive** for the primary operational accent
- **Copper** for warmth and emphasis
- **Plum** for secondary distinction
- **Newsreader** for editorial display typography
- **Inter** for dense application UI

The layered Ravel mark represents fragmented financial parts resolving into one record.

## Tech stack

- **Framework:** Next.js / React / TypeScript
- **Styling:** Tailwind CSS
- **Local database:** IndexedDB via Dexie
- **Server / account sync:** Supabase + Supabase Auth
- **AI categorization:** Groq API
- **Testing:** Vitest + Playwright
- **Deployment:** Vercel
- **PWA:** web manifest + service worker

## Local development

Requirements:

- Node.js 20+
- npm

```bash
git clone https://github.com/AFR0011/Ravel.git
cd Ravel
npm ci
npm run dev
```

Then open `http://localhost:3000`.

### Optional environment variables

The app can run locally without the optional cloud/AI integrations. Copy `.env.example` when configuring them.

Important groups include:

- Supabase public/server credentials for Supabase Auth and account sync
- Groq credentials for Smart Categories
- Telegram integration secrets
- optional iPhone Shortcut template URLs

New configuration uses the `RAVEL_` prefix. Existing deployments using historical `TAPTRACK_` environment names remain supported as fallbacks. Persisted storage/database and deployed Supabase RPC identifiers may also retain historical names internally so the rebrand never strands existing data.

## Verification

The main branch is protected by a CI ladder covering:

- publication guard
- dependency audits
- lint
- TypeScript type checking
- unit/integration tests
- production build
- route smoke tests
- Chromium mobile/offline verification

At the Ravel branding checkpoint merged on **11 September 2026**, the exact main build passed **267 tests** plus the browser/offline verification suite.

## Data and privacy model

Ravel is local-first, not “local-only.” Core ledger data starts on the device. Optional features can send narrowly scoped information to external services:

- **Supabase / Supabase Auth** when account sync or authentication is used;
- **Groq** when Smart Categories are enabled;
- **Telegram / capture endpoints** when those capture methods are configured.

The product is designed so these integrations are explicit additions rather than prerequisites for ordinary ledger use.

## Project documentation

The repository intentionally keeps deeper engineering records separate from this product-facing README:

- [`BLUEPRINT.md`](BLUEPRINT.md) — product and architecture blueprint
- [`SECURITY.md`](SECURITY.md) — security model and review notes
- [`RISK_REGISTER.md`](RISK_REGISTER.md) — known risks and mitigations
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture summary
- [`docs/AI_CATEGORIZATION_BEHAVIOR.md`](docs/AI_CATEGORIZATION_BEHAVIOR.md) — Smart Categories behavior
- [`docs/TEST_STRATEGY.md`](docs/TEST_STRATEGY.md) — testing strategy
- [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) — deployment checks

## License

MIT. See [`LICENSE`](LICENSE).
