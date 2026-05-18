'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase';
import { db, type TapTrackDatabase } from '@/database';

type DexieTableName = keyof Pick<
  TapTrackDatabase,
  | 'transactions'
  | 'balances'
  | 'categories'
  | 'monthlyBudgets'
  | 'categoryBudgets'
  | 'recurringTransactions'
  | 'conversions'
  | 'settings'
>;

const DEXIE_TO_SUPABASE: Record<DexieTableName, string> = {
  transactions: 'transactions',
  balances: 'balances',
  categories: 'categories',
  monthlyBudgets: 'monthly_budgets',
  categoryBudgets: 'category_budgets',
  recurringTransactions: 'recurring_transactions',
  conversions: 'conversions',
  settings: 'settings',
};

const SUPABASE_TO_DEXIE = Object.fromEntries(
  Object.entries(DEXIE_TO_SUPABASE).map(([dexieTable, supabaseTable]) => [supabaseTable, dexieTable])
) as Record<string, DexieTableName>;

const SYNC_TOMBSTONES_TABLE = 'sync_tombstones';
const LEGACY_LAST_SYNC_KEY = 'taptrack_last_sync_at';
const LEGACY_RETRY_QUEUE_KEY = 'taptrack_retry_queue';
const SYNC_CURSOR_PREFIX = 'taptrack_sync_cursor:';
const RETRY_QUEUE_PREFIX = 'taptrack_retry_queue:';
const MAX_RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 5000;

// Server timestamps are the sync cursor source. Local writes still keep updatedAt
// so Dexie can resolve same-row conflicts before the remote write returns.
const SYNC_TIMESTAMP_COLUMN = 'updated_at';

type RetryOperation = 'upsert' | 'delete';

interface RetryItem {
  tableName: DexieTableName;
  operation: RetryOperation;
  recordId: string;
  record?: Record<string, unknown>;
  attempts: number;
  lastAttempt: number;
}

interface LegacyRetryItem {
  tableName: DexieTableName;
  record: Record<string, unknown>;
  attempts: number;
  lastAttempt: number;
}

interface SupabaseRow extends Record<string, unknown> {
  id?: string;
  user_id?: string;
  updated_at?: string;
  deleted_at?: string;
  table_name?: string;
  record_id?: string;
}

function getRecordId(record: Record<string, unknown>): string | null {
  const recordId = record.id;
  return typeof recordId === 'string' && recordId.length > 0 ? recordId : null;
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function getUserScopedStorageKey(prefix: string, userId: string): string {
  return `${prefix}${userId}`;
}

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best-effort only. IndexedDB remains the source of truth.
  }
}

function serializeForSupabase(
  record: Record<string, unknown>,
  userId: string,
  options?: { forceUpdatedAt?: string }
): Record<string, unknown> {
  const result: Record<string, unknown> = { user_id: userId };

  for (const [k, v] of Object.entries(record)) {
    if (v === undefined) continue;
    result[toSnakeCase(k)] = v;
  }

  if (options?.forceUpdatedAt) {
    result.updated_at = options.forceUpdatedAt;
  }

  return result;
}

function deserializeFromSupabase(row: SupabaseRow): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(row)) {
    if (k === 'user_id' || k === 'deleted_at') continue;
    result[toCamelCase(k)] = v;
  }

  return result;
}

function getLocalUpdatedAt(record: Record<string, unknown> | undefined): string {
  const updatedAt = record?.updatedAt;
  if (typeof updatedAt === 'string') return updatedAt;

  const createdAt = record?.createdAt;
  if (typeof createdAt === 'string') return createdAt;

  return '1970-01-01T00:00:00.000Z';
}

function getSyncCursor(userId: string): string {
  const scoped = readStorage(getUserScopedStorageKey(SYNC_CURSOR_PREFIX, userId));
  if (scoped) return scoped;

  // One-time migration from the old global key. Keeping the old key around is
  // harmless, but new sync state must be per-user or account switching breaks.
  return readStorage(LEGACY_LAST_SYNC_KEY) ?? '1970-01-01T00:00:00.000Z';
}

function setSyncCursor(userId: string, timestamp: string): void {
  writeStorage(getUserScopedStorageKey(SYNC_CURSOR_PREFIX, userId), timestamp);
}

