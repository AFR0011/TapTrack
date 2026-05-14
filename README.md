# TapTrack

A mobile-first personal finance tracker with fast daily capture and monthly review.

## Quick Start

1. Clone this repository
2. Copy `.env.example` to `.env.local` and fill in your values
3. Run `npm install`
4. Run `npm run dev`

## Guardrail: What This Project Is (and Isn't)

TapTrack exists to replace spreadsheet/note-based personal tracking with faster daily logging.

**Do not add these before the V1 MVP is proven useful:**

- Cloud sync (Supabase is added for optional sync, but local-first is primary)
- Telegram bot (webhook exists but manual registration required)
- AI categorization (Ollama-based, not required for core use)
- Full accounting features
- Multi-user support

**What TapTrack does:**

- Fast command entry: `-120 coffee cash`
- Income/expense tracking
- Currency support: TRY, USD, EUR
- Monthly budgeting with rollover
- Recurring transactions
- Reports and CSV/JSON export

## Project State

- **Version:** V2 (with optional cloud features)
- **Framework:** Next.js 14 App Router
- **Database:** Dexie/IndexedDB (local-first)
- **Styling:** Tailwind CSS

## Verification

```bash
npm run check    # lint, typecheck, test, build
```

## See Also

- `BLUEPRINT.md` - Original V1 scope and non-goals
- `docs/PROJECT_STATE.md` - Current implementation snapshot
- `docs/REPO_MAP.md` - File mapping and data flow
