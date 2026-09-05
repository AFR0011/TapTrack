# Architecture

TapTrack is a Next.js 16 App Router PWA. React client components read and write a browser-profile
local Dexie database; this local database is the product's source of truth. Supabase authentication
and synchronization are optional integration capabilities and must never gate local routes or local
finance operations.

## Runtime boundaries

- `app/` owns routes, layouts, providers, and server endpoints.
- `src/components/` owns client workspaces and application navigation.
- `src/database.ts` owns the IndexedDB schema and additive migrations.
- Domain folders under `src/` own local finance behavior.
- `src/sync/` owns the only permitted boundary between local finance records and Supabase.
- `public/sw.js` owns the offline application-shell cache; finance data remains in IndexedDB.
- `proxy.ts` may refresh an optional valid session but may not require authentication for local use.

## Data ownership

The V1 ledger belongs to the browser profile, not to the signed-in account. Anyone with access to
that browser profile can access its unencrypted local data. Cloud synchronization is allowed only
after an explicit immutable binding between this device ledger and one Supabase user ID. A missing
binding or account mismatch must fail closed before any remote finance operation.

## Protected boundaries

Migrations must preserve existing IndexedDB records. Import/reset must remain local until an atomic
remote replacement design is separately approved. Telegram endpoints must fail closed when owner
configuration is incomplete. Live provider schema, RLS, and production data are outside TT-B001.
