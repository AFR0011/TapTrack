import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { parseCommands } from '@/parser/parseCommand';
import { createDefaultCategories } from '@/defaultData';
import { normalizeCurrencyCode } from '@/currencies/currencyCatalog';
import { suggestServerCategory } from '@/server/categories/suggestServerCategory';
import {
  SUPPORTED_METHODS,
  type Category,
  type Currency,
  type Method,
} from '@/types';

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type?: string };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

type TelegramWriteResult = {
  applied?: unknown;
  duplicate?: unknown;
  errorCode?: unknown;
  currency?: unknown;
  method?: unknown;
  availableAmount?: unknown;
  transactions?: unknown;
};

type TelegramSavedTransaction = {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: Currency;
  title: string;
  method: Method;
};

async function sendMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch {
    // Ledger correctness must not depend on Telegram accepting the confirmation.
  }
}

export function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function getDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  if (!year || !month || !day) throw new Error('Could not determine Telegram ledger date.');
  return `${year}-${month}-${day}`;
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
  }
}

function matchesCommand(text: string, command: string): boolean {
  const token = text.split(/\s+/, 1)[0]?.toLowerCase() ?? '';
  return token === command || token.startsWith(`${command}@`);
}

function isSavedTransaction(value: unknown): value is TelegramSavedTransaction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    (row.type === 'income' || row.type === 'expense') &&
    typeof row.amount === 'number' &&
    Number.isFinite(row.amount) &&
    row.amount > 0 &&
    typeof row.currency === 'string' &&
    /^[A-Z]{3}$/.test(row.currency) &&
    typeof row.title === 'string' &&
    (row.method === 'cash' || row.method === 'card')
  );
}

