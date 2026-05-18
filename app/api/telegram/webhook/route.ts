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

function getBalanceId(currency: string, method: string): string {
  return `${currency}-${method}`;
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
        for (const t of expenses) {
          lines.push(`  -${formatAmount(t.amount, t.currency)} ${t.method} · ${t.title}`);
        }
      }
      if (income.length > 0) {
        lines.push('\n<b>Income:</b>');
        for (const t of income) {
          lines.push(`  +${formatAmount(t.amount, t.currency)} ${t.method} · ${t.title}`);
        }
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
    const drafts = results.filter((result) => result.ok).map((result) => result.transaction);
    const { data: existingBalances, error: balancesReadError } = await supabase
      .from('balances')
      .select('id, amount')
      .eq('user_id', ownerId);
    if (balancesReadError) {
      await sendMessage(chatId, `❌ Failed to load balances: ${balancesReadError.message}`);
      return NextResponse.json({ ok: true });
    }

    const originalBalances = new Map(
      (existingBalances ?? []).map((balance) => [balance.id as string, Number(balance.amount) || 0])
    );
    const nextBalances = new Map(originalBalances);
    const touchedBalanceIds = new Set<string>();

    for (const draft of drafts) {
      const balanceId = getBalanceId(draft.currency, draft.method);
      const currentAmount = nextBalances.get(balanceId) ?? 0;
      const delta = draft.type === 'expense' ? -draft.amount : draft.amount;
      const nextAmount = currentAmount + delta;
      if (nextAmount < 0) {
        await sendMessage(
          chatId,
          `❌ ${draft.type === 'expense' ? 'Expense' : 'Income'} blocked: not enough ${draft.currency} ${draft.method} balance (${formatAmount(currentAmount, draft.currency)} available).`
        );
        return NextResponse.json({ ok: true });
      }
      nextBalances.set(balanceId, nextAmount);
      touchedBalanceIds.add(balanceId);
    }

    const insertedTransactionIds: string[] = [];
    for (const draft of drafts) {
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

      const { error: insertError } = await supabase.from('transactions').insert(row);
      if (insertError) {
        if (insertedTransactionIds.length > 0) {
          await supabase.from('transactions').delete().in('id', insertedTransactionIds);
        }
        await sendMessage(chatId, `❌ Failed to save "${draft.title}": ${insertError.message}`);
        return NextResponse.json({ ok: true });
      }

      insertedTransactionIds.push(id);
      const sign = draft.type === 'income' ? '+' : '-';
      savedLines.push(`${sign}${formatAmount(draft.amount, draft.currency)} · ${draft.title} · ${draft.method}`);
    }

    const balanceRows = [...touchedBalanceIds].map((balanceId) => {
      const [currency, method] = balanceId.split('-');
      return {
        id: balanceId,
        user_id: ownerId,
        currency,
        method,
        amount: nextBalances.get(balanceId) ?? 0,
        updated_at: now,
      };
    });

    if (balanceRows.length > 0) {
      const { error: upsertBalanceError } = await supabase
        .from('balances')
        .upsert(balanceRows, { onConflict: 'id' });

      if (upsertBalanceError) {
        if (insertedTransactionIds.length > 0) {
          await supabase.from('transactions').delete().in('id', insertedTransactionIds);
        }

        const rollbackUpserts = [...touchedBalanceIds]
          .filter((balanceId) => originalBalances.has(balanceId))
          .map((balanceId) => {
            const [currency, method] = balanceId.split('-');
            return {
              id: balanceId,
              user_id: ownerId,
              currency,
              method,
              amount: originalBalances.get(balanceId) ?? 0,
              updated_at: now,
            };
          });
        const rollbackDeletes = [...touchedBalanceIds].filter(
          (balanceId) => !originalBalances.has(balanceId)
        );

        if (rollbackUpserts.length > 0) {
          await supabase.from('balances').upsert(rollbackUpserts, { onConflict: 'id' });
        }
        if (rollbackDeletes.length > 0) {
          await supabase.from('balances').delete().in('id', rollbackDeletes).eq('user_id', ownerId);
        }

        await sendMessage(chatId, `❌ Failed to update balances: ${upsertBalanceError.message}`);
        return NextResponse.json({ ok: true });
      }
    }

    const header = savedLines.length === 1 ? '✅ Saved' : `✅ Saved ${savedLines.length} transactions`;
    await sendMessage(chatId, `${header}\n${savedLines.join('\n')}`);
    return NextResponse.json({ ok: true });
  }

  // Unknown command
  await sendMessage(chatId, 'Unknown command. Type /help for usage.');
  return NextResponse.json({ ok: true });
}
