import { NextResponse } from 'next/server';
import { buildCategoryPrompt, parseCategoryResponse, type CategorizeRequest } from '@/ai/categoryPrompt';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const MAX_TITLE_LENGTH = 160;
const MAX_CATEGORIES = 100;
const MAX_CATEGORY_FIELD_LENGTH = 120;

interface GroqChatCompletion {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Authentication is unavailable.' }, { status: 503 });
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

  const relevantCategories = body.categories.filter((category) => category.type === body.transactionType);
  if (relevantCategories.length === 0) {
    return NextResponse.json({ categoryId: null });
  }

  const { data: quotaAllowed, error: quotaError } = await supabase.rpc(
    'consume_ai_categorization_quota',
    { max_requests: 30 }
  );
  if (quotaError) {
    return NextResponse.json({ error: 'AI rate limiting is unavailable.' }, { status: 503 });
  }
  if (!quotaAllowed) {
    return NextResponse.json({ error: 'AI categorization rate limit reached.' }, { status: 429 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI categorization is not configured.' }, { status: 503 });
  }

  const validIds = new Set(relevantCategories.map((category) => category.id.toLowerCase()));
  const prompt = buildCategoryPrompt({ ...body, categories: relevantCategories });

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? DEFAULT_MODEL,
        temperature: 0,
        max_completion_tokens: 24,
        messages: [
          {
            role: 'system',
            content: 'Return exactly one category ID from the supplied list and nothing else.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return NextResponse.json({ categoryId: null });
    }

    const data = (await response.json()) as GroqChatCompletion;
    const raw = data.choices?.[0]?.message?.content ?? '';
    const categoryId = parseCategoryResponse(raw, validIds);
    return NextResponse.json({ categoryId });
  } catch {
    return NextResponse.json({ categoryId: null });
  }
}

function isValidRequest(body: CategorizeRequest): boolean {
  if (!body || typeof body !== 'object') return false;
  if (body.transactionType !== 'income' && body.transactionType !== 'expense') return false;
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > MAX_TITLE_LENGTH) return false;
  if (!Array.isArray(body.categories) || body.categories.length === 0 || body.categories.length > MAX_CATEGORIES) return false;

  return body.categories.every((category) =>
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
