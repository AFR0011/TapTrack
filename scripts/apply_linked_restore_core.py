from pathlib import Path

# Device binding remembers the cloud restore generation it has adopted.
path = Path('src/types.ts')
text = path.read_text()
old = """export interface DeviceMetadata {
  id: string;
  syncOwnerUserId: string;
  linkedAt: string;
}
"""
new = """export interface DeviceMetadata {
  id: string;
  syncOwnerUserId: string;
  linkedAt: string;
  /** Cloud account restore generation adopted by this browser. */
  cloudRevision?: number;
  cloudGeneration?: string;
}
"""
if old not in text:
    raise SystemExit('DeviceMetadata block not found')
path.write_text(text.replace(old, new, 1))

# Backup service: split validation/safety preparation from local replacement.
path = Path('src/exports/backupService.ts')
text = path.read_text()
text = text.replace("type BackupSource = 'v2' | 'legacy';", "export type BackupSource = 'v2' | 'legacy';", 1)
old = """export type RestoreBackupOptions = {
  /** Called after the incoming backup and current local safety backup are ready, but before replacement starts. */
  beforeReplace?: (safetyBackup: string) => void | Promise<void>;
  /** Test seam for deterministic legacy checkpoint creation and exportedAt. */
  now?: Date;
};
"""
new = """export type RestoreBackupOptions = {
  /** Called after the incoming backup and current local safety backup are ready, but before replacement starts. */
  beforeReplace?: (safetyBackup: string) => void | Promise<void>;
  /** Test seam for deterministic legacy checkpoint creation and exportedAt. */
  now?: Date;
};

export type PreparedBackupRestore = {
  source: BackupSource;
  legacyMigrated: boolean;
  safetyBackup: string;
  restoredRecordCount: number;
  backup: TapTrackBackupV2;
};

export type ApplyPreparedRestoreOptions = {
  linkedMode?: 'reject' | 'detach-device' | 'preserve-binding';
  cloudVersion?: { revision: number; generation: string };
};
"""
if old not in text:
    raise SystemExit('RestoreBackupOptions block not found')
text = text.replace(old, new, 1)
start = text.index('export async function restoreBackupJSON(')
end = text.index('\nfunction parseAndValidateBackup(', start)
replacement = '''export function normalizeBackupJSON(
  jsonData: string,
  now = new Date()
): { source: BackupSource; backup: TapTrackBackupV2 } {
  if (new TextEncoder().encode(jsonData).byteLength > MAX_BACKUP_BYTES) {
    throw new BackupValidationError('Backup is too large to restore safely.');
  }

  const normalized = parseAndValidateBackup(jsonData, now);
  return {
    source: normalized.source,
    backup: {
      format: TAPTRACK_BACKUP_FORMAT,
      version: TAPTRACK_BACKUP_VERSION,
      exportedAt: now.toISOString(),
      ...normalized.data,
    },
  };
}

export async function prepareBackupRestoreJSON(
  jsonData: string,
  database: TapTrackDatabase = db,
  now = new Date()
): Promise<PreparedBackupRestore> {
  const normalized = normalizeBackupJSON(jsonData, now);
  const safetyBackup = await exportBackupJSON(database, now);
  return {
    source: normalized.source,
    legacyMigrated: normalized.source === 'legacy',
    safetyBackup,
    restoredRecordCount: countCanonicalRecords(normalized.backup),
    backup: normalized.backup,
  };
}

export async function applyPreparedBackupRestore(
  prepared: PreparedBackupRestore,
  database: TapTrackDatabase = db,
  options: ApplyPreparedRestoreOptions = {}
): Promise<RestoreBackupResult> {
  const linkedMode = options.linkedMode ?? 'reject';
  const binding = await database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID);
  if (binding && linkedMode === 'reject') {
    throw new Error(
      'This ledger is linked to cloud sync. Choose whether to restore the synced account or only this device.'
    );
  }
  if (linkedMode === 'preserve-binding' && !binding) {
    throw new Error('Cloud-linked restore lost its device binding before local replacement.');
  }
  if (linkedMode === 'preserve-binding' && !options.cloudVersion) {
    throw new Error('Cloud-linked restore is missing the restored ledger generation.');
  }

  const data = prepared.backup;
  await database.transaction(
    'rw',
    [
      database.transactions,
      database.balances,
      database.balanceCheckpoints,
      database.categories,
      database.monthlyBudgets,
      database.categoryBudgets,
      database.recurringTransactions,
      database.conversions,
      database.settings,
      database.syncOutbox,
      database.deviceMetadata,
    ],
    async () => {
      await Promise.all([
        database.transactions.clear(),
        database.balances.clear(),
        database.balanceCheckpoints.clear(),
        database.categories.clear(),
        database.monthlyBudgets.clear(),
        database.categoryBudgets.clear(),
        database.recurringTransactions.clear(),
        database.conversions.clear(),
        database.settings.clear(),
        database.syncOutbox.clear(),
      ]);

      if (data.transactions.length) await database.transactions.bulkPut(data.transactions);
      if (data.balanceCheckpoints.length) {
        await database.balanceCheckpoints.bulkPut(data.balanceCheckpoints);
      }
      if (data.categories.length) await database.categories.bulkPut(data.categories);
      if (data.monthlyBudgets.length) await database.monthlyBudgets.bulkPut(data.monthlyBudgets);
      if (data.categoryBudgets.length) await database.categoryBudgets.bulkPut(data.categoryBudgets);
      if (data.recurringTransactions.length) {
        await database.recurringTransactions.bulkPut(data.recurringTransactions);
      }
      if (data.conversions.length) await database.conversions.bulkPut(data.conversions);
      if (data.settings.length) await database.settings.bulkPut(data.settings);

      if (linkedMode === 'detach-device') {
        await database.deviceMetadata.delete(DEVICE_LEDGER_BINDING_ID);
      } else if (linkedMode === 'preserve-binding' && binding && options.cloudVersion) {
        await database.deviceMetadata.put({
          ...binding,
          cloudRevision: options.cloudVersion.revision,
          cloudGeneration: options.cloudVersion.generation,
        });
      }

      await rebuildDerivedBalances(database, new Date().toISOString());
    }
  );

  return {
    source: prepared.source,
    legacyMigrated: prepared.legacyMigrated,
    safetyBackup: prepared.safetyBackup,
    restoredRecordCount: prepared.restoredRecordCount,
  };
}

export async function restoreBackupJSON(
  jsonData: string,
  database: TapTrackDatabase = db,
  options: RestoreBackupOptions = {}
): Promise<RestoreBackupResult> {
  const prepared = await prepareBackupRestoreJSON(jsonData, database, options.now ?? new Date());
  await options.beforeReplace?.(prepared.safetyBackup);
  return applyPreparedBackupRestore(prepared, database, { linkedMode: 'reject' });
}
'''
text = text[:start] + replacement + text[end:]
path.write_text(text)

