import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  // The local ledger and its APIs must not wait on authentication just to render or respond.
  // Protected API routes authenticate inside their own handlers when cloud features are used.
  if (pathname !== '/login') {
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key) {
    try {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      });

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const appUrl = request.nextUrl.clone();
        appUrl.pathname = '/app';
        return NextResponse.redirect(appUrl);
      }
    } catch {
      // Provider availability must not prevent the sign-in page from rendering.
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/login'],
};
