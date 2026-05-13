import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { parseCommands } from '@/parser/parseCommand';
import { createDefaultCategories } from '@/defaultData';
import type { Category } from '@/types';

// ---------------------------------------------------------------------------
// Telegram update types (subset)
// ---------------------------------------------------------------------------
interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ---------------------------------------------------------------------------
// Telegram API helper
// ---------------------------------------------------------------------------
async function sendMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => undefined);
}

function formatAmount(amount: number, currency: string): string {
  const symbol = currency === 'TRY' ? '₺' : currency === 'USD' ? '$' : '€';
  return `${symbol}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// POST handler — receives Telegram webhook updates
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify webhook secret
  const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
  if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message?.text) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  // Optionally restrict to owner's chat ID
  const ownerChatId = process.env.TAPTRACK_OWNER_TELEGRAM_CHAT_ID;
  if (ownerChatId && String(chatId) !== ownerChatId) {
    await sendMessage(chatId, 'Not authorized.');
    return NextResponse.json({ ok: true });
  }

  const supabase = createSupabaseAdminClient();

  // Resolve owner user_id from settings table (single-user app)
  const ownerId = process.env.TAPTRACK_OWNER_USER_ID;
  if (!ownerId) {
    await sendMessage(chatId, '⚠️ TAPTRACK_OWNER_USER_ID is not configured.');
    return NextResponse.json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // /balance command
  // -------------------------------------------------------------------------
  if (text === '/balance' || text === '/balance@taptrackbot') {
    const { data: balances } = await supabase
      .from('balances')
      .select('currency, method, amount')
      .eq('user_id', ownerId)
      .order('currency')
      .order('method');

    if (!balances?.length) {
      await sendMessage(chatId, 'No balances found.');
      return NextResponse.json({ ok: true });
    }

    const lines = ['💰 <b>Balances</b>'];
    for (const b of balances) {
      lines.push(`${b.currency} ${b.method}: ${formatAmount(b.amount, b.currency)}`);
    }
    await sendMessage(chatId, lines.join('\n'));
    return NextResponse.json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // /today command
  // -------------------------------------------------------------------------
  if (text === '/today' || text === '/today@taptrackbot') {
    const today = new Date().toISOString().slice(0, 10);
    const { data: txs } = await supabase
      .from('transactions')
      .select('type, amount, currency, method, title')
      .eq('user_id', ownerId)
      .eq('date', today);

    const expenses = txs?.filter((t) => t.type === 'expense') ?? [];
    const income = txs?.filter((t) => t.type === 'income') ?? [];

    const lines = [`📊 <b>Today (${today})</b>`];
    if (expenses.length === 0 && income.length === 0) {
      lines.push('No transactions today.');
    } else {
      if (expenses.length > 0) {
        lines.push('\n<b>Expenses:</b>');
        for (const t of expenses) lines.push(`  ${formatAmount(t.amount, t.currency)} ${t.currency} ${t.method} · ${t.title}`);
      }
      if (income.length > 0) {
        lines.push('\n<b>Income:</b>');
        for (const t of income) lines.push(`  ${formatAmount(t.amount, t.currency)} ${t.currency} ${t.method} · ${t.title}`);
      }
    }
    await sendMessage(chatId, lines.join('\n'));
    return NextResponse.json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // /help command
  // -------------------------------------------------------------------------
  if (text === '/help' || text === '/start') {
    await sendMessage(
      chatId,
      '📒 <b>TapTrack Bot</b>\n\n' +
        'Log transactions:\n' +
        '  <code>-120 coffee cash</code>\n' +
        '  <code>+20000 salary card</code>\n' +
        '  <code>-9.99 eur spotify</code>\n' +
        '  <code>-250 dinner -500 lunch</code>\n\n' +
        'Commands:\n' +
        '  /balance — show current balances\n' +
        '  /today — show today\'s transactions'
    );
    return NextResponse.json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // Transaction command(s)
  // -------------------------------------------------------------------------
  if (!text.startsWith('/')) {
    // Load categories for this user (fall back to defaults if none found)
    const { data: rawCategories } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', ownerId);

    const categories: Category[] = (rawCategories?.length
      ? rawCategories.map((c) => ({
          id: c.id as string,
          name: c.name as string,
          icon: c.icon as string | undefined,
          color: c.color as string | undefined,
          isDefault: c.is_default as boolean,
          type: c.type as 'income' | 'expense',
          createdAt: c.created_at as string,
          updatedAt: c.updated_at as string,
        }))
      : createDefaultCategories()) as Category[];

    const results = parseCommands(text, { categories });
    const failures = results.filter((r) => !r.ok);

    if (failures.length > 0) {
      const msgs = results.map((r, i) =>
        r.ok ? null : results.length === 1 ? r.message : `Entry ${i + 1}: ${r.message}`
      ).filter(Boolean);
      await sendMessage(chatId, `❌ ${msgs.join('\n')}`);
      return NextResponse.json({ ok: true });
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const savedLines: string[] = [];

    for (const result of results) {
      if (!result.ok) continue;
      const draft = result.transaction;
      const id = crypto.randomUUID();
      const row = {
        id,
        user_id: ownerId,
        type: draft.type,
        amount: draft.amount,
        currency: draft.currency,
        title: draft.title,
        category_id: draft.categoryId,
        method: draft.method,
        date: draft.date ?? today,
        note: draft.note ?? null,
        recurring_source_id: null,
        created_at: now,
        updated_at: now,
      };

      const { error } = await supabase.from('transactions').insert(row);
      if (error) {
        await sendMessage(chatId, `❌ Failed to save "${draft.title}": ${error.message}`);
        return NextResponse.json({ ok: true });
      }

      // Update balance
      const balanceId = `${draft.currency}-${draft.method}`;
      const delta = draft.type === 'expense' ? -draft.amount : draft.amount;
      const { data: currentBalance } = await supabase
        .from('balances')
        .select('amount')
        .eq('id', balanceId)
        .eq('user_id', ownerId)
        .single();

      const newAmount = (Number(currentBalance?.amount) || 0) + delta;
      if (newAmount < 0) {
        // Roll back the transaction just inserted
        await supabase.from('transactions').delete().eq('id', id);
        const typeStr = draft.type === 'expense' ? 'Expense' : 'Income';
        await sendMessage(
          chatId,
          `❌ ${typeStr} blocked: not enough ${draft.currency} ${draft.method} balance (${formatAmount(Math.abs(Number(currentBalance?.amount) || 0), draft.currency)} available).`
        );
        return NextResponse.json({ ok: true });
      }

      await supabase
        .from('balances')
        .update({ amount: newAmount, updated_at: now })
        .eq('id', balanceId)
        .eq('user_id', ownerId);

      const sign = draft.type === 'income' ? '+' : '-';
      savedLines.push(`${sign}${formatAmount(draft.amount, draft.currency)} ${draft.currency} · ${draft.title} · ${draft.method}`);
    }

    const header = savedLines.length === 1 ? '✅ Saved' : `✅ Saved ${savedLines.length} transactions`;
    await sendMessage(chatId, `${header}\n${savedLines.join('\n')}`);
    return NextResponse.json({ ok: true });
  }

  // Unknown command
  await sendMessage(chatId, 'Unknown command. Type /help for usage.');
  return NextResponse.json({ ok: true });
}
