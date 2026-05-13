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
  const adminSecret = request.headers.get('x-admin-secret');
  if (adminSecret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, { status: 500 });
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
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message'],
      }),
    }
  );

  const data = await response.json();
  return NextResponse.json({ webhookUrl, telegram: data });
}
