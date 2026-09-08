'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

export type CloudLedgerVersion = {
  revision: number;
  generation: string;
  updatedAt: string;
};

type LedgerVersionRow = {
  revision?: unknown;
  generation?: unknown;
  updated_at?: unknown;
};

function parseLedgerVersion(row: LedgerVersionRow | null): CloudLedgerVersion | null {
  if (!row) return null;
  if (!Number.isInteger(row.revision) || Number(row.revision) < 1) return null;
  if (typeof row.generation !== 'string' || row.generation.length === 0) return null;
  if (typeof row.updated_at !== 'string' || !Number.isFinite(new Date(row.updated_at).getTime())) {
    return null;
  }

  return {
    revision: Number(row.revision),
    generation: row.generation,
    updatedAt: row.updated_at,
  };
}

async function readLedgerVersion(
  client: SupabaseClient,
  userId: string
): Promise<CloudLedgerVersion | null> {
  const { data, error } = await client
    .from('ledger_versions')
    .select('revision,generation,updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Cloud ledger version could not be read: ${error.message}`);
  const parsed = parseLedgerVersion(data as LedgerVersionRow | null);
  if (data && !parsed) throw new Error('Cloud ledger version returned an invalid response.');
  return parsed;
}

/**
 * Gets the account ledger generation, creating the initial revision-1 marker for
 * newly-created accounts. Clients may insert their own marker but cannot rotate it.
 */
export async function ensureCloudLedgerVersion(
  client: SupabaseClient,
  userId: string
): Promise<CloudLedgerVersion> {
  const existing = await readLedgerVersion(client, userId);
  if (existing) return existing;

  const { error: insertError } = await client.from('ledger_versions').insert({ user_id: userId });
  if (insertError && insertError.code !== '23505') {
    throw new Error(`Cloud ledger version could not be initialized: ${insertError.message}`);
  }

  const created = await readLedgerVersion(client, userId);
  if (!created) throw new Error('Cloud ledger version could not be initialized.');
  return created;
}

export function bindingMatchesLedgerVersion(
  binding: { cloudRevision?: number; cloudGeneration?: string },
  remote: CloudLedgerVersion
): boolean {
  return binding.cloudRevision === remote.revision && binding.cloudGeneration === remote.generation;
}
