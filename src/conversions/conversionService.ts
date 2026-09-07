import { db, type TapTrackDatabase } from '@/database';
import { getBalanceId } from '@/defaultData';
import { getAutomaticOccurredAt } from '@/dates';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import type { Conversion, Currency, Method } from '@/types';
import { flushSyncQueueBestEffort, queueRecordForSync } from '@/sync/syncService';

export interface ConversionDraft {
  fromCurrency: Currency;
  toCurrency: Currency;
  fromMethod: Method;
  toMethod: Method;
  fromAmount: number;
  toAmount: number;
  date: string;
  occurredAt?: string;
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

/** Creates a conversion record, rebuilds balances, and queues sync intent atomically. */
export async function createConversion(
  draft: ConversionDraft,
  database: TapTrackDatabase = db,
  nowDate = new Date()
): Promise<Conversion> {
  if (
    !Number.isFinite(draft.fromAmount) ||
    !Number.isFinite(draft.toAmount) ||
    draft.fromAmount <= 0 ||
    draft.toAmount <= 0
  ) {
    throw new InvalidConversionError(
      'Conversion amounts must be finite numbers greater than zero.'
    );
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

  const now = nowDate.toISOString();
  const conversion: Conversion = {
    id: crypto.randomUUID(),
    fromCurrency: draft.fromCurrency,
    toCurrency: draft.toCurrency,
    fromMethod: draft.fromMethod,
    toMethod: draft.toMethod,
    fromAmount: draft.fromAmount,
    toAmount: draft.toAmount,
    date: draft.date,
    occurredAt: draft.occurredAt ?? getAutomaticOccurredAt(draft.date, nowDate),
    note: draft.note,
    createdAt: now,
    updatedAt: now,
  };

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.conversions,
      database.balanceCheckpoints,
      database.balances,
      database.syncOutbox,
    ],
    async () => {
      const sourceId = getBalanceId(draft.fromCurrency, draft.fromMethod);
      const previousSource = await database.balances.get(sourceId);

      await database.conversions.add(conversion);
      const rebuilt = await rebuildDerivedBalances(database, now);
      const source = rebuilt.find((balance) => balance.id === sourceId);
      if (source && source.amount < 0) {
        throw new InsufficientConversionBalanceError(
          draft.fromCurrency,
          draft.fromMethod,
          previousSource?.amount ?? 0
        );
      }

      await queueRecordForSync(
        'conversions',
        conversion as unknown as Record<string, unknown>,
        database
      );
    }
  );

  void flushSyncQueueBestEffort(database);
  return conversion;
}
