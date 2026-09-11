import { db, ensureDatabaseSeeded, type RavelDatabase } from '@/database';
import { DEFAULT_SETTINGS_ID, getBalanceId } from '@/defaultData';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { normalizeCurrencyCode } from '@/currencies/currencyCatalog';
import { flushSyncQueueBestEffort, queueRecordForSync } from '@/sync/syncService';
import type { Balance, BalanceCheckpoint, Currency, Method, Settings } from '@/types';
import { SUPPORTED_METHODS } from '@/types';

function deriveActiveCurrencies(
  settings: Settings,
  balances: Array<Pick<Balance, 'currency'>>
): Currency[] {
  const source = settings.activeCurrencies?.length
    ? settings.activeCurrencies
    : balances.map((balance) => balance.currency);
  const normalized = source
    .map(normalizeCurrencyCode)
    .filter((currency): currency is Currency => Boolean(currency));
  return [...new Set([settings.defaultCurrency, ...normalized])];
}

export async function addActiveCurrency(
  currencyInput: Currency,
  database: RavelDatabase = db,
  nowDate = new Date()
): Promise<Currency> {
  await ensureDatabaseSeeded(database);
  const currency = normalizeCurrencyCode(currencyInput);
  if (!currency) throw new Error('Choose a valid currency.');

  const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
  if (!settings) throw new Error('Settings are not available.');
  const existingBalances = await database.balances.where('currency').equals(currency).toArray();
  const allBalances = await database.balances.toArray();
  const activeCurrencies = deriveActiveCurrencies(settings, allBalances);
  const alreadyActive = activeCurrencies.includes(currency);
  if (alreadyActive && existingBalances.length > 0) return currency;

  const now = nowDate.toISOString();
  const date = formatLocalDate(nowDate);
  const month = getCurrentMonth(nowDate);
  const balances: Balance[] =
    existingBalances.length > 0
      ? []
      : SUPPORTED_METHODS.map((method) => ({
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
  const nextSettings: Settings = {
    ...settings,
    activeCurrencies: [...new Set([...activeCurrencies, currency])],
    updatedAt: now,
  };

  await database.transaction(
    'rw',
    [database.balances, database.balanceCheckpoints, database.settings, database.syncOutbox],
    async () => {
      if (balances.length > 0) await database.balances.bulkPut(balances);
      if (checkpoints.length > 0) await database.balanceCheckpoints.bulkPut(checkpoints);
      await database.settings.put(nextSettings);
      for (const checkpoint of checkpoints) {
        await queueRecordForSync(
          'balanceCheckpoints',
          checkpoint as unknown as Record<string, unknown>,
          database
        );
      }
      await queueRecordForSync(
        'settings',
        nextSettings as unknown as Record<string, unknown>,
        database
      );
    }
  );
  void flushSyncQueueBestEffort(database);
  return currency;
}

export async function removeActiveCurrency(
  currencyInput: Currency,
  database: RavelDatabase = db
): Promise<Settings> {
  await ensureDatabaseSeeded(database);
  const currency = normalizeCurrencyCode(currencyInput);
  if (!currency) throw new Error('Choose a valid currency.');

  const balances = await database.balances.toArray();
  let result: Settings | null = null;

  await database.transaction(
    'rw',
    [database.settings, database.recurringTransactions, database.syncOutbox],
    async () => {
      const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
      if (!settings) throw new Error('Settings are not available.');
      if (currency === settings.defaultCurrency) {
        throw new Error('Choose a different default currency before removing this one.');
      }

      const activeCurrencies = deriveActiveCurrencies(settings, balances);
      const nextActiveCurrencies = activeCurrencies.filter((code) => code !== currency);
      if (nextActiveCurrencies.length === activeCurrencies.length) {
        result = settings;
        return;
      }

      const activeRecurringCount = await database.recurringTransactions
        .filter((item) => item.isActive && item.currency === currency)
        .count();
      if (activeRecurringCount > 0) {
        throw new Error(
          `Pause or move active recurring rules in ${currency} before removing this currency.`
        );
      }

      const next: Settings = {
        ...settings,
        activeCurrencies: nextActiveCurrencies,
        updatedAt: new Date().toISOString(),
      };
      await database.settings.put(next);
      await queueRecordForSync('settings', next as unknown as Record<string, unknown>, database);
      result = next;
    }
  );

  if (!result) throw new Error('Currency was not removed.');
  void flushSyncQueueBestEffort(database);
  return result;
}

export async function setDefaultCurrency(
  currencyInput: Currency,
  database: RavelDatabase = db
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
    const balances = await database.balances.toArray();
    const activeCurrencies = deriveActiveCurrencies(settings, balances);
    const next: Settings = {
      ...settings,
      defaultCurrency: currency,
      activeCurrencies: [...new Set([currency, ...activeCurrencies])],
      updatedAt: now,
    };
    await database.settings.put(next);
    await queueRecordForSync('settings', next as unknown as Record<string, unknown>, database);
    result = next;
  });
  if (!result) throw new Error('Default currency was not updated.');
  void flushSyncQueueBestEffort(database);
  return result;
}

export async function getActiveCurrencies(database: RavelDatabase = db): Promise<Currency[]> {
  await ensureDatabaseSeeded(database);
  const [settings, balances] = await Promise.all([
    database.settings.get(DEFAULT_SETTINGS_ID),
    database.balances.toArray(),
  ]);
  if (!settings) return [...new Set(balances.map((balance) => balance.currency))].sort();
  const active = deriveActiveCurrencies(settings, balances);
  return active.sort((a, b) => {
    if (a === settings.defaultCurrency) return -1;
    if (b === settings.defaultCurrency) return 1;
    return a.localeCompare(b);
  });
}

export function balanceIdFor(currency: Currency, method: Method): string {
  return getBalanceId(currency, method);
}
