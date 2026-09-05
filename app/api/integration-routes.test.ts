import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getExchangeRates } from './exchange-rates/route';
import { GET as registerTelegram } from './telegram/register/route';
import { POST as telegramWebhook } from './telegram/webhook/route';

function stubCompleteTelegramEnvironment() {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'expected-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TAPTRACK_OWNER_TELEGRAM_CHAT_ID', '1001');
  vi.stubEnv('TAPTRACK_OWNER_USER_ID', 'test-owner');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
}

describe('integration API route responses', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns exchange-rate JSON with fallback values when upstream fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));

    const response = await getExchangeRates();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(body).toEqual({ USD: 38.5, EUR: 42 });
  });

  it('rejects Telegram webhook requests with an invalid secret', async () => {
    stubCompleteTelegramEnvironment();
    const request = new NextRequest('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'wrong-secret',
      },
      body: JSON.stringify({ update_id: 1 }),
    });

    const response = await telegramWebhook(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects Telegram webhook registration with an invalid admin secret', async () => {
    stubCompleteTelegramEnvironment();
    const request = new NextRequest('http://localhost/api/telegram/register', {
      headers: {
        'x-admin-secret': 'wrong-secret',
      },
    });

    const response = await registerTelegram(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('fails closed before downstream work when Telegram configuration is incomplete', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const request = new NextRequest('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ update_id: 1 }),
    });

    const response = await telegramWebhook(request);

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-owner Telegram chat without sending or accessing data', async () => {
    stubCompleteTelegramEnvironment();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const request = new NextRequest('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'expected-secret',
      },
      body: JSON.stringify({
        update_id: 2,
        message: { message_id: 1, chat: { id: 2002 }, text: '/balance' },
      }),
    });

    const response = await telegramWebhook(request);

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
