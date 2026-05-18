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

const LAST_SYNC_KEY = 'taptrack_last_sync_at';
const RETRY_QUEUE_KEY = 'taptrack_retry_queue';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

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

function serializeForSupabase(record: Record<string, unknown>, userId: string): Record<string, unknown> {
  const result: Record<string, unknown> = { user_id: userId };
  for (const [k, v] of Object.entries(record)) {
    result[toSnakeCase(k)] = v;
  }
  return result;
}

function deserializeFromSupabase(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k !== 'user_id') {
      result[toCamelCase(k)] = v;
    }
  }
  return result;
}

/**
 * Pushes a single record to Supabase as a fire-and-forget background sync.
 * Local IndexedDB is always authoritative; this never blocks the caller.
 * If push fails, the record is added to a retry queue.
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
  const { error } = await supabase.from(supabaseTable).upsert(serialized, { onConflict: 'id' });

  if (!error) {
    removeFromRetryQueue(tableName, recordId, 'upsert');
    return;
  }

  queueRetry({
    tableName,
    operation: 'upsert',
    recordId,
    record,
    attempts: 0,
    lastAttempt: Date.now(),
  });
}

/**
 * Pushes a hard delete to Supabase. If delete fails, it is queued for retry.
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

  const supabaseTable = DEXIE_TO_SUPABASE[tableName];
  const { error } = await supabase
    .from(supabaseTable)
    .delete()
    .eq('id', recordId)
    .eq('user_id', user.id);

  if (!error) {
    removeFromRetryQueue(tableName, recordId, 'delete');
    return;
  }

  queueRetry({
    tableName,
    operation: 'delete',
    recordId,
    attempts: 0,
    lastAttempt: Date.now(),
  });
}

/**
 * Replaces remote tables with the current local snapshot.
 * Used by destructive local operations such as reset/import.
 */
export async function syncAllLocalData(database: TapTrackDatabase = db): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  for (const [dexieTable, supabaseTable] of Object.entries(DEXIE_TO_SUPABASE) as [
    DexieTableName,
    string,
  ][]) {
    const { error: deleteError } = await supabase.from(supabaseTable).delete().eq('user_id', user.id);
    if (deleteError) {
      throw new Error(`Failed to clear ${supabaseTable}: ${deleteError.message}`);
    }

    // biome-ignore lint: dynamic table access needed for generic sync
    // rome-ignore lint: dynamic table access
    const rows = await (database[dexieTable] as unknown as {
      toArray: () => Promise<Record<string, unknown>[]>;
    }).toArray();

    if (rows.length === 0) continue;

    const serializedRows = rows.map((row) => serializeForSupabase(row, user.id));
    const { error: upsertError } = await supabase
      .from(supabaseTable)
      .upsert(serializedRows, { onConflict: 'id' });

    if (upsertError) {
      throw new Error(`Failed to sync ${supabaseTable}: ${upsertError.message}`);
    }
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    saveRetryQueue([]);
  }
}

/**
 * Processes the retry queue - attempts to push failed records.
 * Called on app open and when network status changes.
 */
export async function processRetryQueue(): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const queue = getRetryQueue();
  const now = Date.now();

  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i];
    // Only retry if enough time passed and attempts are under the cap.
    if (now - item.lastAttempt < RETRY_DELAY_MS || item.attempts >= MAX_RETRY_ATTEMPTS) {
      continue;
    }

    const supabaseTable = DEXIE_TO_SUPABASE[item.tableName];
    const success = await retryQueueItem(item, supabaseTable, user.id, supabase);

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

  saveRetryQueue(queue);
}

