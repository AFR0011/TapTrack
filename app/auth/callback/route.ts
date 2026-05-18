import { type NextRequest, NextResponse } from 'next/server';

/**
 * Kept for backward compatibility (e.g. Supabase email-confirmation links).
 * With email+password auth the browser never lands here during normal sign-in.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/app`);
}
