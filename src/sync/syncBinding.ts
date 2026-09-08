'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { db, type TapTrackDatabase } from '@/database';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { ensureCloudLedgerVersion } from '@/sync/ledgerVersion';
import type { DeviceMetadata } from '@/types';

export const DEVICE_LEDGER_BINDING_ID = 'ledger-binding';

export const REMOTE_FINANCE_TABLES = [
  'transactions',
  'balance_checkpoints',
  'categories',
  'monthly_budgets',
  'category_budgets',
  'recurring_transactions',
  'conversions',
  'settings',
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

export type LedgerLinkPlanState =
  | 'already-linked'
  | 'remote-empty'
  | 'cloud-only'
  | 'merge-choice';

export type LedgerLinkPlan = {
  state: LedgerLinkPlanState;
  userId: string;
  localHasUserData: boolean;
  remoteHasData: boolean;
};

export type LedgerLinkMode = 'empty-only' | 'use-cloud' | 'merge-local';

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
): Promise<{ client: SupabaseClient; userId: string; binding: DeviceMetadata } | null> {
  try {
    const access = await getSyncAccess(database);
    if (access.state !== 'linked' || !access.client || !access.userId || !access.binding) return null;
    return { client: access.client, userId: access.userId, binding: access.binding };
  } catch {
    return null;
  }
}

/**
 * Returns true only when this browser contains user-authored finance state.
 * Seeded categories, zero balances, and untouched default settings do not count.
 */
export async function hasMeaningfulLocalLedgerData(
  database: TapTrackDatabase = db
): Promise<boolean> {
  const [
    transactionCount,
    checkpointCount,
    monthlyBudgetCount,
    categoryBudgetCount,
    recurringCount,
    conversionCount,
    balances,
    categories,
    settings,
  ] = await Promise.all([
    database.transactions.count(),
    database.balanceCheckpoints.count(),
    database.monthlyBudgets.count(),
    database.categoryBudgets.count(),
    database.recurringTransactions.count(),
    database.conversions.count(),
    database.balances.toArray(),
    database.categories.toArray(),
    database.settings.toArray(),
  ]);

  if (
    transactionCount > 0 ||
    checkpointCount > 0 ||
    monthlyBudgetCount > 0 ||
    categoryBudgetCount > 0 ||
    recurringCount > 0 ||
    conversionCount > 0
  ) {
    return true;
  }

  if (balances.some((balance) => Number.isFinite(balance.amount) && balance.amount !== 0)) {
    return true;
  }

  if (
    categories.some(
      (category) => !category.isDefault || category.updatedAt !== category.createdAt
    )
  ) {
    return true;
  }

  return settings.some(
    (item) => item.setupCompleted || item.updatedAt !== item.createdAt
  );
}

async function remoteLedgerHasData(client: SupabaseClient, userId: string): Promise<boolean> {
  let remoteHasData = false;

  for (const tableName of REMOTE_FINANCE_TABLES) {
    const { data, error } = await client
      .from(tableName)
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .limit(1);

    if (error) throw new Error('Cloud data could not be checked safely. Nothing was linked.');
    if (!Array.isArray(data)) {
      throw new Error('Cloud data returned an unexpected response. Nothing was linked.');
    }
    if (data.length > 0) remoteHasData = true;
  }

  return remoteHasData;
}

/**
 * Inspects the signed-in account and local browser before any irreversible link
 * decision. A second device with only untouched seed data can adopt cloud data
 * directly; a device with real local data requires an explicit merge choice.
 */
export async function inspectDeviceLedgerLinkToCurrentUser(
  database: TapTrackDatabase = db
): Promise<LedgerLinkPlan> {
  const client = createSupabaseBrowserClient();
  if (!client) throw new Error('Cloud sync is not configured.');

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) throw new Error('Sign in before linking cloud sync.');

  const existing = await database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID);
  if (existing) {
    if (existing.syncOwnerUserId !== user.id) {
      throw new Error('This device ledger is already linked to a different account.');
    }
    const [localHasUserData, remoteHasData] = await Promise.all([
      hasMeaningfulLocalLedgerData(database),
      remoteLedgerHasData(client, user.id),
    ]);
    return {
      state: 'already-linked',
      userId: user.id,
      localHasUserData,
      remoteHasData,
    };
  }

  const [localHasUserData, remoteHasData] = await Promise.all([
    hasMeaningfulLocalLedgerData(database),
    remoteLedgerHasData(client, user.id),
  ]);

  let state: LedgerLinkPlanState;
  if (!remoteHasData) state = 'remote-empty';
  else if (!localHasUserData) state = 'cloud-only';
  else state = 'merge-choice';

  return { state, userId: user.id, localHasUserData, remoteHasData };
}

/**
 * Creates the immutable browser-to-account binding after the caller has made
 * the appropriate adoption decision. `empty-only` remains fail-closed if cloud
 * data appears between preflight and linking; the explicit adoption modes allow
 * an existing cloud ledger because the caller has chosen how to reconcile it.
 */
export async function linkDeviceLedgerToCurrentUser(
  database: TapTrackDatabase = db,
  mode: LedgerLinkMode = 'empty-only'
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

  const remoteHasData = await remoteLedgerHasData(client, user.id);
  if (remoteHasData && mode === 'empty-only') {
    throw new Error(
      'This account already has cloud data. Choose whether to use the cloud ledger or merge this device before linking.'
    );
  }

  const cloudVersion = await ensureCloudLedgerVersion(client, user.id);
  const binding: DeviceMetadata = {
    id: DEVICE_LEDGER_BINDING_ID,
    syncOwnerUserId: user.id,
    linkedAt: new Date().toISOString(),
    cloudRevision: cloudVersion.revision,
    cloudGeneration: cloudVersion.generation,
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