# New bindings are stamped with the current cloud generation.
path = Path('src/sync/syncBinding.ts')
text = path.read_text()
import_marker = "import { createSupabaseBrowserClient } from '@/lib/supabase';\n"
if import_marker not in text:
    raise SystemExit('syncBinding import marker not found')
text = text.replace(import_marker, import_marker + "import { ensureCloudLedgerVersion } from '@/sync/ledgerVersion';\n", 1)
old = """export async function requireLinkedSyncAccess(
  database: TapTrackDatabase = db
): Promise<{ client: SupabaseClient; userId: string } | null> {
  try {
    const access = await getSyncAccess(database);
    if (access.state !== 'linked' || !access.client || !access.userId) return null;
    return { client: access.client, userId: access.userId };
  } catch {
    return null;
  }
}
"""
new = """export async function requireLinkedSyncAccess(
  database: TapTrackDatabase = db
): Promise<{ client: SupabaseClient; userId: string; binding: DeviceMetadata } | null> {
  try {
    const access = await getSyncAccess(database);
    if (access.state !== 'linked' || !access.client || !access.userId || !access.binding) return null;
    return { client: access.client, userId: access.userId, binding: access.binding };
  } catch {
    return null;
  }
}
"""
if old not in text:
    raise SystemExit('requireLinkedSyncAccess block not found')
text = text.replace(old, new, 1)
marker = """  const binding: DeviceMetadata = {
    id: DEVICE_LEDGER_BINDING_ID,
    syncOwnerUserId: user.id,
    linkedAt: new Date().toISOString(),
  };
"""
repl = """  const cloudVersion = await ensureCloudLedgerVersion(client, user.id);
  const binding: DeviceMetadata = {
    id: DEVICE_LEDGER_BINDING_ID,
    syncOwnerUserId: user.id,
    linkedAt: new Date().toISOString(),
    cloudRevision: cloudVersion.revision,
    cloudGeneration: cloudVersion.generation,
  };
"""
if marker not in text:
    raise SystemExit('new binding block not found')
path.write_text(text.replace(marker, repl, 1))

# Sync writes now use the generation-checked server transport.
path = Path('src/sync/syncService.ts')
text = path.read_text()
import_marker = "import type { SyncOutboxItem } from '@/types';\n"
additions = """import type { SyncOutboxItem } from '@/types';
import {
  bindingMatchesLedgerVersion,
  ensureCloudLedgerVersion,
  type CloudLedgerVersion,
} from '@/sync/ledgerVersion';
import {
  fetchActiveCloudCanonicalSnapshot,
  replaceLocalWithRestoredCloudSnapshot,
} from '@/sync/restoreSnapshot';
"""
if import_marker not in text:
    raise SystemExit('syncService import marker not found')
