# Ravel compatibility identifiers

Ravel is the current product name. A small number of historical `TapTrack` identifiers remain intentionally because they are already persisted on devices, embedded in backups, configured in deployments, or deployed as database API names. They are compatibility contracts, not public branding.

## Do not rename without a migration plan

- IndexedDB database name: `TapTrackDB`. Keeping this name means existing browser profiles open the same local ledger after the rebrand.
- Backup V2 wire format: `taptrack-backup`. Ravel continues to read and emit the same version-2 structure so existing backups remain restorable; newly downloaded files use Ravel filenames.
- Supabase RPC/function names including `apply_taptrack_capture`, `apply_taptrack_sync_operation`, `apply_taptrack_telegram_update`, `taptrack_calculated_balance`, `taptrack_upsert_canonical_record`, `replace_taptrack_account_ledger`, and `claim_empty_taptrack_ledger`. These are deployed server contracts and historical migrations must remain immutable.
- Legacy environment variables with the `TAPTRACK_` prefix and `NEXT_PUBLIC_TAPTRACK_*` Shortcut URLs. New configuration uses `RAVEL_` / `NEXT_PUBLIC_RAVEL_*`; runtime code accepts old names as fallbacks so existing deployments do not break.
- Legacy local-storage/cache identifiers. Ravel writes new `ravel*` keys and lazily reads/migrates prior `taptrack*` values for theme, onboarding, feature tips, input mode, exchange-rate cache, sync timestamps, and service-worker cache cleanup.
- Previously issued capture keys beginning `taptrack_capture_`. New keys use `ravel_capture_`, while validation continues to accept old keys until they are revoked normally.

## Provider metadata

The public GitHub repository is now `AFR0011/Ravel` and the Vercel project is `ravel`. GitHub preserves the historical repository redirect, and the old `taptrack-fawn.vercel.app` deployment alias is retained only for backward-link continuity toward the Ravel deployment.

The production Supabase project ref must remain unchanged because URLs/credentials depend on that stable identifier. Its **display name** may be changed from TapTrack to Ravel without renaming deployed RPCs or historical migrations.

## Historical records

Old pull requests, commits, migration filenames/content, risk IDs, and explicitly historical design/blueprint material may legitimately contain TapTrack. Rewriting immutable project history adds risk and removes useful provenance without improving the running product.

## Rule

New user-facing copy, generated filenames, package identity, test fixtures, current documentation, configuration examples, and newly created identifiers must use **Ravel**. Historical identifiers should appear only in explicitly documented compatibility paths, historical records, immutable migrations, or tests that prove backward compatibility.