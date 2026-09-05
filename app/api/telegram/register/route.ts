import { type NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/telegram/register
 * Registers the Telegram webhook for this deployment.
 * Call this once after setting TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET.
 *
 * The request must include the header:
 *   X-Admin-Secret: <value of TELEGRAM_WEBHOOK_SECRET>
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ownerChatId = process.env.TAPTRACK_OWNER_TELEGRAM_CHAT_ID;
  const ownerId = process.env.TAPTRACK_OWNER_USER_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!webhookSecret || !token || !ownerChatId || !ownerId || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Telegram integration is not fully configured' },
      { status: 503 }
    );
  }

  const adminSecret = request.headers.get('x-admin-secret');
  if (adminSecret !== webhookSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const host = request.nextUrl.origin;
  const webhookUrl = `${host}/api/telegram/webhook`;

  const response = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message'],
      }),
    }
  );

  const data = await response.json();
  return NextResponse.json({ webhookUrl, telegram: data });
}
