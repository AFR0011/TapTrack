import { type NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/telegram/register
 * Registers the Telegram webhook for this deployment.
 * Call this once after configuring the Telegram integration.
 *
 * The request must include:
 *   X-Admin-Secret: <value of TELEGRAM_WEBHOOK_SECRET>
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ownerChatId = process.env.TAPTRACK_OWNER_TELEGRAM_CHAT_ID;
  const ownerId = process.env.TAPTRACK_OWNER_USER_ID;
  const timeZone = process.env.TAPTRACK_TIME_ZONE;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !webhookSecret ||
    !token ||
    !ownerChatId ||
    !ownerId ||
    !timeZone ||
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return NextResponse.json(
      { error: 'Telegram integration is not fully configured' },
      { status: 503 }
    );
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    return NextResponse.json({ error: 'Telegram timezone is invalid' }, { status: 503 });
  }

  const adminSecret = request.headers.get('x-admin-secret');
  if (adminSecret !== webhookSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const webhookUrl = `${request.nextUrl.origin}/api/telegram/webhook`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message'],
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Telegram rejected webhook registration' },
      { status: 502 }
    );
  }

  const data = await response.json();
  return NextResponse.json({ webhookUrl, telegram: data });
}