text = text.replace(import_marker, additions, 1)
send_start = text.index('async function sendOutboxItem(')
send_end = text.index('\n/**\n * Attempts delivery of one already-durable operation.', send_start)
send_replacement = '''async function adoptChangedLedgerGeneration(
  access: NonNullable<Awaited<ReturnType<typeof requireLinkedSyncAccess>>>,
  database: TapTrackDatabase,
  remoteVersion?: CloudLedgerVersion
): Promise<void> {
  const version = remoteVersion ?? (await ensureCloudLedgerVersion(access.client, access.userId));
  const snapshot = await fetchActiveCloudCanonicalSnapshot(access.client, access.userId);
  await replaceLocalWithRestoredCloudSnapshot(snapshot, database);
  await database.deviceMetadata.put({
    ...access.binding,
    cloudRevision: version.revision,
    cloudGeneration: version.generation,
  });
}

async function ensurePushLedgerVersion(
  access: NonNullable<Awaited<ReturnType<typeof requireLinkedSyncAccess>>>,
  database: TapTrackDatabase
): Promise<CloudLedgerVersion | null> {
  const remote = await ensureCloudLedgerVersion(access.client, access.userId);
  const binding = access.binding;

  if (binding.cloudRevision === undefined || !binding.cloudGeneration) {
    if (remote.revision === 1) {
      await database.deviceMetadata.put({
        ...binding,
        cloudRevision: remote.revision,
        cloudGeneration: remote.generation,
      });
      return remote;
    }

    await adoptChangedLedgerGeneration(access, database, remote);
    return null;
  }

  if (!bindingMatchesLedgerVersion(binding, remote)) {
    await adoptChangedLedgerGeneration(access, database, remote);
    return null;
  }

  return remote;
}

async function sendOutboxItem(
  item: SyncOutboxItem,
  access: NonNullable<Awaited<ReturnType<typeof requireLinkedSyncAccess>>>,
  version: CloudLedgerVersion,
  database: TapTrackDatabase
): Promise<boolean> {
  if (!isCanonicalTableName(item.tableName)) {
    await acknowledgeExactOperation(item, database);
    return true;
  }

  const remoteTable = DEXIE_TO_SUPABASE[item.tableName];

  try {
    const response = await fetch('/api/sync/operation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        revision: version.revision,
        generation: version.generation,
        table: remoteTable,
        operation: item.operation,
        recordId: item.recordId,
        record:
          item.operation === 'upsert' && item.record
            ? serializeForSupabase(item.record, access.userId)
            : null,
      }),
    });

    if (response.status === 409) {
      const body = (await response.json().catch(() => null)) as
        | { revision?: number; generation?: string }
        | null;
      const remoteVersion =
        body && Number.isInteger(body.revision) && typeof body.generation === 'string'
          ? {
              revision: body.revision as number,
              generation: body.generation,
              updatedAt: new Date().toISOString(),
            }
          : undefined;
      await adoptChangedLedgerGeneration(access, database, remoteVersion);
      return false;
    }

    if (!response.ok) {
      await recordOperationFailure(item, database);
      return false;
    }

    await acknowledgeExactOperation(item, database);
    setStatusTimestamp(LAST_PUSH_PREFIX, access.userId);
    return true;
  } catch {
    await recordOperationFailure(item, database);
    return false;
  }
}
'''
text = text[:send_start] + send_replacement + text[send_end:]
old = """  try {
    const access = await requireLinkedSyncAccess(database);
    if (!access) return;
    await sendOutboxItem(item, access.client, access.userId, database);
  } catch {
    // Leave the operation durable for a later retry cycle.
  }
"""
new = """  try {
    const access = await requireLinkedSyncAccess(database);
    if (!access) return;
    const version = await ensurePushLedgerVersion(access, database);
    if (!version) return;
    if (!(await database.syncOutbox.get(item.id))) return;
    await sendOutboxItem(item, access, version, database);
  } catch {
    // Leave the operation durable for a later retry cycle.
  }
"""
if old not in text:
    raise SystemExit('deliverQueuedOperation block not found')
text = text.replace(old, new, 1)
old = """export async function processRetryQueue(database: TapTrackDatabase = db): Promise<void> {
  const access = await requireLinkedSyncAccess(database);
  if (!access) return;

  const items = await database.syncOutbox.orderBy('queuedAt').toArray();
  for (const item of items) {
    await sendOutboxItem(item, access.client, access.userId, database);
  }
}
"""
new = """export async function processRetryQueue(database: TapTrackDatabase = db): Promise<void> {
  const access = await requireLinkedSyncAccess(database);
  if (!access) return;
  const version = await ensurePushLedgerVersion(access, database);
  if (!version) return;

  const items = await database.syncOutbox.orderBy('queuedAt').toArray();
  for (const item of items) {
    const sent = await sendOutboxItem(item, access, version, database);
    if (!sent && !(await database.syncOutbox.get(item.id))) break;
  }
}
"""
if old not in text:
    raise SystemExit('processRetryQueue block not found')
text = text.replace(old, new, 1)
path.write_text(text)
