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

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function serializeForSupabase(
  record: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
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
 */
export async function pushRecord(
  tableName: DexieTableName,
  record: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const supabaseTable = DEXIE_TO_SUPABASE[tableName];
    const serialized = serializeForSupabase(record, user.id);
    await supabase.from(supabaseTable).upsert(serialized, { onConflict: 'id' });
  } catch {
    // Best-effort; never propagate errors to the caller
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

    for (const [dexieTable, supabaseTable] of Object.entries(DEXIE_TO_SUPABASE) as [
      DexieTableName,
      string,
    ][]) {
      // conversions has no updated_at, so use created_at
      const timestampCol = dexieTable === 'conversions' ? 'created_at' : 'updated_at';

      const { data, error } = await supabase
        .from(supabaseTable)
        .select('*')
        .gt(timestampCol, lastSyncAt);

      if (error || !data || data.length === 0) continue;

      const table = db[dexieTable];
      for (const row of data) {
        const record = deserializeFromSupabase(row as Record<string, unknown>);
        // biome-ignore lint: dynamic table access needed for generic sync
        // rome-ignore lint: dynamic table access
        await (table as unknown as { put: (r: unknown) => Promise<unknown> }).put(record);
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    }
  } catch {
    // Best-effort
  }
}
