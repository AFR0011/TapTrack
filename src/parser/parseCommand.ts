import { findCategoryForTransaction } from '@/defaultData';
import { formatLocalDate } from '@/dates';
import type { Category, Currency, Method, TransactionDraft, TransactionType } from '@/types';

type ParseCommandOptions = {
  categories: Category[];
  defaultMethod?: Method;
  defaultCurrency?: Currency;
  activeCurrencies?: Currency[];
  today?: Date;
};

export type ParseCommandSuccess = { ok: true; transaction: TransactionDraft };
export type ParseCommandFailure = { ok: false; message: string };
export type ParseCommandResult = ParseCommandSuccess | ParseCommandFailure;

const CURRENCY_TOKENS: Record<string, Currency> = {
  try: 'TRY', tl: 'TRY', '\u20ba': 'TRY', usd: 'USD', '$': 'USD', eur: 'EUR', '\u20ac': 'EUR',
};
const METHOD_TOKENS: Record<string, Method> = { cash: 'cash', card: 'card' };

export function parseCommand(command: string, options: ParseCommandOptions): ParseCommandResult {
  const trimmed = command.trim();
  if (!trimmed) return { ok: false, message: 'Enter a transaction command.' };

  const match = trimmed.match(/^([+-])\s*(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return { ok: false, message: 'Use + or - followed by an amount, title, and optional method.' };

  const [, sign, amountToken, rawRemainder] = match;
  const amount = Number.parseFloat(amountToken.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: 'Amount must be greater than zero.' };

  const tokens = rawRemainder.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, message: 'Add a short title after the amount.' };

  const activeCurrencies = new Set((options.activeCurrencies ?? []).map((code) => code.toUpperCase()));
  const firstToken = tokens[0]?.toLowerCase();
  const explicitCurrency = firstToken
    ? CURRENCY_TOKENS[firstToken] ?? (/^[a-z]{3}$/.test(firstToken) && activeCurrencies.has(firstToken.toUpperCase()) ? firstToken.toUpperCase() : undefined)
    : undefined;
  const currency = explicitCurrency ?? options.defaultCurrency ?? 'TRY';
  if (explicitCurrency) tokens.shift();

  const lastToken = tokens.at(-1)?.toLowerCase();
  const method = lastToken && METHOD_TOKENS[lastToken] ? METHOD_TOKENS[lastToken] : options.defaultMethod ?? 'card';
  if (lastToken && METHOD_TOKENS[lastToken]) tokens.pop();

  const title = tokens.join(' ').trim();
  if (!title) return { ok: false, message: 'Add a short title after the amount.' };

  const type: TransactionType = sign === '+' ? 'income' : 'expense';
  const category = findCategoryForTransaction(options.categories, type, title);
  return {
    ok: true,
    transaction: {
      type,
      amount,
      currency,
      title,
      categoryId: category?.id ?? (type === 'income' ? 'cat-income' : 'cat-other'),
      method,
      date: formatLocalDate(options.today ?? new Date()),
    },
  };
}

export function parseCommands(input: string, options: ParseCommandOptions): ParseCommandResult[] {
  const trimmed = input.trim();
  if (!trimmed) return [{ ok: false, message: 'Enter a transaction command.' }];
  const segments = trimmed.split(/\s+(?=[-+]\d)/).map((s) => s.trim()).filter(Boolean);
  return segments.map((segment) => parseCommand(segment, options));
}
