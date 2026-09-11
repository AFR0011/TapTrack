# Ravel Production Checklist

Last updated: 2026-09-11

## Release gate

- Use Node.js 22.x, matching `package.json` and Ravel CI.
- Run the complete CI ladder: publication/branding guard, dependency audits, lint, typecheck, Vitest, production build, route smoke, and Chromium E2E.
- Verify the exact release SHA has a READY Vercel production deployment.
- Check Vercel production runtime errors after promotion.
- Use `https://ravel-fawn.vercel.app` as the current public production URL; keep historical aliases only for compatibility/redirect continuity.

## Core app / PWA

- Confirm `/`, `/login`, `/app`, `/api/exchange-rates`, `/api/telegram/webhook`, `/api/telegram/register`, `/manifest.webmanifest`, and `/sw.js` through `npm run smoke:routes`.
- Confirm `/manifest.webmanifest`, `/sw.js`, `/icons/ravel-icon.svg`, and `/icons/ravel-maskable.svg` are public.
- Confirm the landing page, login, app shell, offline fallback, manifest, and generated exports use Ravel branding.
- Confirm `ravel-fawn.vercel.app` is indexable and does not carry an unintended `X-Robots-Tag: noindex` response header.

## Supabase Auth and sync

- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Confirm production schema/migrations and RLS/protected-write boundaries are applied.
- Confirm `claim_empty_taptrack_ledger` remains service-role-only and that concurrent first-device claims fail safely.
- Verify signed-in sync, explicit adoption, account-wide replacement, device disconnect/relink, and generation handling with synthetic/disposable data after material sync changes.
- Enable Supabase leaked-password protection when available for the deployed plan; the production advisor currently reports it disabled.

## Smart Categories

- Set `GROQ_API_KEY` server-side.
- Set `GROQ_MODEL` only when overriding the documented default.
- Verify a real authenticated production categorization request after provider/model changes.
- Confirm saving a transaction remains independent of AI latency and that manual category choices remain authoritative.
- Never expose Groq credentials through `NEXT_PUBLIC_*` variables.

## Telegram and external capture

- Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`.
- Set `RAVEL_OWNER_USER_ID` to the intended Supabase user.
- Set `RAVEL_OWNER_TELEGRAM_CHAT_ID` when restricting the bot to one private owner chat.
- Set `RAVEL_TIME_ZONE` to the intended IANA timezone.
- Register the webhook after the canonical deployment URL/configuration is stable.
- Verify invalid/unconfigured webhook requests fail closed with JSON rather than login HTML.
- New capture tokens must use `ravel_capture_`; previously issued `taptrack_capture_` tokens remain accepted until revoked.

## Backups and destructive operations

- Export a JSON safety backup before destructive production-data tests.
- Verify device-only restore/reset remains local and detaches sync as designed.
- Verify account-wide restore/reset rotates ledger generation and stale clients adopt replacement state.
- Keep the backup V2 wire-format identifier stable for compatibility even though downloaded filenames use Ravel.

## Provider metadata and governance

- GitHub repository: `AFR0011/Ravel`.
- Vercel project: `ravel`.
- Supabase project display name should be Ravel; changing the display name must not change the project ref or compatibility RPC names.
- GitHub `main` should be protected by a ruleset requiring PRs + Ravel CI and blocking force-push/deletion. Issue #14 tracks this until enabled.

## Residual checks before strong public claims

- Do not claim native Safari/iOS installed-PWA lifecycle reliability until tested on a real device.
- Do not claim application-level encryption of IndexedDB.
- Do not claim exact decimal/minor-unit money storage while JavaScript `number` remains the representation.
- Do not claim exhaustive Git-history secret cleanliness until an all-object/reflog scan is performed.