function getRetryQueue(userId: string): RetryItem[] {
  try {
    const scoped = readStorage(getUserScopedStorageKey(RETRY_QUEUE_PREFIX, userId));
    const legacy = readStorage(LEGACY_RETRY_QUEUE_KEY);
    const stored = scoped ?? legacy;
    if (!stored) return [];

    const parsed = JSON.parse(stored) as Array<RetryItem | LegacyRetryItem>;
    return parsed
      .map(normalizeRetryItem)
      .filter((item): item is RetryItem => item !== null);
  } catch {
    return [];
  }
}

function saveRetryQueue(userId: string, queue: RetryItem[]): void {
  writeStorage(getUserScopedStorageKey(RETRY_QUEUE_PREFIX, userId), JSON.stringify(queue));
}

function removeFromRetryQueue(
  userId: string,
  tableName: DexieTableName,
  recordId: string,
  operation: RetryOperation
): void {
  const queue = getRetryQueue(userId);
  const filtered = queue.filter(
    (item) =>
      !(
        item.tableName === tableName &&
        item.recordId === recordId &&
        item.operation === operation
      )
  );

  if (filtered.length !== queue.length) {
    saveRetryQueue(userId, filtered);
  }
}

function normalizeRetryItem(item: RetryItem | LegacyRetryItem): RetryItem | null {
  if ('operation' in item && 'recordId' in item) {
    return item.recordId ? item : null;
  }

  const recordId = getRecordId(item.record);
  if (!recordId) return null;

  return {
    tableName: item.tableName,
    operation: 'upsert',
    recordId,
    record: item.record,
    attempts: item.attempts,
    lastAttempt: item.lastAttempt,
  };
}

function queueRetry(userId: string, item: RetryItem): void {
  const queue = getRetryQueue(userId);
  const existingIndex = queue.findIndex(
    (queued) =>
      queued.tableName === item.tableName &&
      queued.recordId === item.recordId &&
      queued.operation === item.operation
  );

  if (existingIndex === -1) {
    saveRetryQueue(userId, [...queue, item]);
    return;
  }

  const existing = queue[existingIndex]!;
  queue[existingIndex] = {
    ...existing,
    attempts: Math.min(existing.attempts + 1, MAX_RETRY_ATTEMPTS),
    lastAttempt: Date.now(),
    record: item.record ?? existing.record,
  };
  saveRetryQueue(userId, queue);
}
/**
 * Pushes a single record to Supabase as a fire-and-forget background sync.
 * Local IndexedDB remains authoritative for the UI. Failed writes are queued.
 */
export async function pushRecord(
  tableName: DexieTableName,
  record: Record<string, unknown>
): Promise<void> {
  const recordId = getRecordId(record);
  if (!recordId) return;

  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const supabaseTable = DEXIE_TO_SUPABASE[tableName];
  const serialized = serializeForSupabase(record, user.id);
  const { error } = await supabase
    .from(supabaseTable)
    .upsert(serialized, { onConflict: 'user_id,id' });

  if (!error) {
    removeFromRetryQueue(user.id, tableName, recordId, 'upsert');
    return;
  }

  queueRetry(user.id, {
    tableName,
    operation: 'upsert',
    recordId,
    record,
    attempts: 0,
    lastAttempt: Date.now(),
  });
}

/**
 * Deletes remotely and writes a tombstone so other devices can delete locally.
 * Without tombstones, a hard delete in Supabase is invisible during pull sync.
 */
export async function deleteRecord(
  tableName: DexieTableName,
  recordId: string
): Promise<void> {
  if (!recordId) return;

  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const success = await pushDeleteToSupabase(tableName, recordId, user.id, supabase);

  if (success) {
    removeFromRetryQueue(user.id, tableName, recordId, 'delete');
    return;
  }

  queueRetry(user.id, {
    tableName,
    operation: 'delete',
    recordId,
    attempts: 0,
    lastAttempt: Date.now(),
  });
}

/**
 * Replaces the remote snapshot with the current local snapshot.
 * Used after import/reset. Rows removed locally also get tombstoned so other
 * devices remove records that no longer exist locally.
 */
