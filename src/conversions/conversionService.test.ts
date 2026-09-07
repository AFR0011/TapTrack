import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { getBalanceId } from '@/defaultData';
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
  vi.useRealTimers();
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

describe('createConversion', () => {
  it('creates a conversion and updates both balances', async () => {
    await database.balances.update(getBalanceId('USD', 'card'), { amount: 100 });

    await createConversion(baseDraft, database);

    const fromBalance = await database.balances.get(getBalanceId('USD', 'card'));
    const toBalance = await database.balances.get(getBalanceId('TRY', 'cash'));

    expect(fromBalance?.amount).toBe(90);
    expect(toBalance?.amount).toBe(380);
    expect(await database.conversions.count()).toBe(1);
  });

  it('records exact ordering for current-day conversions and leaves historical ones unordered', async () => {
    vi.useFakeTimers();
    const now = new Date(2026, 4, 18, 16, 0, 0);
    vi.setSystemTime(now);
    await database.balances.update(getBalanceId('USD', 'card'), { amount: 100 });

    const current = await createConversion(baseDraft, database);

    await database.balances.update(getBalanceId('USD', 'card'), { amount: 100 });
    const historical = await createConversion({ ...baseDraft, date: '2026-05-17' }, database);

    expect(current.occurredAt).toBe(now.toISOString());
    expect(historical.occurredAt).toBeUndefined();
  });

  it('blocks conversions when source balance is insufficient', async () => {
    await expect(createConversion(baseDraft, database)).rejects.toBeInstanceOf(
      InsufficientConversionBalanceError
    );
    expect(await database.conversions.count()).toBe(0);
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
