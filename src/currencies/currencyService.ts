import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { DEFAULT_SETTINGS_ID, getBalanceId } from '@/defaultData';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { normalizeCurrencyCode } from '@/currencies/currencyCatalog';
import { flushSyncQueueBestEffort, queueRecordForSync } from '@/sync/syncService';
import type { Balance, BalanceCheckpoint, Currency, Method, Settings } from '@/types';
import { SUPPORTED_METHODS } from '@/types';

export async function addActiveCurrency(
  currencyInput: Currency,
  database: TapTrackDatabase = db,
  nowDate = new Date()
): Promise<Currency> {
  await ensureDatabaseSeeded(database);
  const currency = normalizeCurrencyCode(currencyInput);
  if (!currency) throw new Error('Choose a valid currency.');

  const existing = await database.balances.where('currency').equals(currency).toArray();
  if (existing.length > 0) return currency;

  const now = nowDate.toISOString();
  const date = formatLocalDate(nowDate);
  const month = getCurrentMonth(nowDate);
  const balances: Balance[] = SUPPORTED_METHODS.map((method) => ({
    id: getBalanceId(currency, method),
    currency,
    method,
    amount: 0,
    updatedAt: now,
  }));
  const checkpoints: BalanceCheckpoint[] = balances.map((balance) => ({
    id: `opening-${balance.id}`,
    balanceId: balance.id,
    currency,
    method: balance.method,
    kind: 'opening',
    observedAmount: 0,
    deltaAmount: 0,
    date,
    effectiveAt: now,
    month,
    createdAt: now,
    updatedAt: now,
  }));

  await database.transaction(
    'rw',
    [database.balances, database.balanceCheckpoints, database.syncOutbox],
    async () => {
      await database.balances.bulkPut(balances);
      await database.balanceCheckpoints.bulkPut(checkpoints);
      for (const checkpoint of checkpoints) {
        await queueRecordForSync('balanceCheckpoints', checkpoint as unknown as Record<string, unknown>, database);
      }
    }
  );
  void flushSyncQueueBestEffort(database);
  return currency;
}

export async function setDefaultCurrency(
  currencyInput: Currency,
  database: TapTrackDatabase = db
): Promise<Settings> {
  await ensureDatabaseSeeded(database);
  const currency = normalizeCurrencyCode(currencyInput);
  if (!currency) throw new Error('Choose a valid currency.');
  const hasCurrency = (await database.balances.where('currency').equals(currency).count()) > 0;
  if (!hasCurrency) throw new Error('Add this currency before making it your default.');

  const now = new Date().toISOString();
  let result: Settings | null = null;
  await database.transaction('rw', [database.settings, database.syncOutbox], async () => {
    const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
    if (!settings) throw new Error('Settings are not available.');
    const next: Settings = { ...settings, defaultCurrency: currency, updatedAt: now };
    await database.settings.put(next);
    await queueRecordForSync('settings', next as unknown as Record<string, unknown>, database);
    result = next;
  });
  if (!result) throw new Error('Default currency was not updated.');
  void flushSyncQueueBestEffort(database);
  return result;
}

export async function getActiveCurrencies(database: TapTrackDatabase = db): Promise<Currency[]> {
  await ensureDatabaseSeeded(database);
  const balances = await database.balances.toArray();
  return [...new Set(balances.map((balance) => balance.currency))].sort();
}

export function balanceIdFor(currency: Currency, method: Method): string {
  return getBalanceId(currency, method);
}
