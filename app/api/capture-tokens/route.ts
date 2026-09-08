import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createCaptureToken, hashCaptureToken } from '@/server/capture/captureTokens';

const DEFAULT_LABEL = 'iPhone Quick Capture';
const MAX_LABEL_LENGTH = 80;

async function getAuthenticatedUser() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { user: null, unavailable: true } as const;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user: error ? null : user, unavailable: false } as const;
}

export async function GET(): Promise<NextResponse> {
  const auth = await getAuthenticatedUser();
  if (auth.unavailable) {
    return NextResponse.json({ error: 'Quick Capture is unavailable.' }, { status: 503 });
  }
  if (!auth.user) {
    return NextResponse.json({ error: 'Sign in to manage Quick Capture.' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('capture_tokens')
    .select('id, label, created_at, last_used_at, revoked_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Quick Capture devices could not be loaded.' }, { status: 503 });
  }

  return NextResponse.json({ tokens: data ?? [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await getAuthenticatedUser();
  if (auth.unavailable) {
    return NextResponse.json({ error: 'Quick Capture is unavailable.' }, { status: 503 });
  }
  if (!auth.user) {
    return NextResponse.json({ error: 'Sign in to set up Quick Capture.' }, { status: 401 });
  }

  let body: { label?: unknown } = {};
  try {
    body = (await request.json()) as { label?: unknown };
  } catch {
    // Empty body is valid and uses the default device label.
  }

  const label =
    typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, MAX_LABEL_LENGTH)
      : DEFAULT_LABEL;
  const rawToken = createCaptureToken();
  const tokenHash = hashCaptureToken(rawToken);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('capture_tokens')
    .insert({
      user_id: auth.user.id,
      token_hash: tokenHash,
      label,
    })
    .select('id, label, created_at, last_used_at, revoked_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Quick Capture key could not be created.' }, { status: 503 });
  }

  return NextResponse.json({ token: rawToken, device: data }, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await getAuthenticatedUser();
  if (auth.unavailable) {
    return NextResponse.json({ error: 'Quick Capture is unavailable.' }, { status: 503 });
  }
  if (!auth.user) {
    return NextResponse.json({ error: 'Sign in to manage Quick Capture.' }, { status: 401 });
  }

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: 'Choose a Quick Capture device to revoke.' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'Choose a Quick Capture device to revoke.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('capture_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', body.id)
    .eq('user_id', auth.user.id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Quick Capture device could not be revoked.' }, { status: 503 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Quick Capture device was not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
