import { NextResponse } from 'next/server';
import { normalizeBackupJSON, type RavelBackupV2 } from '@/exports/backupService';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const MAX_BODY_BYTES = 21 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RestoreBody = { backup?: unknown };
type RestoreRpcResult = { revision?: unknown; generation?: unknown };

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Authentication is unavailable.' }, { status: 503 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Account restore is unavailable.' }, { status: 503 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Backup is too large to restore safely.' }, { status: 413 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to restore the synced account.' }, { status: 401 });
  }

  let body: RestoreBody;
  try {
    body = (await request.json()) as RestoreBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let backup: RavelBackupV2;
  try {
    backup = normalizeBackupJSON(JSON.stringify(body.backup)).backup;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backup validation failed.' },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('replace_taptrack_account_ledger', {
      target_user_id: user.id,
      backup: toRemoteBackupPayload(backup),
    });

    if (error) {
      return NextResponse.json({ error: 'Account ledger could not be replaced.' }, { status: 503 });
    }

    const result = Array.isArray(data) ? (data[0] as RestoreRpcResult | undefined) : undefined;
    if (
      !result ||
      !Number.isInteger(result.revision) ||
      Number(result.revision) < 2 ||
      typeof result.generation !== 'string' ||
      !UUID_PATTERN.test(result.generation)
    ) {
      return NextResponse.json({ error: 'Account restore returned an invalid generation.' }, { status: 503 });
    }

    return NextResponse.json({
      revision: Number(result.revision),
      generation: result.generation,
    });
  } catch {
    return NextResponse.json({ error: 'Account restore is unavailable.' }, { status: 503 });
  }
}

function toRemoteBackupPayload(backup: RavelBackupV2): Record<string, unknown> {
  return {
    transactions: backup.transactions.map(toSnakeCaseRecord),
    balance_checkpoints: backup.balanceCheckpoints.map(toSnakeCaseRecord),
    categories: backup.categories.map(toSnakeCaseRecord),
    monthly_budgets: backup.monthlyBudgets.map(toSnakeCaseRecord),
    category_budgets: backup.categoryBudgets.map(toSnakeCaseRecord),
    recurring_transactions: backup.recurringTransactions.map(toSnakeCaseRecord),
    conversions: backup.conversions.map(toSnakeCaseRecord),
    settings: backup.settings.map(toSnakeCaseRecord),
  };
}

function toSnakeCaseRecord(record: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    result[key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)] = value;
  }
  return result;
}
