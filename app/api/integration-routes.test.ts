import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getExchangeRates } from './exchange-rates/route';
import { GET as registerTelegram } from './telegram/register/route';
import { POST as telegramWebhook } from './telegram/webhook/route';

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
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'expected-secret');
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
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'expected-secret');
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
});
