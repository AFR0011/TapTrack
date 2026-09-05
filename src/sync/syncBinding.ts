'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { db, type TapTrackDatabase } from '@/database';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import type { DeviceMetadata } from '@/types';

export const DEVICE_LEDGER_BINDING_ID = 'ledger-binding';

export const REMOTE_FINANCE_TABLES = [
  'transactions',
  'balances',
  'categories',
  'monthly_budgets',
  'category_budgets',
  'recurring_transactions',
  'conversions',
  'settings',
  'sync_tombstones',
] as const;

export type SyncBindingState =
  | 'provider-unconfigured'
  | 'signed-out'
  | 'unlinked'
  | 'linked'
  | 'account-mismatch'
  | 'provider-unavailable';

export type SyncAccess = {
  state: SyncBindingState;
  client: SupabaseClient | null;
  userId: string | null;
  binding: DeviceMetadata | null;
};

export async function getSyncAccess(database: TapTrackDatabase = db): Promise<SyncAccess> {
  const client = createSupabaseBrowserClient();
  let binding: DeviceMetadata | null;
  try {
    binding = (await database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)) ?? null;
  } catch {
    return { state: 'provider-unavailable', client, userId: null, binding: null };
  }

  if (!client) {
    return { state: 'provider-unconfigured', client: null, userId: null, binding };
  }

  try {
    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) return { state: 'signed-out', client, userId: null, binding };
    if (!binding) return { state: 'unlinked', client, userId: user.id, binding: null };
    if (binding.syncOwnerUserId !== user.id) {
      return { state: 'account-mismatch', client, userId: user.id, binding };
    }

    return { state: 'linked', client, userId: user.id, binding };
  } catch {
    return { state: 'provider-unavailable', client, userId: null, binding };
  }
}

export async function requireLinkedSyncAccess(
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

export async function linkDeviceLedgerToCurrentUser(
  database: TapTrackDatabase = db
): Promise<DeviceMetadata> {
  const client = createSupabaseBrowserClient();
  if (!client) throw new Error('Cloud sync is not configured.');

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) throw new Error('Sign in before linking cloud sync.');

  const existing = await database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID);
  if (existing) {
    if (existing.syncOwnerUserId === user.id) return existing;
    throw new Error('This device ledger is already linked to a different account.');
  }

  for (const tableName of REMOTE_FINANCE_TABLES) {
    const identityColumn = tableName === 'sync_tombstones' ? 'record_id' : 'id';
    const { data, error } = await client
      .from(tableName)
      .select(identityColumn)
      .eq('user_id', user.id)
      .limit(1);

    if (error) throw new Error('Cloud data could not be checked safely. Nothing was linked.');
    if (!Array.isArray(data)) {
      throw new Error('Cloud data returned an unexpected response. Nothing was linked.');
    }
    if (data.length > 0) {
      throw new Error('This account already has cloud data and cannot be linked automatically.');
    }
  }

  const binding: DeviceMetadata = {
    id: DEVICE_LEDGER_BINDING_ID,
    syncOwnerUserId: user.id,
    linkedAt: new Date().toISOString(),
  };

  try {
    await database.deviceMetadata.add(binding);
    return binding;
  } catch {
    const raced = await database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID);
    if (raced && raced.syncOwnerUserId === user.id) return raced;
    throw new Error('This device ledger was linked by another operation.');
  }
}
