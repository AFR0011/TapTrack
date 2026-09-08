from pathlib import Path

# Remove now-unused direct Supabase type import.
path = Path('src/sync/syncService.ts')
text = path.read_text()
text = text.replace("import type { SupabaseClient } from '@supabase/supabase-js';\n", '', 1)
path.write_text(text)

# Existing sync tests now need the binding returned by requireLinkedSyncAccess.
for filename in ['src/sync/syncService.test.ts', 'src/sync/multiDeviceSync.test.ts']:
    path = Path(filename)
    text = path.read_text()
    old = """    client: client as never,
    userId: 'user-1',
  });
"""
    new = """    client: client as never,
    userId: 'user-1',
    binding: {
      id: 'ledger-binding',
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-05-18T00:00:00.000Z',
      cloudRevision: 1,
      cloudGeneration: '123e4567-e89b-42d3-a456-426614174000',
    },
  });
"""
    if old not in text:
        raise SystemExit(f'authorize block not found in {filename}')
    path.write_text(text.replace(old, new, 1))

# Older conversions may omit updatedAt; remote schema requires it. Preserve a
# meaningful legacy timestamp by falling back to created_at.
path = Path('supabase/migrations/20260908_ledger_restore_generation.sql')
text = path.read_text()
old = "        nullif(record->>'updated_at', '')::timestamptz,\n        nullif(record->>'occurred_at', '')::timestamptz,\n"
new = "        coalesce(nullif(record->>'updated_at', '')::timestamptz, (record->>'created_at')::timestamptz),\n        nullif(record->>'occurred_at', '')::timestamptz,\n"
if old not in text:
    raise SystemExit('conversion updated_at block not found')
path.write_text(text.replace(old, new, 1))
