import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RavelDatabase, ensureDatabaseSeeded } from '@/database';
import { getBalanceId } from '@/defaultData';
import { addActiveCurrency, removeActiveCurrency } from '@/currencies/currencyService';
import { completeInitialSetup } from '@/setup/setupService';
import {
  InvalidReconciliationError,
  findSameDayOrderingCheckpoint,
  getAdjustmentHistory,
  getMonthlyReconciliationState,
  reconcileCurrentMonth,
  resolveHistoricalOccurrenceAroundCheckpoint,
} from './reconciliationService';

let database: RavelDatabase;

const initialBalances = {
  TRY: { cash: 500, card: 1000 },
  USD: { cash: 20, card: 30 },
  EUR: { cash: 10, card: 15 },
};

beforeEach(async () => {
  database = new RavelDatabase(`RavelReconciliationTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
  await completeInitialSetup(
    {
      balances: initialBalances,
      monthlyBudget: 20000,
      defaultMethod: 'card',
      month: '2026-05',
    },
    database,
    new Date(2026, 4, 1, 9, 0, 0)
  );
});

afterEach(async () => {
  await database.delete();
});

describe('monthly balance reconciliation', () => {
  it('treats initial setup as the balance confirmation for that first month', async () => {
    const state = await getMonthlyReconciliationState('2026-05', database);
    expect(state.required).toBe(false);
    expect(state.completedBalanceIds).toHaveLength(6);
  });

  it('remains a pure read when observed inside a Dexie read-only transaction', async () => {
    const state = await database.transaction(
      'r',
      [database.settings, database.balances, database.balanceCheckpoints],
      () => getMonthlyReconciliationState('2026-06', database)
    );

    expect(state.required).toBe(true);
    expect(state.balances).toHaveLength(6);
    expect(state.completedBalanceIds).toEqual([]);
  });

  it('requires the first reconciliation of a new calendar month and completes all balances together', async () => {
    const before = await getMonthlyReconciliationState('2026-06', database);
    expect(before.required).toBe(true);
    expect(before.completedBalanceIds).toEqual([]);

    const observed = Object.fromEntries(before.balances.map((balance) => [balance.id, balance.amount]));
    observed[getBalanceId('TRY', 'card')] = 970;

    const now = new Date(2026, 5, 3, 10, 15, 0);
    const checkpoints = await reconcileCurrentMonth(observed, database, now);

    expect(checkpoints).toHaveLength(6);
    expect(new Set(checkpoints.map((checkpoint) => checkpoint.effectiveAt))).toEqual(
      new Set([now.toISOString()])
    );
    expect(checkpoints.every((checkpoint) => checkpoint.date === '2026-06-03')).toBe(true);
    expect(
      checkpoints.find((checkpoint) => checkpoint.balanceId === getBalanceId('TRY', 'card'))
    ).toMatchObject({
      kind: 'reconciliation',
      month: '2026-06',
      observedAmount: 970,
      deltaAmount: -30,
    });

    const checkpointIds = new Set(checkpoints.map((checkpoint) => checkpoint.id));
    const queuedCheckpoints = (await database.syncOutbox.toArray()).filter(
      (item) => item.tableName === 'balanceCheckpoints' && checkpointIds.has(item.recordId)
    );
    expect(queuedCheckpoints).toHaveLength(6);
    expect(queuedCheckpoints.every((item) => item.operation === 'upsert')).toBe(true);

    const after = await getMonthlyReconciliationState('2026-06', database);
    expect(after.required).toBe(false);
    expect(after.completedBalanceIds).toHaveLength(6);
    expect((await database.balances.get(getBalanceId('TRY', 'card')))?.amount).toBe(970);
  });

  it('reconciles only unfinished active balances when a currency was added mid-month', async () => {
    await addActiveCurrency('GBP', database, new Date(2026, 5, 2, 9, 0, 0));

    const before = await getMonthlyReconciliationState('2026-06', database);
    expect(before.required).toBe(true);
    expect(before.balances).toHaveLength(8);
    expect(new Set(before.completedBalanceIds)).toEqual(
      new Set([getBalanceId('GBP', 'cash'), getBalanceId('GBP', 'card')])
    );

    const observed = Object.fromEntries(before.balances.map((balance) => [balance.id, balance.amount]));
    const checkpoints = await reconcileCurrentMonth(
      observed,
      database,
      new Date(2026, 5, 3, 10, 0, 0)
    );

    expect(checkpoints).toHaveLength(6);
    expect(checkpoints.some((checkpoint) => checkpoint.currency === 'GBP')).toBe(false);
    const after = await getMonthlyReconciliationState('2026-06', database);
    expect(after.required).toBe(false);
    expect(after.completedBalanceIds).toHaveLength(8);
  });

  it('does not require archived currency balances to be reconciled', async () => {
    await removeActiveCurrency('EUR', database);
    const state = await getMonthlyReconciliationState('2026-06', database);

    expect(state.required).toBe(true);
    expect(state.balances).toHaveLength(4);
    expect(state.balances.some((balance) => balance.currency === 'EUR')).toBe(false);
  });

  it('records zero-difference confirmations and exposes reconciliation history separately', async () => {
    const state = await getMonthlyReconciliationState('2026-06', database);
    const observed = Object.fromEntries(state.balances.map((balance) => [balance.id, balance.amount]));

    await reconcileCurrentMonth(observed, database, new Date(2026, 5, 1, 9, 0, 0));
    const history = await getAdjustmentHistory(database);

    expect(history).toHaveLength(6);
    expect(history.every((checkpoint) => checkpoint.kind === 'reconciliation')).toBe(true);
    expect(history.every((checkpoint) => checkpoint.deltaAmount === 0)).toBe(true);
  });

  it('rejects incomplete, invalid, or repeated reconciliation', async () => {
    const state = await getMonthlyReconciliationState('2026-06', database);
    const valid = Object.fromEntries(state.balances.map((balance) => [balance.id, balance.amount]));
    const missing = { ...valid };
    delete missing[getBalanceId('EUR', 'cash')];

    await expect(
      reconcileCurrentMonth(missing, database, new Date(2026, 5, 2, 8, 0, 0))
    ).rejects.toBeInstanceOf(InvalidReconciliationError);

    const invalid = { ...valid, [getBalanceId('USD', 'cash')]: Number.NaN };
    await expect(
      reconcileCurrentMonth(invalid, database, new Date(2026, 5, 2, 8, 0, 0))
    ).rejects.toBeInstanceOf(InvalidReconciliationError);

    await reconcileCurrentMonth(valid, database, new Date(2026, 5, 2, 8, 0, 0));
    await expect(
      reconcileCurrentMonth(valid, database, new Date(2026, 5, 3, 8, 0, 0))
    ).rejects.toThrow('already been reconciled');
  });

  it('resolves ambiguous historical ordering immediately before or after a same-day checkpoint', async () => {
    const state = await getMonthlyReconciliationState('2026-06', database);
    const observed = Object.fromEntries(state.balances.map((balance) => [balance.id, balance.amount]));
    const now = new Date(2026, 5, 4, 12, 0, 0);
    await reconcileCurrentMonth(observed, database, now);

    const checkpoint = await findSameDayOrderingCheckpoint(
      '2026-06-04',
      [getBalanceId('TRY', 'card')],
      database
    );
    expect(checkpoint).not.toBeNull();

    const boundary = now.getTime();
    expect(new Date(resolveHistoricalOccurrenceAroundCheckpoint(checkpoint!, 'before')).getTime()).toBe(
      boundary - 1
    );
    expect(new Date(resolveHistoricalOccurrenceAroundCheckpoint(checkpoint!, 'after')).getTime()).toBe(
      boundary + 1
    );
  });
});
