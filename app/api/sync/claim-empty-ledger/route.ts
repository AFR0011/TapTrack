import { NextResponse } from 'next/server';
import { normalizeBackupJSON, type TapTrackBackupV2 } from '@/exports/backupService';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const MAX_BODY_BYTES = 21 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClaimBody = { backup?: unknown };
type ClaimRpcResult = { claimed?: unknown; revision?: unknown; generation?: unknown };

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Authentication is unavailable.' }, { status: 503 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Cloud sync is unavailable.' }, { status: 503 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Ledger data is too large to sync safely.' }, { status: 413 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in before linking cloud sync.' }, { status: 401 });
  }

  let body: ClaimBody;
  try {
    body = (await request.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let backup: TapTrackBackupV2;
  try {
    backup = normalizeBackupJSON(JSON.stringify(body.backup)).backup;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ledger validation failed.' },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('claim_empty_taptrack_ledger', {
      target_user_id: user.id,
      backup: toRemoteBackupPayload(backup),
    });

    if (error) {
      return NextResponse.json({ error: 'Cloud ledger could not be initialized.' }, { status: 503 });
    }

    const result = Array.isArray(data) ? (data[0] as ClaimRpcResult | undefined) : undefined;
    if (
      !result ||
      typeof result.claimed !== 'boolean' ||
      !Number.isInteger(result.revision) ||
      Number(result.revision) < 1 ||
      typeof result.generation !== 'string' ||
      !UUID_PATTERN.test(result.generation)
    ) {
      return NextResponse.json({ error: 'Cloud ledger initialization returned an invalid version.' }, { status: 503 });
    }

    if (!result.claimed) {
      return NextResponse.json(
        {
          error:
            'This account already has cloud data. Choose whether to use the cloud ledger or merge this device before linking.',
          revision: Number(result.revision),
          generation: result.generation,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      revision: Number(result.revision),
      generation: result.generation,
    });
  } catch {
    return NextResponse.json({ error: 'Cloud sync is unavailable.' }, { status: 503 });
  }
}

function toRemoteBackupPayload(backup: TapTrackBackupV2): Record<string, unknown> {
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
