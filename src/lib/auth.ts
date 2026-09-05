import { createSupabaseBrowserClient } from '@/lib/supabase';

export async function signOutUser(): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSignedInEmail(): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}
