import { createClient } from '@supabase/supabase-js';

/**
 * Server-only admin client using the service role key.
 * NEVER import this in client components — the service role key must stay server-side.
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
