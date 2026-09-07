import type { EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const AUTH_FAILURE_PATH = '/login?auth=confirmation-failed';

/**
 * Handles both PKCE auth-code callbacks and SSR email token-hash callbacks.
 * Normal email/password sign-in does not pass through this route.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const flowId = requestUrl.searchParams.get('sb_flow_id');
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined
    );
    return NextResponse.redirect(`${origin}${error ? AUTH_FAILURE_PATH : '/app'}`);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return NextResponse.redirect(`${origin}${error ? AUTH_FAILURE_PATH : '/app'}`);
  }

  // A callback URL without credentials may still be visited by an already
  // authenticated browser. Validate that state instead of blindly granting the
  // success redirect.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return NextResponse.redirect(`${origin}${!error && user ? '/app' : AUTH_FAILURE_PATH}`);
}
