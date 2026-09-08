import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { hashCaptureToken, isCaptureToken } from '@/server/capture/captureTokens';
import { suggestServerCategory } from '@/server/categories/suggestServerCategory';
import type { Category, Currency, Method, TransactionType } from '@/types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE_LENGTH = 160;
const MAX_NOTE_LENGTH = 500;
const MAX_AMOUNT = 1_000_000_000_000;

type CaptureRequestBody = {
  requestId?: unknown;
  type?: unknown;
  amount?: unknown;
  currency?: unknown;
  title?: unknown;
  method?: unknown;
  date?: unknown;
  note?: unknown;
};

type CaptureRpcResult = {
  applied?: unknown;
  duplicate?: unknown;
  errorCode?: unknown;
  currency?: unknown;
  method?: unknown;
  availableAmount?: unknown;
  transaction?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Quick Capture is unavailable.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization') ?? '';
  const rawToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  if (!isCaptureToken(rawToken)) {
    return NextResponse.json({ error: 'Quick Capture key is invalid.' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const tokenHash = hashCaptureToken(rawToken);
  const { data: tokenRow, error: tokenError } = await admin
    .from('capture_tokens')
    .select('id, user_id, revoked_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (tokenError) {
    return NextResponse.json({ error: 'Quick Capture is temporarily unavailable.' }, { status: 503 });
  }
  if (!tokenRow) {
    return NextResponse.json({ error: 'Quick Capture key is invalid or revoked.' }, { status: 401 });
  }

  let body: CaptureRequestBody;
  try {
    body = (await request.json()) as CaptureRequestBody;
  } catch {
    return NextResponse.json({ error: 'Quick Capture request is invalid.' }, { status: 400 });
  }

  const parsed = parseCaptureBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const [{ data: settings, error: settingsError }, { data: rawCategories, error: categoriesError }] =
    await Promise.all([
      admin
        .from('settings')
        .select('last_used_method, ai_categorization_enabled, setup_completed')
        .eq('user_id', tokenRow.user_id)
        .eq('id', 'default')
        .is('deleted_at', null)
        .maybeSingle(),
      admin
        .from('categories')
        .select('id, name, icon, color, is_default, type, created_at, updated_at')
        .eq('user_id', tokenRow.user_id)
        .is('deleted_at', null),
    ]);

  if (settingsError || categoriesError) {
    return NextResponse.json({ error: 'TapTrack could not load the linked ledger.' }, { status: 503 });
  }
  if (!settings?.setup_completed || !rawCategories?.length) {
    return NextResponse.json(
      { error: 'Finish TapTrack setup and cloud linking before using Quick Capture.' },
      { status: 409 }
    );
  }

  const categories: Category[] = rawCategories.map((category) => ({
    id: category.id as string,
    name: category.name as string,
    icon: (category.icon as string | null) ?? undefined,
    color: (category.color as string | null) ?? undefined,
    isDefault: Boolean(category.is_default),
    type: category.type as TransactionType,
    createdAt: String(category.created_at),
    updatedAt: String(category.updated_at),
  }));

  const category = await suggestServerCategory({
    userId: String(tokenRow.user_id),
    title: parsed.title,
    type: parsed.type,
    categories,
    aiEnabled: Boolean(settings.ai_categorization_enabled),
  });
  if (!category) {
    return NextResponse.json({ error: 'No matching TapTrack category is available.' }, { status: 409 });
  }

  const method: Method = parsed.method ?? (settings.last_used_method === 'cash' ? 'cash' : 'card');
  const currency: Currency = parsed.currency ?? 'TRY';
  const { data, error: rpcError } = await admin.rpc('apply_taptrack_capture', {
    target_user_id: tokenRow.user_id,
    capture_token_id: tokenRow.id,
    capture_request_id: parsed.requestId,
    ledger_date: parsed.date,
    draft: {
      type: parsed.type,
      amount: parsed.amount,
      currency,
      title: parsed.title,
      category_id: category.categoryId,
      category_source: category.source,
      method,
      note: parsed.note ?? null,
    },
  });

  if (rpcError) {
    return NextResponse.json({ error: 'Transaction could not be captured.' }, { status: 503 });
  }

  const result = data as CaptureRpcResult | null;
  if (!result || typeof result !== 'object') {
    return NextResponse.json({ error: 'Quick Capture returned an invalid response.' }, { status: 503 });
  }
  if (result.applied !== true) {
    if (result.errorCode === 'rate-limit') {
      return NextResponse.json({ error: 'Quick Capture rate limit reached.' }, { status: 429 });
    }
    if (result.errorCode === 'invalid-token') {
      return NextResponse.json({ error: 'Quick Capture key is invalid or revoked.' }, { status: 401 });
    }
    if (result.errorCode === 'insufficient-balance') {
      return NextResponse.json(
        {
          error: 'Not enough balance for this expense.',
          currency: result.currency,
          method: result.method,
          availableAmount: result.availableAmount,
        },
        { status: 409 }
      );
    }
    if (result.errorCode === 'ledger-not-ready') {
      return NextResponse.json(
        { error: 'Finish TapTrack setup and cloud linking before using Quick Capture.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Transaction could not be captured.' }, { status: 409 });
  }

  return NextResponse.json(
    {
      ok: true,
      duplicate: result.duplicate === true,
      transaction: result.transaction,
    },
    { status: result.duplicate === true ? 200 : 201 }
  );
}

export function parseCaptureBody(body: CaptureRequestBody):
  | {
      ok: true;
      requestId: string;
      type: TransactionType;
      amount: number;
      currency?: Currency;
      title: string;
      method?: Method;
      date: string;
      note?: string;
    }
  | { ok: false; error: string } {
  if (typeof body.requestId !== 'string' || !UUID_PATTERN.test(body.requestId)) {
    return { ok: false, error: 'Quick Capture request ID is invalid.' };
  }
  if (body.type !== 'expense' && body.type !== 'income') {
    return { ok: false, error: 'Choose expense or income.' };
  }
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { ok: false, error: 'Enter a valid amount.' };
  }
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: 'Add a short transaction title.' };
  }
  if (body.currency !== undefined && !['TRY', 'USD', 'EUR'].includes(String(body.currency))) {
    return { ok: false, error: 'Currency is not supported.' };
  }
  if (body.method !== undefined && body.method !== 'cash' && body.method !== 'card') {
    return { ok: false, error: 'Payment method is not supported.' };
  }
  if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > MAX_NOTE_LENGTH)) {
    return { ok: false, error: 'Note is too long.' };
  }

  const date = typeof body.date === 'string' && DATE_PATTERN.test(body.date)
    ? body.date
    : formatUtcDate(new Date());
  if (!isCurrentCaptureDate(date)) {
    return { ok: false, error: 'Quick Capture only accepts transactions happening now.' };
  }

  return {
    ok: true,
    requestId: body.requestId,
    type: body.type,
    amount,
    currency: body.currency as Currency | undefined,
    title: body.title.trim(),
    method: body.method as Method | undefined,
    date,
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined,
  };
}

function isCurrentCaptureDate(date: string): boolean {
  const now = new Date();
  return [-1, 0, 1].some((offset) => {
    const candidate = new Date(now);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    return formatUtcDate(candidate) === date;
  });
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