export async function syncAllLocalData(database: TapTrackDatabase = db): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const snapshotTime = new Date().toISOString();

  for (const [dexieTable, supabaseTable] of Object.entries(DEXIE_TO_SUPABASE) as [
    DexieTableName,
    string,
  ][]) {
    const { data: remoteRows, error: readError } = await supabase
      .from(supabaseTable)
      .select('id')
      .eq('user_id', user.id);

    if (readError) {
      throw new Error(`Failed to read ${supabaseTable}: ${readError.message}`);
    }

    const rows = await getDexieTableRows(database, dexieTable);
    const localIds = new Set(
      rows.map((row) => getRecordId(row)).filter((id): id is string => typeof id === 'string')
    );
    const removedIds = ((remoteRows ?? []) as Array<{ id?: unknown }>)
      .map((row: { id?: unknown }) => row.id)
      .filter((id: unknown): id is string => typeof id === 'string' && !localIds.has(id));

    if (removedIds.length > 0) {
      await writeTombstones(supabase, supabaseTable, removedIds, user.id, snapshotTime);
    }

    const { error: deleteError } = await supabase.from(supabaseTable).delete().eq('user_id', user.id);
    if (deleteError) {
      throw new Error(`Failed to clear ${supabaseTable}: ${deleteError.message}`);
    }

    if (rows.length === 0) continue;

    const serializedRows = rows.map((row) =>
      serializeForSupabase(row, user.id, { forceUpdatedAt: snapshotTime })
    );
    const { error: upsertError } = await supabase
      .from(supabaseTable)
      .upsert(serializedRows, { onConflict: 'user_id,id' });

    if (upsertError) {
      throw new Error(`Failed to sync ${supabaseTable}: ${upsertError.message}`);
    }
  }

  setSyncCursor(user.id, snapshotTime);
  saveRetryQueue(user.id, []);
}

/**
 * Runs the full opportunistic sync cycle: failed local writes first, then remote
 * updates/deletes. Call this on app open, online, visibility change, and after
 * account-sensitive operations.
 */
export async function syncNow(database: TapTrackDatabase = db): Promise<void> {
  await processRetryQueue();
  await pullUpdates(database);
}

/**
 * Processes the retry queue. Called on app open, when network returns, and from
 * syncNow().
 */
export async function processRetryQueue(): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const queue = getRetryQueue(user.id);
  const now = Date.now();

  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i];
    if (now - item.lastAttempt < RETRY_DELAY_MS || item.attempts >= MAX_RETRY_ATTEMPTS) {
      continue;
    }

    const success = await retryQueueItem(item, user.id, supabase);

    if (success) {
      queue.splice(i, 1);
    } else {
      queue[i] = {
        ...item,
        attempts: item.attempts + 1,
        lastAttempt: now,
      };
    }
  }

  saveRetryQueue(user.id, queue);
}

/**
 * Pulls rows and tombstones newer than the per-user sync cursor and merges them
 * into Dexie. Remote rows only overwrite local rows when they are newer.
 */
