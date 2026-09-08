import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { escapeTelegramHtml, getDateInTimeZone, POST } from './route';

const ENV_KEYS = [
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TAPTRACK_OWNER_TELEGRAM_CHAT_ID',
  'TAPTRACK_OWNER_USER_ID',
  'TAPTRACK_TIME_ZONE',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function webhookRequest(text: string, options?: { updateId?: number; chatType?: string }) {
  return new NextRequest('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'secret',
    },
    body: JSON.stringify({
      update_id: options?.updateId ?? 123,
      message: {
        message_id: 55,
        from: { id: 42, first_name: 'Owner' },
        chat: { id: 42, type: options?.chatType ?? 'private' },
        text,
      },
    }),
  });
}

function createWriteClient(result: Record<string, unknown>) {
  const from = vi.fn((tableName: string) => {
    if (tableName === 'categories') {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(async () => ({
          data: [
            {
              id: 'cat-income',
              name: 'Income',
              icon: null,
              color: null,
              is_default: true,
              type: 'income',
              created_at: '2026-09-01T00:00:00.000Z',
              updated_at: '2026-09-01T00:00:00.000Z',
            },
          ],
          error: null,
        })),
      };
      return chain;
    }

    if (tableName === 'settings') {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data: { last_used_method: 'card' }, error: null })),
      };
      return chain;
    }

    throw new Error(`Unexpected table ${tableName}`);
  });

  const rpc = vi.fn(async (name: string) => {
    if (name !== 'apply_taptrack_telegram_update') {
      throw new Error(`Unexpected RPC ${name}`);
    }
    return { data: result, error: null };
  });

  return { from, rpc };
}

function createTelegramFetchMock() {
  const telegramFetch = vi.fn<typeof fetch>();
  telegramFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  return telegramFetch;
}

beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'secret';
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
  process.env.TAPTRACK_OWNER_TELEGRAM_CHAT_ID = '42';
  process.env.TAPTRACK_OWNER_USER_ID = '11111111-1111-4111-8111-111111111111';
  process.env.TAPTRACK_TIME_ZONE = 'Europe/Istanbul';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('Telegram webhook', () => {
  it('escapes Telegram HTML and formats dates in the configured timezone', () => {
    expect(escapeTelegramHtml('<b>A&B</b> "x"')).toBe('&lt;b&gt;A&amp;B&lt;/b&gt; &quot;x&quot;');
    const instant = new Date('2026-09-07T21:30:00.000Z');
    expect(getDateInTimeZone(instant, 'Europe/Istanbul')).toBe('2026-09-08');
    expect(getDateInTimeZone(instant, 'America/New_York')).toBe('2026-09-07');
  });

  it('writes a transaction only through the atomic Telegram RPC and escapes its confirmation', async () => {
    const client = createWriteClient({
      applied: true,
      duplicate: false,
      transactions: [
        {
          id: 'telegram-123-1',
          type: 'income',
          amount: 10,
          currency: 'TRY',
          title: '<b>bonus</b>',
          method: 'card',
        },
      ],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
    const telegramFetch = createTelegramFetchMock();
    vi.stubGlobal('fetch', telegramFetch);

    const response = await POST(webhookRequest('+10 <b>bonus</b> card'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });

    expect(client.rpc).toHaveBeenCalledWith('apply_taptrack_telegram_update', {
      target_user_id: '11111111-1111-4111-8111-111111111111',
      telegram_update_id: 123,
      ledger_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      drafts: [
        expect.objectContaining({
          type: 'income',
          amount: 10,
          currency: 'TRY',
          title: '<b>bonus</b>',
          category_id: 'cat-income',
          method: 'card',
        }),
      ],
    });
    expect(client.from).not.toHaveBeenCalledWith('balances');

    const telegramBody = JSON.parse(String(telegramFetch.mock.calls[0]?.[1]?.body ?? '{}')) as {
      text?: string;
    };
    expect(telegramBody.text).toContain('&lt;b&gt;bonus&lt;/b&gt;');
    expect(telegramBody.text).not.toContain('· <b>bonus</b>');
  });

  it('does not send another confirmation for a duplicate Telegram update', async () => {
    const client = createWriteClient({ applied: true, duplicate: true, transactions: [] });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
    const telegramFetch = createTelegramFetchMock();
    vi.stubGlobal('fetch', telegramFetch);

    const response = await POST(webhookRequest('+10 bonus card'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, duplicate: true });
    expect(telegramFetch).not.toHaveBeenCalled();
  });

  it('fails closed for group chats until group authorization policy is configured', async () => {
    const response = await POST(webhookRequest('+10 bonus card', { chatType: 'group' }));

    expect(response.status).toBe(403);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
