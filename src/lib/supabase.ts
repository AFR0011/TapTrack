import { createBrowserClient } from '@supabase/ssr';

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient(): ReturnType<typeof createBrowserClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If environment variables aren't set, return a no-op client
  if (!url || !key) {
    if (!supabaseClient) {
      supabaseClient = createBrowserClient('https://noop.supabase.co', 'no-op-key');
    }
    return supabaseClient;
  }

  return createBrowserClient(url, key);
}