function getRetryQueue(): RetryItem[] {
  try {
    const stored = localStorage.getItem(RETRY_QUEUE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Array<RetryItem | LegacyRetryItem>;
    return parsed
      .map(normalizeRetryItem)
      .filter((item): item is RetryItem => item !== null);
  } catch {
    return [];
  }
}

function saveRetryQueue(queue: RetryItem[]): void {
  try {
    localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Silent fail - queue is best-effort
  }
}

function removeFromRetryQueue(
  tableName: DexieTableName,
  recordId: string,
  operation: RetryOperation
): void {
  try {
    const queue = getRetryQueue();
    const filtered = queue.filter(
      (item) =>
        !(
          item.tableName === tableName &&
          item.recordId === recordId &&
          item.operation === operation
        )
    );
    if (filtered.length !== queue.length) {
      saveRetryQueue(filtered);
    }
  } catch {
    // Silent fail
  }
}

/**
 * Pulls records updated since the last sync from Supabase and merges
 * them into local IndexedDB. Called on app open to pick up Telegram bot
 * transactions and changes made on other devices.
 */
export async function pullUpdates(): Promise<void> {
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const lastSyncAt =
      (typeof window !== 'undefined' && localStorage.getItem(LAST_SYNC_KEY)) ||
      '1970-01-01T00:00:00.000Z';

    let allTablesSuccess = true;
    let latestSyncedTimestamp = lastSyncAt;
    const tablesToSync = Object.entries(DEXIE_TO_SUPABASE) as [DexieTableName, string][];

    for (const [dexieTable, supabaseTable] of tablesToSync) {
      // conversions has no updated_at, so use created_at
      const timestampCol = dexieTable === 'conversions' ? 'created_at' : 'updated_at';

      const { data, error } = await supabase
        .from(supabaseTable)
        .select('*')
        .gt(timestampCol, lastSyncAt);

      if (error) {
        allTablesSuccess = false;
        continue;
      }
      if (!data || data.length === 0) continue;

      const table = db[dexieTable];
      try {
        for (const row of data) {
          const record = deserializeFromSupabase(row as Record<string, unknown>);
          const rowTimestamp = row[timestampCol];
          if (typeof rowTimestamp === 'string' && rowTimestamp > latestSyncedTimestamp) {
            latestSyncedTimestamp = rowTimestamp;
          }
          // biome-ignore lint: dynamic table access needed for generic sync
          // rome-ignore lint: dynamic table access
          await (table as unknown as { put: (r: unknown) => Promise<unknown> }).put(record);
        }
      } catch {
        allTablesSuccess = false;
        // Continue syncing other tables even if one fails
      }
    }

    // Only advance sync timestamp if all tables synced successfully
    if (allTablesSuccess && typeof window !== 'undefined') {
      localStorage.setItem(
        LAST_SYNC_KEY,
        latestSyncedTimestamp > lastSyncAt ? latestSyncedTimestamp : new Date().toISOString()
      );
    }
  } catch {
    // Best-effort - do not advance sync timestamp on error
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

function queueRetry(item: RetryItem): void {
  const queue = getRetryQueue();
  const existingIndex = queue.findIndex(
    (queued) =>
      queued.tableName === item.tableName &&
      queued.recordId === item.recordId &&
      queued.operation === item.operation
  );

  if (existingIndex === -1) {
    saveRetryQueue([...queue, item]);
    return;
  }

  const existing = queue[existingIndex]!;
  if (Date.now() - existing.lastAttempt < RETRY_DELAY_MS) return;

  queue[existingIndex] = {
    ...existing,
    attempts: Math.min(existing.attempts + 1, MAX_RETRY_ATTEMPTS),
    lastAttempt: Date.now(),
    record: item.record ?? existing.record,
  };
  saveRetryQueue(queue);
}

async function retryQueueItem(
  item: RetryItem,
  supabaseTable: string,
  userId: string,
  supabase: ReturnType<typeof createSupabaseBrowserClient>
): Promise<boolean> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from(supabaseTable)
      .delete()
      .eq('id', item.recordId)
      .eq('user_id', userId);
    return !error;
  }

  if (!item.record) return false;

  const serialized = serializeForSupabase(item.record, userId);
  const { error } = await supabase.from(supabaseTable).upsert(serialized, { onConflict: 'id' });
  return !error;
}
