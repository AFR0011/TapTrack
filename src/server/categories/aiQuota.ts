import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export type AIQuotaResult = 'allowed' | 'limited' | 'unavailable';

export async function consumeAICategorizationQuota(userId: string): Promise<AIQuotaResult> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 'unavailable';

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('consume_ai_categorization_quota', {
      target_user_id: userId,
    });
    if (error) return 'unavailable';
    return data ? 'allowed' : 'limited';
  } catch {
    return 'unavailable';
  }
}
