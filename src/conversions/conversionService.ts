import { db, type TapTrackDatabase } from '@/database';
import { getBalanceId } from '@/defaultData';
import type { Conversion, Currency, Method } from '@/types';
import { pushRecord } from '@/sync/syncService';

export interface ConversionDraft {
  fromCurrency: Currency;
  toCurrency: Currency;
  fromMethod: Method;
  toMethod: Method;
  fromAmount: number;
  toAmount: number;
  date: string;
  note?: string;
}

export class InsufficientConversionBalanceError extends Error {
  constructor(currency: Currency, method: Method, available: number) {
    super(`Not enough ${currency} ${method} balance (available: ${available.toFixed(2)}).`);
    this.name = 'InsufficientConversionBalanceError';
  }
}

export class InvalidConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidConversionError';
  }
}

/**
 * Creates a currency exchange or card-to-cash transfer record atomically.
 *
 * - Deducts `fromAmount` from the source balance (fromCurrency + fromMethod).
 * - Adds `toAmount` to the destination balance (toCurrency + toMethod).
 * - Rejects if the source balance would go negative.
 */
export async function createConversion(
  draft: ConversionDraft,
  database: TapTrackDatabase = db
): Promise<Conversion> {
  if (draft.fromAmount <= 0 || draft.toAmount <= 0) {
    throw new InvalidConversionError('Conversion amounts must be greater than zero.');
  }

  const isTransfer = draft.fromCurrency === draft.toCurrency;
  if (isTransfer && draft.fromMethod === draft.toMethod) {
    throw new InvalidConversionError('Source and destination method must differ for a transfer.');
  }

  if (isTransfer && Math.abs(draft.fromAmount - draft.toAmount) > 0.000001) {
    throw new InvalidConversionError(
      'For same-currency transfers, source and destination amounts must match.'
    );
  }

  const now = new Date().toISOString();

  const conversion: Conversion = {
    id: crypto.randomUUID(),
    fromCurrency: draft.fromCurrency,
    toCurrency: draft.toCurrency,
    fromMethod: draft.fromMethod,
    toMethod: draft.toMethod,
    fromAmount: draft.fromAmount,
    toAmount: draft.toAmount,
    date: draft.date,
    note: draft.note,
    createdAt: now,
  };

  await database.transaction('rw', database.conversions, database.balances, async () => {
    const fromId = getBalanceId(draft.fromCurrency, draft.fromMethod);
    const toId = getBalanceId(draft.toCurrency, draft.toMethod);

    const fromBalance = await database.balances.get(fromId);
    const toBalance = await database.balances.get(toId);

    if (!fromBalance) {
      throw new InsufficientConversionBalanceError(draft.fromCurrency, draft.fromMethod, 0);
    }
    if (fromBalance.amount < draft.fromAmount) {
      throw new InsufficientConversionBalanceError(
        draft.fromCurrency,
        draft.fromMethod,
        fromBalance.amount
      );
    }

    const updatedFromBalance = {
      ...fromBalance,
      amount: fromBalance.amount - draft.fromAmount,
      updatedAt: now,
    };
    await database.balances.put(updatedFromBalance);

    let updatedToBalance: {
      id: string;
      currency: Currency;
      method: Method;
      amount: number;
      updatedAt: string;
    };
    if (toBalance) {
      updatedToBalance = {
        ...toBalance,
        amount: toBalance.amount + draft.toAmount,
        updatedAt: now,
      };
      await database.balances.put(updatedToBalance);
    } else {
      updatedToBalance = {
        id: toId,
        currency: draft.toCurrency,
        method: draft.toMethod,
        amount: draft.toAmount,
        updatedAt: now,
      };
      await database.balances.put(updatedToBalance);
    }

    await database.conversions.add(conversion);

    // Push records after all writes in the transaction
    void pushRecord('conversions', conversion as unknown as Record<string, unknown>);
    void pushRecord('balances', updatedFromBalance as unknown as Record<string, unknown>);
    void pushRecord('balances', updatedToBalance as unknown as Record<string, unknown>);
  });

  return conversion;
}
