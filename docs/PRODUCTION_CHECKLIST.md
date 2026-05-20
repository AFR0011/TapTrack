# TapTrack Production Checklist

Last updated: 2026-05-20

## Core App

- Run `npm.cmd run check` before deployment.
- Confirm `/`, `/login`, `/app`, `/api/exchange-rates`, `/api/telegram/webhook`, `/api/telegram/register`, `/manifest.webmanifest`, and `/sw.js` with `npm.cmd run smoke:routes` against the deployed URL.
- Confirm PWA metadata loads publicly: `/manifest.webmanifest`, `/sw.js`, and `/icons/taptrack-icon.svg` must not require auth.

## Supabase

- Set `NEXT_PUBLIC_SUPABASE_URL`.
- Set `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Apply the Supabase schema and RLS policies for all mirrored Dexie tables.
- Confirm the signed-in owner account exists before enabling Telegram writes.
- Confirm the app can pull remote changes on open and push local changes after manual edits.

## Telegram

- Set `TELEGRAM_BOT_TOKEN`.
- Set `TELEGRAM_WEBHOOK_SECRET`.
- Set `TAPTRACK_OWNER_USER_ID` to the Supabase `auth.users.id` for the owner account.
- Optional: set `TAPTRACK_OWNER_TELEGRAM_CHAT_ID` to restrict bot usage to one Telegram chat.
- Register the webhook once after the deployment URL is stable:

```powershell
curl.exe -H "X-Admin-Secret: <TELEGRAM_WEBHOOK_SECRET>" https://<deployment-host>/api/telegram/register
```

- Verify invalid webhook requests return JSON `401`, not login HTML.

## Ollama AI Categorization

- Deploy an Ollama-capable host or VPS.
- Pull a small model such as `qwen2.5:1.5b` or `llama3.2:1b`.
- Set `OLLAMA_BASE_URL`.
- Set `OLLAMA_MODEL`.
- Keep AI optional: failed categorization must not block preview or local transaction save.

## Operations

- Use Settings -> Sync status for last pull, last push, retry queue count, online/offline state, and manual sync.
- Export JSON before destructive reset or import tests on production data.
- Keep bank/institution imports, receipt scanning, OCR, and attachments out of current scope.
