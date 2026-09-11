import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { getBalanceId } from '@/defaultData';
import { formatLocalDate, getAutomaticOccurredAt } from '@/dates';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import type { Conversion, Currency, Method } from '@/types';
import {
  flushSyncQueueBestEffort,
  queueDeleteForSync,
  queueRecordForSync,
} from '@/sync/syncService';

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

function validateDraft(draft: ConversionDraft, nowDate: Date) {
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

  if (draft.date > formatLocalDate(nowDate)) {
    throw new InvalidConversionError(
      'Future-dated transfers and exchanges are not supported.'
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
}

function getPreviousBalanceMap(
  balances: Awaited<ReturnType<TapTrackDatabase['balances']['toArray']>>
) {
  return new Map(balances.map((balance) => [balance.id, balance.amount] as const));
}

function assertNoNegativeBalances(
  balances: Awaited<ReturnType<typeof rebuildDerivedBalances>>,
  previousBalances: Map<string, number>
) {
  const negative = balances.find((balance) => balance.amount < 0);
  if (!negative) return;

  throw new InsufficientConversionBalanceError(
    negative.currency,
    negative.method,
    previousBalances.get(negative.id) ?? 0
  );
}

/** Creates a conversion record, rebuilds balances, and queues sync intent atomically. */
export async function createConversion(
  draft: ConversionDraft,
  database: TapTrackDatabase = db,
  nowDate = new Date()
): Promise<Conversion> {
  validateDraft(draft, nowDate);

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

/** Corrects an existing transfer/exchange and rebuilds every derived balance atomically. */
export async function updateConversion(
  id: string,
  draft: ConversionDraft,
  database: TapTrackDatabase = db,
  nowDate = new Date()
): Promise<Conversion> {
  validateDraft(draft, nowDate);
  await ensureDatabaseSeeded(database);

  const now = nowDate.toISOString();
  let updatedConversion: Conversion | null = null;

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
      const existing = await database.conversions.get(id);
      if (!existing) throw new Error('Conversion not found');

      const previousBalances = getPreviousBalanceMap(await database.balances.toArray());
      const occurredAt =
        draft.occurredAt ??
        (existing.date === draft.date
          ? existing.occurredAt
          : getAutomaticOccurredAt(draft.date, nowDate));

      const nextConversion: Conversion = {
        id,
        fromCurrency: draft.fromCurrency,
        toCurrency: draft.toCurrency,
        fromMethod: draft.fromMethod,
        toMethod: draft.toMethod,
        fromAmount: draft.fromAmount,
        toAmount: draft.toAmount,
        date: draft.date,
        occurredAt,
        note: draft.note,
        createdAt: existing.createdAt,
        updatedAt: now,
      };

      await database.conversions.put(nextConversion);
      const rebuilt = await rebuildDerivedBalances(database, now);
      assertNoNegativeBalances(rebuilt, previousBalances);

      await queueRecordForSync(
        'conversions',
        nextConversion as unknown as Record<string, unknown>,
        database
      );
      updatedConversion = nextConversion;
    }
  );

  if (!updatedConversion) throw new Error('Conversion was not updated');

  void flushSyncQueueBestEffort(database);
  return updatedConversion;
}

/** Deletes a transfer/exchange only when the remaining ledger can still produce valid balances. */
export async function deleteConversion(
  id: string,
  database: TapTrackDatabase = db
): Promise<void> {
  await ensureDatabaseSeeded(database);
  const now = new Date().toISOString();

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
      const existing = await database.conversions.get(id);
      if (!existing) throw new Error('Conversion not found');

      const previousBalances = getPreviousBalanceMap(await database.balances.toArray());
      await database.conversions.delete(id);

      const rebuilt = await rebuildDerivedBalances(database, now);
      assertNoNegativeBalances(rebuilt, previousBalances);
      await queueDeleteForSync('conversions', id, database);
    }
  );

  void flushSyncQueueBestEffort(database);
}