export async function pullUpdates(database: TapTrackDatabase = db): Promise<void> {
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const lastSyncAt = getSyncCursor(user.id);
    let allTablesSuccess = true;
    let latestSeenTimestamp = lastSyncAt;

    const tablesToSync = Object.entries(DEXIE_TO_SUPABASE) as [DexieTableName, string][];

    for (const [dexieTable, supabaseTable] of tablesToSync) {
      const { data, error } = await supabase
        .from(supabaseTable)
        .select('*')
        .eq('user_id', user.id)
        .gt(SYNC_TIMESTAMP_COLUMN, lastSyncAt)
        .order(SYNC_TIMESTAMP_COLUMN, { ascending: true });

      if (error) {
        allTablesSuccess = false;
        continue;
      }

      const rows = (data ?? []) as SupabaseRow[];
      for (const row of rows) {
        const rowTimestamp = row.updated_at;
        if (typeof rowTimestamp === 'string' && rowTimestamp > latestSeenTimestamp) {
          latestSeenTimestamp = rowTimestamp;
        }

        const record = deserializeFromSupabase(row);
        const recordId = getRecordId(record);
        if (!recordId || typeof rowTimestamp !== 'string') continue;

        try {
          const table = database[dexieTable] as unknown as {
            get: (id: string) => Promise<Record<string, unknown> | undefined>;
            put: (record: Record<string, unknown>) => Promise<unknown>;
          };

          const localRecord = await table.get(recordId);
          if (localRecord && getLocalUpdatedAt(localRecord) > rowTimestamp) {
            continue;
          }

          await table.put(record);
        } catch {
          allTablesSuccess = false;
        }
      }
    }

    const { data: tombstones, error: tombstoneError } = await supabase
      .from(SYNC_TOMBSTONES_TABLE)
      .select('table_name, record_id, deleted_at')
      .eq('user_id', user.id)
      .gt('deleted_at', lastSyncAt)
      .order('deleted_at', { ascending: true });

    if (tombstoneError) {
      allTablesSuccess = false;
    } else {
      for (const tombstone of (tombstones ?? []) as SupabaseRow[]) {
        const supabaseTable = tombstone.table_name;
        const recordId = tombstone.record_id;
        const deletedAt = tombstone.deleted_at;
        if (
          typeof supabaseTable !== 'string' ||
          typeof recordId !== 'string' ||
          typeof deletedAt !== 'string'
        ) {
          continue;
        }

        if (deletedAt > latestSeenTimestamp) {
          latestSeenTimestamp = deletedAt;
        }

        const dexieTable = SUPABASE_TO_DEXIE[supabaseTable];
        if (!dexieTable) continue;

        try {
          const table = database[dexieTable] as unknown as {
            get: (id: string) => Promise<Record<string, unknown> | undefined>;
            delete: (id: string) => Promise<unknown>;
          };

          const localRecord = await table.get(recordId);
          if (localRecord && getLocalUpdatedAt(localRecord) > deletedAt) {
            continue;
          }

          await table.delete(recordId);
        } catch {
          allTablesSuccess = false;
        }
      }
    }

    if (allTablesSuccess && latestSeenTimestamp > lastSyncAt) {
      setSyncCursor(user.id, latestSeenTimestamp);
    }
  } catch {
    // Best-effort. Never break the local-first app because cloud sync stumbled.
  }
}

async function getDexieTableRows(
  database: TapTrackDatabase,
  tableName: DexieTableName
): Promise<Record<string, unknown>[]> {
  return (database[tableName] as unknown as {
    toArray: () => Promise<Record<string, unknown>[]>;
  }).toArray();
}

async function pushDeleteToSupabase(
  tableName: DexieTableName,
  recordId: string,
  userId: string,
  supabase: ReturnType<typeof createSupabaseBrowserClient>
): Promise<boolean> {
  const supabaseTable = DEXIE_TO_SUPABASE[tableName];
  const deletedAt = new Date().toISOString();

  const { error: deleteError } = await supabase
    .from(supabaseTable)
    .delete()
    .eq('user_id', userId)
    .eq('id', recordId);

  if (deleteError) return false;

  const { error: tombstoneError } = await supabase.from(SYNC_TOMBSTONES_TABLE).upsert(
    {
      user_id: userId,
      table_name: supabaseTable,
      record_id: recordId,
      deleted_at: deletedAt,
    },
    { onConflict: 'user_id,table_name,record_id' }
  );

  return !tombstoneError;
}

async function writeTombstones(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  supabaseTable: string,
  recordIds: string[],
  userId: string,
  deletedAt: string
): Promise<void> {
  if (recordIds.length === 0) return;

  const tombstones = recordIds.map((recordId) => ({
    user_id: userId,
    table_name: supabaseTable,
    record_id: recordId,
    deleted_at: deletedAt,
  }));

  const { error } = await supabase
    .from(SYNC_TOMBSTONES_TABLE)
    .upsert(tombstones, { onConflict: 'user_id,table_name,record_id' });

  if (error) {
    throw new Error(`Failed to write delete tombstones for ${supabaseTable}: ${error.message}`);
  }
}

async function retryQueueItem(
  item: RetryItem,
  userId: string,
  supabase: ReturnType<typeof createSupabaseBrowserClient>
): Promise<boolean> {
  if (item.operation === 'delete') {
    return pushDeleteToSupabase(item.tableName, item.recordId, userId, supabase);
  }

  if (!item.record) return false;

  const supabaseTable = DEXIE_TO_SUPABASE[item.tableName];
  const serialized = serializeForSupabase(item.record, userId);
  const { error } = await supabase
    .from(supabaseTable)
    .upsert(serialized, { onConflict: 'user_id,id' });
  return !error;
}
