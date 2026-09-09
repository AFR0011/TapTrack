import { NextResponse } from 'next/server';
import { type CategorizeRequest } from '@/ai/categoryPrompt';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { consumeAICategorizationQuota } from '@/server/categories/aiQuota';
import { categorizeWithAI } from '@/server/categories/categorizeWithAI';

const MAX_TITLE_LENGTH = 160;
const MAX_CATEGORIES = 100;
const MAX_CATEGORY_FIELD_LENGTH = 120;

export async function POST(request: Request): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Authentication is unavailable.' }, { status: 503 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'AI rate limiting is unavailable.' }, { status: 503 });
  }
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'AI categorization is not configured.' }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to use AI categorization.' }, { status: 401 });
  }

  let body: CategorizeRequest;
  try {
    body = (await request.json()) as CategorizeRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!isValidRequest(body)) {
    return NextResponse.json({ error: 'Invalid categorization request.' }, { status: 400 });
  }

  const relevantCategories = body.categories.filter(
    (category) => category.type === body.transactionType
  );
  if (relevantCategories.length === 0 && body.recommendNewCategories !== true) {
    return NextResponse.json({ kind: 'none', unavailable: false });
  }

  const quota = await consumeAICategorizationQuota(user.id);
  if (quota === 'unavailable') {
    return NextResponse.json({ error: 'AI rate limiting is unavailable.' }, { status: 503 });
  }
  if (quota === 'limited') {
    return NextResponse.json({ error: 'AI categorization rate limit reached.' }, { status: 429 });
  }

  const result = await categorizeWithAI({ ...body, categories: relevantCategories });
  return NextResponse.json(result);
}

function isValidRequest(body: CategorizeRequest): boolean {
  if (!body || typeof body !== 'object') return false;
  if (body.transactionType !== 'income' && body.transactionType !== 'expense') return false;
  if (
    typeof body.title !== 'string' ||
    !body.title.trim() ||
    body.title.length > MAX_TITLE_LENGTH
  ) {
    return false;
  }
  if (!Array.isArray(body.categories) || body.categories.length > MAX_CATEGORIES) {
    return false;
  }
  if (
    body.recommendNewCategories !== undefined &&
    typeof body.recommendNewCategories !== 'boolean'
  ) {
    return false;
  }

  return body.categories.every(
    (category) =>
      category &&
      typeof category.id === 'string' &&
      category.id.length > 0 &&
      category.id.length <= MAX_CATEGORY_FIELD_LENGTH &&
      typeof category.name === 'string' &&
      category.name.length > 0 &&
      category.name.length <= MAX_CATEGORY_FIELD_LENGTH &&
      (category.type === 'income' || category.type === 'expense')
  );
}
