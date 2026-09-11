# Version Log

Workflow schema: `agentic-workflow/v2`
Project: Ravel
Repository profile: software
Initialized: 2026-09-05

## 2026-09-05 - Governance bootstrap

- Added profile-aware workflow documentation pack.
- No product/source/data/result artifacts intentionally modified.
- Reconciled governance with Next.js 16, `proxy.ts`, current dependency advisories, the strict history-cleanup result, and the owner-required offline/mobile gate.

## 2026-09-05 - TT-B001 offline/mobile local core

- Made all seven local finance routes usable without authentication or provider configuration.
- Added additive Dexie v3 device metadata and immutable opt-in account binding for sync.
- Centralized fail-closed remote-finance authorization and disabled destructive snapshot replacement.
- Made Telegram configuration and owner checks mandatory before downstream work.
- Added versioned offline route caching, complete mobile navigation, and 320/390 Playwright gates.
- Cleared the locked dependency advisories; independent retest verdict `PASS_WITH_RISKS`.
- Presentation, merge/release, and live cloud/native claims remain blocked by residual risks.
