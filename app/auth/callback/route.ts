import type { EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const AUTH_FAILURE_PATH = '/login?auth=confirmation-failed';

function getSafeNextPath(requestUrl: URL): string {
  const next = requestUrl.searchParams.get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
}

/** Handles PKCE auth-code callbacks and SSR email token-hash callbacks. */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const nextPath = getSafeNextPath(requestUrl);
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(`${origin}${error ? AUTH_FAILURE_PATH : nextPath}`);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return NextResponse.redirect(`${origin}${error ? AUTH_FAILURE_PATH : nextPath}`);
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return NextResponse.redirect(`${origin}${!error && user ? nextPath : AUTH_FAILURE_PATH}`);
}
