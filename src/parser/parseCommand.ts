import { findCategoryForTransaction } from '@/defaultData';
import { formatLocalDate } from '@/dates';
import type { Category, Currency, Method, TransactionDraft, TransactionType } from '@/types';

type ParseCommandOptions = {
  categories: Category[];
  defaultMethod?: Method;
  today?: Date;
};

export type ParseCommandSuccess = {
  ok: true;
  transaction: TransactionDraft;
};

export type ParseCommandFailure = {
  ok: false;
  message: string;
};

export type ParseCommandResult = ParseCommandSuccess | ParseCommandFailure;

const CURRENCY_TOKENS: Record<string, Currency> = {
  try: 'TRY',
  tl: 'TRY',
  '\u20ba': 'TRY',
  usd: 'USD',
  '$': 'USD',
  eur: 'EUR',
  '\u20ac': 'EUR',
};

const METHOD_TOKENS: Record<string, Method> = {
  cash: 'cash',
  card: 'card',
};

export function parseCommand(command: string, options: ParseCommandOptions): ParseCommandResult {
  const trimmed = command.trim();
  if (!trimmed) {
    return { ok: false, message: 'Enter a transaction command.' };
  }

  const match = trimmed.match(/^([+-])\s*(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) {
    return { ok: false, message: 'Use + or - followed by an amount, title, and optional method.' };
  }

  const [, sign, amountToken, rawRemainder] = match;
  const amount = Number.parseFloat(amountToken.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: 'Amount must be greater than zero.' };
  }

  const tokens = rawRemainder.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { ok: false, message: 'Add a short title after the amount.' };
  }

  const firstToken = tokens[0]?.toLowerCase();
  const currency = firstToken && CURRENCY_TOKENS[firstToken] ? CURRENCY_TOKENS[firstToken] : 'TRY';
  if (firstToken && CURRENCY_TOKENS[firstToken]) {
    tokens.shift();
  }

  const lastToken = tokens.at(-1)?.toLowerCase();
  const method = lastToken && METHOD_TOKENS[lastToken] ? METHOD_TOKENS[lastToken] : options.defaultMethod ?? 'card';
  if (lastToken && METHOD_TOKENS[lastToken]) {
    tokens.pop();
  }

  const title = tokens.join(' ').trim();
  if (!title) {
    return { ok: false, message: 'Add a short title after the amount.' };
  }

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

/**
 * Splits an input string containing one or more command entries (e.g.
 * "-250 dinner -500 lunch +300 loan") and parses each one individually.
 * A single-entry input returns a one-element array, preserving full
 * backward compatibility with callers that do `parseCommands(input)[0]`.
 */
export function parseCommands(input: string, options: ParseCommandOptions): ParseCommandResult[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return [{ ok: false, message: 'Enter a transaction command.' }];
  }
  // Split before every +/- followed immediately by a digit, except at position 0
  const segments = trimmed
    .split(/\s+(?=[-+]\d)/)
    .map((s) => s.trim())
    .filter(Boolean);
  return segments.map((segment) => parseCommand(segment, options));
}