function normalizeActiveCurrencies(rows: Array<{ currency: unknown }> | null | undefined, fallback: Currency): Currency[] {
  const currencies = new Set<Currency>([fallback]);
  for (const row of rows ?? []) {
    const currency = normalizeCurrencyCode(row.currency);
    if (currency) currencies.add(currency);
  }
  return [...currencies].sort((a, b) => a.localeCompare(b));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const ownerChatId = process.env.RAVEL_OWNER_TELEGRAM_CHAT_ID ?? process.env.TAPTRACK_OWNER_TELEGRAM_CHAT_ID;
  const ownerId = process.env.RAVEL_OWNER_USER_ID ?? process.env.TAPTRACK_OWNER_USER_ID;
  const timeZone = process.env.RAVEL_TIME_ZONE ?? process.env.TAPTRACK_TIME_ZONE;

  if (
    !webhookSecret ||
    !botToken ||
    !ownerChatId ||
    !ownerId ||
    !timeZone ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: 'Telegram integration is not fully configured' }, { status: 503 });
  }

  let ledgerDate: string;
  try {
    ledgerDate = getDateInTimeZone(new Date(), timeZone);
  } catch {
    return NextResponse.json({ error: 'Telegram timezone is invalid' }, { status: 503 });
  }

  const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
  if (secretToken !== webhookSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: 'Invalid Telegram update' }, { status: 400 });
  }
  if (!Number.isInteger(update.update_id) || update.update_id < 0) {
    return NextResponse.json({ error: 'Invalid Telegram update' }, { status: 400 });
  }

  const message = update.message;
  if (!message?.text) return NextResponse.json({ ok: true });
  const chatId = message.chat.id;
  const text = message.text.trim();

  if (String(chatId) !== ownerChatId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (message.chat.type && message.chat.type !== 'private') {
    return NextResponse.json({ error: 'Telegram group access is not configured' }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();

  if (matchesCommand(text, '/balance')) {
    const [{ data: settings, error: settingsError }, { data: checkpointCurrencies, error: currencyError }] = await Promise.all([
      supabase
        .from('settings')
        .select('default_currency')
        .eq('user_id', ownerId)
        .eq('id', 'default')
        .is('deleted_at', null)
        .maybeSingle(),
      supabase
        .from('balance_checkpoints')
        .select('currency')
        .eq('user_id', ownerId)
        .is('deleted_at', null),
    ]);
    if (settingsError || currencyError) {
      await sendMessage(chatId, '❌ Balance summary is temporarily unavailable.');
      return NextResponse.json({ ok: true });
    }
    const defaultCurrency = normalizeCurrencyCode(settings?.default_currency) ?? 'TRY';
    const currencies = normalizeActiveCurrencies(checkpointCurrencies, defaultCurrency);
    const balances: Array<{ currency: Currency; method: Method; amount: number }> = [];
    for (const currency of currencies) {
      for (const method of SUPPORTED_METHODS) {
        const { data, error } = await supabase.rpc('taptrack_calculated_balance', {
          target_user_id: ownerId,
          target_currency: currency,
          target_method: method,
        });
        if (error || !Number.isFinite(Number(data))) {
          await sendMessage(chatId, '❌ Balance summary is temporarily unavailable.');
          return NextResponse.json({ ok: true });
        }
        balances.push({ currency, method, amount: Number(data) });
      }
    }

    const lines = ['💰 <b>Balances</b>'];
    for (const balance of balances) {
      lines.push(`${balance.currency} ${balance.method}: ${formatAmount(balance.amount, balance.currency)}`);
    }
    await sendMessage(chatId, lines.join('\n'));
    return NextResponse.json({ ok: true });
  }

  if (matchesCommand(text, '/today')) {
    const { data: txs, error } = await supabase
      .from('transactions')
      .select('type, amount, currency, method, title')
      .eq('user_id', ownerId)
      .eq('date', ledgerDate)
      .is('deleted_at', null)
      .order('occurred_at', { ascending: true });

    if (error) {
      await sendMessage(chatId, '❌ Today’s transactions are temporarily unavailable.');
      return NextResponse.json({ ok: true });
    }

    const expenses = txs?.filter((transaction) => transaction.type === 'expense') ?? [];
    const income = txs?.filter((transaction) => transaction.type === 'income') ?? [];
    const lines = [`📊 <b>Today (${ledgerDate})</b>`];
    if (expenses.length === 0 && income.length === 0) {
      lines.push('No transactions today.');
    } else {
      if (expenses.length > 0) {
        lines.push('\n<b>Expenses:</b>');
        for (const transaction of expenses) {
          lines.push(`  -${formatAmount(Number(transaction.amount), String(transaction.currency))} ${escapeTelegramHtml(String(transaction.method))} · ${escapeTelegramHtml(String(transaction.title))}`);
        }
      }
      if (income.length > 0) {
        lines.push('\n<b>Income:</b>');
        for (const transaction of income) {
          lines.push(`  +${formatAmount(Number(transaction.amount), String(transaction.currency))} ${escapeTelegramHtml(String(transaction.method))} · ${escapeTelegramHtml(String(transaction.title))}`);
        }
      }
    }
    await sendMessage(chatId, lines.join('\n'));
    return NextResponse.json({ ok: true });
  }

  if (matchesCommand(text, '/help') || matchesCommand(text, '/start')) {
    await sendMessage(
      chatId,
      '📒 <b>Ravel Bot</b>\n\n' +
        'Log transactions:\n' +
        '  <code>-120 coffee cash</code>\n' +
        '  <code>+20000 salary card</code>\n' +
        '  <code>-9.99 eur spotify</code>\n' +
        '  <code>-25 gbp lunch cash</code>\n' +
        '  <code>-250 dinner -500 lunch</code>\n\n' +
        'Commands:\n' +
        '  /balance — show current balances\n' +
        '  /today — show today\'s transactions'
    );
    return NextResponse.json({ ok: true });
  }

  if (!text.startsWith('/')) {
    const [
      { data: rawCategories, error: categoryError },
      { data: settings, error: settingsError },
      { data: checkpointCurrencies, error: currencyError },
    ] = await Promise.all([
      supabase.from('categories').select('*').eq('user_id', ownerId).is('deleted_at', null),
      supabase
        .from('settings')
        .select('last_used_method, default_currency, ai_categorization_enabled')
        .eq('user_id', ownerId)
        .eq('id', 'default')
        .is('deleted_at', null)
        .maybeSingle(),
      supabase
        .from('balance_checkpoints')
        .select('currency')
        .eq('user_id', ownerId)
        .is('deleted_at', null),
    ]);

    if (categoryError || settingsError || currencyError) {
      await sendMessage(chatId, '❌ Ravel could not load your ledger settings.');
      return NextResponse.json({ ok: true });
    }

    const categories: Category[] = (rawCategories?.length
      ? rawCategories.map((category) => ({
          id: category.id as string,
          name: category.name as string,
          icon: (category.icon as string | null) ?? undefined,
          color: (category.color as string | null) ?? undefined,
          isDefault: category.is_default as boolean,
          type: category.type as 'income' | 'expense',
          createdAt: category.created_at as string,
          updatedAt: category.updated_at as string,
        }))
      : createDefaultCategories()) as Category[];

    const defaultMethod: Method = settings?.last_used_method === 'cash' ? 'cash' : 'card';
    const defaultCurrency = normalizeCurrencyCode(settings?.default_currency) ?? 'TRY';
    const activeCurrencies = normalizeActiveCurrencies(checkpointCurrencies, defaultCurrency);
    const results = parseCommands(text, {
      categories,
      defaultMethod,
      defaultCurrency,
      activeCurrencies,
    });
    const failures = results.filter((result) => !result.ok);
    if (failures.length > 0) {
      const messages = results
        .map((result, index) =>
          result.ok
            ? null
            : results.length === 1
              ? result.message
              : `Entry ${index + 1}: ${result.message}`
        )
        .filter((entryMessage): entryMessage is string => entryMessage !== null);
      await sendMessage(chatId, `❌ ${escapeTelegramHtml(messages.join('\n'))}`);
      return NextResponse.json({ ok: true });
    }

    const parsedDrafts = results.flatMap((result) =>
      result.ok
        ? [{
            type: result.transaction.type,
            amount: result.transaction.amount,
            currency: result.transaction.currency,
            title: result.transaction.title,
            category_id: result.transaction.categoryId,
            method: result.transaction.method,
            note: result.transaction.note ?? null,
          }]
        : []
    );

    const drafts = await Promise.all(
      parsedDrafts.map(async (draft) => {
        const category = await suggestServerCategory({
          userId: ownerId,
          title: draft.title,
          type: draft.type,
          categories,
          aiEnabled: Boolean(settings?.ai_categorization_enabled),
        });
        return { ...draft, category_id: category?.categoryId ?? draft.category_id };
      })
    );

    const { data, error } = await supabase.rpc('apply_taptrack_telegram_update', {
      target_user_id: ownerId,
      telegram_update_id: update.update_id,
      ledger_date: ledgerDate,
      drafts,
    });
    if (error) {
      await sendMessage(chatId, '❌ Transaction could not be saved.');
      return NextResponse.json({ ok: true });
    }

    const result = data as TelegramWriteResult | null;
    if (!result || typeof result !== 'object') {
      await sendMessage(chatId, '❌ Transaction could not be saved.');
      return NextResponse.json({ ok: true });
    }
    if (result.duplicate === true) return NextResponse.json({ ok: true, duplicate: true });

    if (result.applied !== true) {
      if (
        result.errorCode === 'insufficient-balance' &&
        typeof result.currency === 'string' &&
        typeof result.method === 'string' &&
        Number.isFinite(Number(result.availableAmount))
      ) {
        await sendMessage(
          chatId,
          `❌ Not enough ${escapeTelegramHtml(result.currency)} ${escapeTelegramHtml(result.method)} balance (${formatAmount(Number(result.availableAmount), result.currency)} available).`
        );
      } else {
        await sendMessage(chatId, '❌ Transaction was not saved.');
      }
      return NextResponse.json({ ok: true });
    }

    const saved = Array.isArray(result.transactions)
      ? result.transactions.filter(isSavedTransaction)
      : [];
    if (saved.length !== drafts.length) {
      await sendMessage(chatId, '✅ Transaction saved, but the confirmation could not be formatted.');
      return NextResponse.json({ ok: true });
    }

    const savedLines = saved.map((transaction) => {
      const sign = transaction.type === 'income' ? '+' : '-';
      return `${sign}${formatAmount(transaction.amount, transaction.currency)} · ${escapeTelegramHtml(transaction.title)} · ${transaction.method}`;
    });
    const header = saved.length === 1 ? '✅ Saved' : `✅ Saved ${saved.length} transactions`;
    await sendMessage(chatId, `${header}\n${savedLines.join('\n')}`);
    return NextResponse.json({ ok: true });
  }

  await sendMessage(chatId, 'Unknown command. Type /help for usage.');
  return NextResponse.json({ ok: true });
}
