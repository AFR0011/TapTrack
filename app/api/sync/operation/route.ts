import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const ALLOWED_TABLES = new Set([
  'transactions',
  'balance_checkpoints',
  'categories',
  'monthly_budgets',
  'category_budgets',
  'recurring_transactions',
  'conversions',
  'settings',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RECORD_ID_LENGTH = 200;
const MAX_BODY_BYTES = 128 * 1024;

type SyncOperationBody = {
  revision?: unknown;
  generation?: unknown;
  table?: unknown;
  operation?: unknown;
  recordId?: unknown;
  record?: unknown;
};

type SyncOperationResult = {
  applied?: unknown;
  revision?: unknown;
  generation?: unknown;
};

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Authentication is unavailable.' }, { status: 503 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Protected sync is unavailable.' }, { status: 503 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Sync operation is too large.' }, { status: 413 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to sync this ledger.' }, { status: 401 });
  }

  let body: SyncOperationBody;
  try {
    body = (await request.json()) as SyncOperationBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json({ error: 'Invalid sync operation.' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('apply_taptrack_sync_operation', {
      target_user_id: user.id,
      expected_revision: body.revision,
      expected_generation: body.generation,
      target_table: body.table,
      operation: body.operation,
      record_id: body.recordId,
      record: body.operation === 'upsert' ? body.record : null,
    });

    if (error) {
      return NextResponse.json({ error: 'Protected sync operation failed.' }, { status: 503 });
    }

    const result = Array.isArray(data) ? (data[0] as SyncOperationResult | undefined) : undefined;
    if (!result || typeof result.applied !== 'boolean') {
      return NextResponse.json({ error: 'Protected sync returned an invalid response.' }, { status: 503 });
    }

    if (!result.applied) {
      return NextResponse.json(
        {
          error: 'ledger-generation-changed',
          revision: result.revision,
          generation: result.generation,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Protected sync is unavailable.' }, { status: 503 });
  }
}

function isValidBody(body: SyncOperationBody): body is Required<Omit<SyncOperationBody, 'record'>> & { record?: unknown } {
  if (!body || typeof body !== 'object') return false;
  if (!Number.isInteger(body.revision) || Number(body.revision) < 1) return false;
  if (typeof body.generation !== 'string' || !UUID_PATTERN.test(body.generation)) return false;
  if (typeof body.table !== 'string' || !ALLOWED_TABLES.has(body.table)) return false;
  if (body.operation !== 'upsert' && body.operation !== 'delete') return false;
  if (
    typeof body.recordId !== 'string' ||
    body.recordId.length === 0 ||
    body.recordId.length > MAX_RECORD_ID_LENGTH
  ) {
    return false;
  }
  if (body.operation === 'upsert') {
    if (!body.record || typeof body.record !== 'object' || Array.isArray(body.record)) return false;
    const record = body.record as Record<string, unknown>;
    if (record.id !== body.recordId) return false;
    if (JSON.stringify(record).length > MAX_BODY_BYTES) return false;
  }
  return true;
}
