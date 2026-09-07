import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { getBalanceId } from '@/defaultData';
import type { Currency, Method } from '@/types';
import {
  createConversion,
  InsufficientConversionBalanceError,
  InvalidConversionError,
  type ConversionDraft,
} from './conversionService';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackConversionTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

const baseDraft: ConversionDraft = {
  fromCurrency: 'USD',
  toCurrency: 'TRY',
  fromMethod: 'card',
  toMethod: 'cash',
  fromAmount: 10,
  toAmount: 380,
  date: '2026-05-18',
};

async function setOpeningBalance(currency: Currency, method: Method, amount: number) {
  const balanceId = getBalanceId(currency, method);
  const effectiveAt = '2026-01-01T00:00:00.000Z';
  await database.balanceCheckpoints.put({
    id: `opening-${balanceId}`,
    balanceId,
    currency,
    method,
    kind: 'opening',
    observedAmount: amount,
    deltaAmount: amount,
    date: '2026-01-01',
    effectiveAt,
    month: '2026-01',
    createdAt: effectiveAt,
    updatedAt: effectiveAt,
  });
}

describe('createConversion', () => {
  it('creates a conversion, rebuilds both balances, and commits sync intent', async () => {
    await setOpeningBalance('USD', 'card', 100);

    const conversion = await createConversion(baseDraft, database);

    const fromBalance = await database.balances.get(getBalanceId('USD', 'card'));
    const toBalance = await database.balances.get(getBalanceId('TRY', 'cash'));
    const queued = await database.syncOutbox.get(`conversions:${conversion.id}`);

    expect(fromBalance?.amount).toBe(90);
    expect(toBalance?.amount).toBe(380);
    expect(await database.conversions.count()).toBe(1);
    expect(queued).toMatchObject({
      tableName: 'conversions',
      operation: 'upsert',
      recordId: conversion.id,
      attempts: 0,
    });
    expect(queued?.record).toMatchObject({
      id: conversion.id,
      fromCurrency: 'USD',
      toCurrency: 'TRY',
      fromAmount: 10,
      toAmount: 380,
    });
  });

  it('records exact ordering for current-day conversions and leaves historical ones unordered', async () => {
    const now = new Date(2026, 4, 18, 16, 0, 0);
    await setOpeningBalance('USD', 'card', 100);

    const current = await createConversion(baseDraft, database, now);
    const historical = await createConversion(
      { ...baseDraft, fromAmount: 5, toAmount: 190, date: '2026-05-17' },
      database,
      now
    );

    expect(current.occurredAt).toBe(now.toISOString());
    expect(historical.occurredAt).toBeUndefined();
  });

  it('blocks conversions when source balance is insufficient without leaving sync intent', async () => {
    await expect(createConversion(baseDraft, database)).rejects.toBeInstanceOf(
      InsufficientConversionBalanceError
    );
    expect(await database.conversions.count()).toBe(0);
    expect(
      (await database.syncOutbox.toArray()).filter((item) => item.tableName === 'conversions')
    ).toEqual([]);
  });

  it('rejects non-finite conversion amounts before touching balances', async () => {
    const invalidDrafts: ConversionDraft[] = [
      { ...baseDraft, fromAmount: Number.NaN },
      { ...baseDraft, fromAmount: Number.POSITIVE_INFINITY },
      { ...baseDraft, toAmount: Number.NaN },
      { ...baseDraft, toAmount: Number.NEGATIVE_INFINITY },
    ];

    for (const draft of invalidDrafts) {
      await expect(createConversion(draft, database)).rejects.toBeInstanceOf(
        InvalidConversionError
      );
    }

    expect(await database.conversions.count()).toBe(0);
  });

  it('enforces valid same-currency transfer constraints', async () => {
    const invalidSameMethod: ConversionDraft = {
      ...baseDraft,
      fromCurrency: 'TRY',
      toCurrency: 'TRY',
      fromMethod: 'card',
      toMethod: 'card',
      fromAmount: 100,
      toAmount: 100,
    };

    await expect(createConversion(invalidSameMethod, database)).rejects.toBeInstanceOf(
      InvalidConversionError
    );

    const invalidMismatchedAmount: ConversionDraft = {
      ...invalidSameMethod,
      toMethod: 'cash',
      toAmount: 90,
    };
    await expect(createConversion(invalidMismatchedAmount, database)).rejects.toBeInstanceOf(
      InvalidConversionError
    );
  });
});
