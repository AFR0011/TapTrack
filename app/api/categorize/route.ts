import { NextResponse } from 'next/server';
import { buildCategoryPrompt, parseCategoryResponse, type CategorizeRequest } from '@/ai/categoryPrompt';

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

/**
 * POST /api/categorize
 * Body: CategorizeRequest (title, categories, transactionType)
 * Returns: { categoryId: string | null }
 *
 * Calls a local Ollama instance (or Render-hosted) configured via
 * OLLAMA_BASE_URL env var. Gracefully returns null on any error so the
 * UI falls back to the keyword-rule suggestion.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL;
  if (!ollamaBaseUrl) {
    return NextResponse.json({ categoryId: null });
  }

  let body: CategorizeRequest;
  try {
    body = (await request.json()) as CategorizeRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.title || !body.categories?.length) {
    return NextResponse.json({ categoryId: null });
  }

  const model = process.env.OLLAMA_MODEL ?? 'qwen2.5:1.5b';
  const prompt = buildCategoryPrompt(body);
  const validIds = new Set(body.categories.map((c) => c.id));

  try {
    const res = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ categoryId: null });
    }

    const data = (await res.json()) as OllamaGenerateResponse;
    const categoryId = parseCategoryResponse(data.response, validIds);

    return NextResponse.json({ categoryId });
  } catch {
    // Ollama server unreachable — degrade silently
    return NextResponse.json({ categoryId: null });
  }
}
