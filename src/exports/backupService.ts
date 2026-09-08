import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { DEFAULT_SETTINGS_ID, getBalanceId } from '@/defaultData';
import { formatLocalDate } from '@/dates';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import {
  RECURRING_FREQUENCIES,
  SUPPORTED_CURRENCIES,
  SUPPORTED_METHODS,
  TRANSACTION_TYPES,
  type Balance,
  type BalanceCheckpoint,
  type Category,
  type CategoryBudget,
  type Conversion,
  type MonthlyBudget,
  type RecurringTransaction,
  type Settings,
  type Transaction,
} from '@/types';

export const TAPTRACK_BACKUP_FORMAT = 'taptrack-backup';
export const TAPTRACK_BACKUP_VERSION = 2 as const;

const DEVICE_LEDGER_BINDING_ID = 'ledger-binding';
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const MAX_RECORDS_PER_TABLE = 100_000;
const MAX_ID_LENGTH = 200;
const MAX_TITLE_LENGTH = 500;
const MAX_NOTE_LENGTH = 5_000;
const MAX_CATEGORY_NAME_LENGTH = 200;

type BackupSource = 'v2' | 'legacy';
type UnknownRow = Record<string, unknown>;

type CanonicalBackupData = {
  transactions: Transaction[];
  balanceCheckpoints: BalanceCheckpoint[];
  categories: Category[];
  monthlyBudgets: MonthlyBudget[];
  categoryBudgets: CategoryBudget[];
  recurringTransactions: RecurringTransaction[];
  conversions: Conversion[];
  settings: Settings[];
};

export type TapTrackBackupV2 = CanonicalBackupData & {
  format: typeof TAPTRACK_BACKUP_FORMAT;
  version: typeof TAPTRACK_BACKUP_VERSION;
  exportedAt: string;
};

export type RestoreBackupResult = {
  source: BackupSource;
  legacyMigrated: boolean;
  safetyBackup: string;
  restoredRecordCount: number;
};

export type RestoreBackupOptions = {
  /** Called after the incoming backup and current local safety backup are ready, but before replacement starts. */
  beforeReplace?: (safetyBackup: string) => void | Promise<void>;
  /** Test seam for deterministic legacy checkpoint creation and exportedAt. */
  now?: Date;
};

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export async function exportBackupJSON(
  database: TapTrackDatabase = db,
  now = new Date()
): Promise<string> {
  const backup = await createBackup(database, now);
  return JSON.stringify(backup, null, 2);
}

export async function createBackup(
  database: TapTrackDatabase = db,
  now = new Date()
): Promise<TapTrackBackupV2> {
  await ensureDatabaseSeeded(database);

  const [
    transactions,
    balanceCheckpoints,
    categories,
    monthlyBudgets,
    categoryBudgets,
    recurringTransactions,
    conversions,
    settings,
  ] = await Promise.all([
    database.transactions.toArray(),
    database.balanceCheckpoints.toArray(),
    database.categories.toArray(),
    database.monthlyBudgets.toArray(),
    database.categoryBudgets.toArray(),
    database.recurringTransactions.toArray(),
    database.conversions.toArray(),
    database.settings.toArray(),
  ]);

  return {
    format: TAPTRACK_BACKUP_FORMAT,
    version: TAPTRACK_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    transactions: sortById(transactions),
    balanceCheckpoints: sortById(balanceCheckpoints),
    categories: sortById(categories),
    monthlyBudgets: sortById(monthlyBudgets),
    categoryBudgets: sortById(categoryBudgets),
    recurringTransactions: sortById(recurringTransactions),
    conversions: sortById(conversions),
    settings: sortById(settings),
  };
}

export async function restoreBackupJSON(
  jsonData: string,
  database: TapTrackDatabase = db,
  options: RestoreBackupOptions = {}
): Promise<RestoreBackupResult> {
  if (new TextEncoder().encode(jsonData).byteLength > MAX_BACKUP_BYTES) {
    throw new BackupValidationError('Backup is too large to restore safely.');
  }

  const binding = await database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID);
  if (binding) {
    throw new Error(
      'Restore is temporarily disabled for a cloud-linked ledger until device-only versus account-wide restore behavior is selected.'
    );
  }

  const now = options.now ?? new Date();
  const normalized = parseAndValidateBackup(jsonData, now);
  const safetyBackup = await exportBackupJSON(database, now);

  await options.beforeReplace?.(safetyBackup);

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.balances,
      database.balanceCheckpoints,
      database.categories,
      database.monthlyBudgets,
      database.categoryBudgets,
      database.recurringTransactions,
      database.conversions,
      database.settings,
      database.syncOutbox,
    ],
    async () => {
      await Promise.all([
        database.transactions.clear(),
        database.balances.clear(),
        database.balanceCheckpoints.clear(),
        database.categories.clear(),
        database.monthlyBudgets.clear(),
        database.categoryBudgets.clear(),
        database.recurringTransactions.clear(),
        database.conversions.clear(),
        database.settings.clear(),
        database.syncOutbox.clear(),
      ]);

      if (normalized.data.transactions.length) {
        await database.transactions.bulkPut(normalized.data.transactions);
      }
      if (normalized.data.balanceCheckpoints.length) {
        await database.balanceCheckpoints.bulkPut(normalized.data.balanceCheckpoints);
      }
      if (normalized.data.categories.length) {
        await database.categories.bulkPut(normalized.data.categories);
      }
      if (normalized.data.monthlyBudgets.length) {
        await database.monthlyBudgets.bulkPut(normalized.data.monthlyBudgets);
      }
      if (normalized.data.categoryBudgets.length) {
        await database.categoryBudgets.bulkPut(normalized.data.categoryBudgets);
      }
      if (normalized.data.recurringTransactions.length) {
        await database.recurringTransactions.bulkPut(normalized.data.recurringTransactions);
      }
      if (normalized.data.conversions.length) {
        await database.conversions.bulkPut(normalized.data.conversions);
      }
      if (normalized.data.settings.length) {
        await database.settings.bulkPut(normalized.data.settings);
      }

      await rebuildDerivedBalances(database, now.toISOString());
    }
  );

  return {
    source: normalized.source,
    legacyMigrated: normalized.source === 'legacy',
    safetyBackup,
    restoredRecordCount: countCanonicalRecords(normalized.data),
  };
}

function parseAndValidateBackup(
  jsonData: string,
  now: Date
): { source: BackupSource; data: CanonicalBackupData } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonData) as unknown;
  } catch {
    throw new BackupValidationError('Backup is not valid JSON.');
  }

  const root = requireObject(parsed, 'backup');
  if ('format' in root || 'version' in root) {
    if (root.format !== TAPTRACK_BACKUP_FORMAT) {
      throw new BackupValidationError('This file is not a TapTrack backup.');
    }
    if (root.version !== TAPTRACK_BACKUP_VERSION) {
      throw new BackupValidationError(
        `Unsupported TapTrack backup version: ${String(root.version)}.`
      );
    }
    requireTimestamp(root.exportedAt, 'backup.exportedAt');
    const data = validateCanonicalData(root);
    validateRelationships(data);
    return { source: 'v2', data };
  }

  const legacy = validateLegacyData(root);
  const data = migrateLegacyBackup(legacy, now);
  validateRelationships(data);
  return { source: 'legacy', data };
}

function validateCanonicalData(root: UnknownRow): CanonicalBackupData {
  return {
    transactions: validateArray(root.transactions, 'transactions', validateTransaction),
    balanceCheckpoints: validateArray(
      root.balanceCheckpoints,
      'balanceCheckpoints',
      validateBalanceCheckpoint
    ),
    categories: validateArray(root.categories, 'categories', validateCategory),
    monthlyBudgets: validateArray(root.monthlyBudgets, 'monthlyBudgets', validateMonthlyBudget),
    categoryBudgets: validateArray(root.categoryBudgets, 'categoryBudgets', validateCategoryBudget),
    recurringTransactions: validateArray(
      root.recurringTransactions,
      'recurringTransactions',
      validateRecurringTransaction
    ),
    conversions: validateArray(root.conversions, 'conversions', validateConversion),
    settings: validateArray(root.settings, 'settings', validateSettings),
  };
}

type LegacyBackupData = Omit<CanonicalBackupData, 'balanceCheckpoints'> & {
  balances: Balance[];
};

function validateLegacyData(root: UnknownRow): LegacyBackupData {
  const data: LegacyBackupData = {
    transactions: validateArray(root.transactions, 'transactions', validateTransaction),
    balances: validateArray(root.balances, 'balances', validateBalance),
    categories: validateArray(root.categories, 'categories', validateCategory),
    monthlyBudgets: validateArray(root.monthlyBudgets, 'monthlyBudgets', validateMonthlyBudget),
    categoryBudgets: validateArray(root.categoryBudgets, 'categoryBudgets', validateCategoryBudget),
    recurringTransactions: validateArray(
      root.recurringTransactions,
      'recurringTransactions',
      validateRecurringTransaction
    ),
    conversions: validateArray(root.conversions, 'conversions', validateConversion),
    settings: validateArray(root.settings, 'settings', validateSettings),
  };

  assertUniqueIds('balances', data.balances);
  const expectedBalanceIds = getExpectedBalanceIds();
  const actualBalanceIds = new Set(data.balances.map((balance) => balance.id));
  if (
    data.balances.length !== expectedBalanceIds.size ||
    [...expectedBalanceIds].some((id) => !actualBalanceIds.has(id))
  ) {
    throw new BackupValidationError(
      'Legacy backup must contain exactly one saved balance for every supported currency and payment method.'
    );
  }

  return data;
}

function migrateLegacyBackup(legacy: LegacyBackupData, now: Date): CanonicalBackupData {
  const maxActivityTime = getLegacyActivityCutoff(legacy);
  const effectiveTime = Math.max(now.getTime(), maxActivityTime + 1);
  const effectiveDate = new Date(effectiveTime);
  const effectiveAt = effectiveDate.toISOString();
  const date = formatLocalDate(effectiveDate);
  const month = date.slice(0, 7);

  const balanceCheckpoints: BalanceCheckpoint[] = legacy.balances.map((balance) => ({
    id: `opening-${balance.id}`,
    balanceId: balance.id,
    currency: balance.currency,
    method: balance.method,
    kind: 'opening',
    observedAmount: balance.amount,
    deltaAmount: balance.amount,
    date,
    effectiveAt,
    month,
    createdAt: effectiveAt,
    updatedAt: effectiveAt,
  }));

  return {
    transactions: legacy.transactions,
    balanceCheckpoints,
    categories: legacy.categories,
    monthlyBudgets: legacy.monthlyBudgets,
    categoryBudgets: legacy.categoryBudgets,
    recurringTransactions: legacy.recurringTransactions,
    conversions: legacy.conversions,
    settings: legacy.settings,
  };
}

function getLegacyActivityCutoff(legacy: LegacyBackupData): number {
  let latest = 0;
  const timestamps: string[] = [];

  for (const transaction of legacy.transactions) {
    timestamps.push(transaction.createdAt, transaction.updatedAt);
    if (transaction.occurredAt) timestamps.push(transaction.occurredAt);
  }
  for (const conversion of legacy.conversions) {
    timestamps.push(conversion.createdAt);
    if (conversion.updatedAt) timestamps.push(conversion.updatedAt);
    if (conversion.occurredAt) timestamps.push(conversion.occurredAt);
  }

  for (const timestamp of timestamps) {
    latest = Math.max(latest, new Date(timestamp).getTime());
  }
  return latest;
}

function validateRelationships(data: CanonicalBackupData): void {
  assertUniqueIds('transactions', data.transactions);
  assertUniqueIds('balanceCheckpoints', data.balanceCheckpoints);
  assertUniqueIds('categories', data.categories);
  assertUniqueIds('monthlyBudgets', data.monthlyBudgets);
  assertUniqueIds('categoryBudgets', data.categoryBudgets);
  assertUniqueIds('recurringTransactions', data.recurringTransactions);
  assertUniqueIds('conversions', data.conversions);
  assertUniqueIds('settings', data.settings);

  if (data.settings.length !== 1 || data.settings[0]?.id !== DEFAULT_SETTINGS_ID) {
    throw new BackupValidationError('Backup must contain exactly one default settings record.');
  }

  const categories = new Map(data.categories.map((category) => [category.id, category]));
  for (const transaction of data.transactions) {
    const category = categories.get(transaction.categoryId);
    if (!category) {
      throw new BackupValidationError(
        `Transaction ${transaction.id} references missing category ${transaction.categoryId}.`
      );
    }
    if (category.type !== transaction.type) {
      throw new BackupValidationError(
        `Transaction ${transaction.id} category type does not match transaction type.`
      );
    }
  }

  for (const recurring of data.recurringTransactions) {
    const category = categories.get(recurring.categoryId);
    if (!category) {
      throw new BackupValidationError(
        `Recurring transaction ${recurring.id} references missing category ${recurring.categoryId}.`
      );
    }
    if (category.type !== recurring.type) {
      throw new BackupValidationError(
        `Recurring transaction ${recurring.id} category type does not match transaction type.`
      );
    }
  }

  for (const budget of data.categoryBudgets) {
    const category = categories.get(budget.categoryId);
    if (!category) {
      throw new BackupValidationError(
        `Category budget ${budget.id} references missing category ${budget.categoryId}.`
      );
    }
    if (category.type !== 'expense') {
      throw new BackupValidationError(`Category budget ${budget.id} must reference an expense category.`);
    }
  }

  const expectedBalanceIds = getExpectedBalanceIds();
  const openingBalanceIds = new Set<string>();
  for (const checkpoint of data.balanceCheckpoints) {
    if (!expectedBalanceIds.has(checkpoint.balanceId)) {
      throw new BackupValidationError(
        `Checkpoint ${checkpoint.id} references unsupported balance ${checkpoint.balanceId}.`
      );
    }
    if (checkpoint.kind === 'opening') openingBalanceIds.add(checkpoint.balanceId);
  }

  if (data.settings[0].setupCompleted) {
    const missingOpenings = [...expectedBalanceIds].filter((id) => !openingBalanceIds.has(id));
    if (missingOpenings.length > 0) {
      throw new BackupValidationError(
        `Completed backup is missing opening checkpoints for: ${missingOpenings.join(', ')}.`
      );
    }
  }
}

function validateTransaction(value: unknown, label: string): Transaction {
  const row = requireObject(value, label);
  const type = requireOneOf(row.type, TRANSACTION_TYPES, `${label}.type`);
  return {
    id: requireId(row.id, `${label}.id`),
    type,
    amount: requirePositiveMoney(row.amount, `${label}.amount`),
    currency: requireOneOf(row.currency, SUPPORTED_CURRENCIES, `${label}.currency`),
    title: requireString(row.title, `${label}.title`, MAX_TITLE_LENGTH),
    categoryId: requireId(row.categoryId, `${label}.categoryId`),
    method: requireOneOf(row.method, SUPPORTED_METHODS, `${label}.method`),
    date: requireDate(row.date, `${label}.date`),
    ...optionalTimestampField(row, 'occurredAt', label),
    ...optionalStringField(row, 'note', label, MAX_NOTE_LENGTH),
    createdAt: requireTimestamp(row.createdAt, `${label}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${label}.updatedAt`),
    ...optionalStringField(row, 'recurringSourceId', label, MAX_ID_LENGTH),
  };
}

function validateBalance(value: unknown, label: string): Balance {
  const row = requireObject(value, label);
  const currency = requireOneOf(row.currency, SUPPORTED_CURRENCIES, `${label}.currency`);
  const method = requireOneOf(row.method, SUPPORTED_METHODS, `${label}.method`);
  const id = requireId(row.id, `${label}.id`);
  if (id !== getBalanceId(currency, method)) {
    throw new BackupValidationError(`${label}.id does not match its currency and method.`);
  }
  return {
    id,
    currency,
    method,
    amount: requireNonNegativeMoney(row.amount, `${label}.amount`),
    updatedAt: requireTimestamp(row.updatedAt, `${label}.updatedAt`),
  };
}

function validateBalanceCheckpoint(value: unknown, label: string): BalanceCheckpoint {
  const row = requireObject(value, label);
  const currency = requireOneOf(row.currency, SUPPORTED_CURRENCIES, `${label}.currency`);
  const method = requireOneOf(row.method, SUPPORTED_METHODS, `${label}.method`);
  const balanceId = requireId(row.balanceId, `${label}.balanceId`);
  if (balanceId !== getBalanceId(currency, method)) {
    throw new BackupValidationError(`${label}.balanceId does not match its currency and method.`);
  }

  const kind = requireOneOf(row.kind, ['opening', 'reconciliation'] as const, `${label}.kind`);
  return {
    id: requireId(row.id, `${label}.id`),
    balanceId,
    currency,
    method,
    kind,
    observedAmount: requireNonNegativeMoney(row.observedAmount, `${label}.observedAmount`),
    deltaAmount: requireFiniteNumber(row.deltaAmount, `${label}.deltaAmount`),
    date: requireDate(row.date, `${label}.date`),
    effectiveAt: requireTimestamp(row.effectiveAt, `${label}.effectiveAt`),
    ...optionalMonthField(row, 'month', label),
    createdAt: requireTimestamp(row.createdAt, `${label}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${label}.updatedAt`),
  };
}

function validateCategory(value: unknown, label: string): Category {
  const row = requireObject(value, label);
  return {
    id: requireId(row.id, `${label}.id`),
    name: requireString(row.name, `${label}.name`, MAX_CATEGORY_NAME_LENGTH),
    ...optionalStringField(row, 'icon', label, 100),
    ...optionalStringField(row, 'color', label, 100),
    isDefault: requireBoolean(row.isDefault, `${label}.isDefault`),
    type: requireOneOf(row.type, TRANSACTION_TYPES, `${label}.type`),
    createdAt: requireTimestamp(row.createdAt, `${label}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${label}.updatedAt`),
  };
}

function validateMonthlyBudget(value: unknown, label: string): MonthlyBudget {
  const row = requireObject(value, label);
  if (row.currency !== 'TRY') throw new BackupValidationError(`${label}.currency must be TRY.`);
  return {
    id: requireId(row.id, `${label}.id`),
    month: requireMonth(row.month, `${label}.month`),
    totalBudget: requireNonNegativeMoney(row.totalBudget, `${label}.totalBudget`),
    rolloverFromPreviousMonth: requireFiniteNumber(
      row.rolloverFromPreviousMonth,
      `${label}.rolloverFromPreviousMonth`
    ),
    currency: 'TRY',
    createdAt: requireTimestamp(row.createdAt, `${label}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${label}.updatedAt`),
  };
}

function validateCategoryBudget(value: unknown, label: string): CategoryBudget {
  const row = requireObject(value, label);
  if (row.currency !== 'TRY') throw new BackupValidationError(`${label}.currency must be TRY.`);
  return {
    id: requireId(row.id, `${label}.id`),
    month: requireMonth(row.month, `${label}.month`),
    categoryId: requireId(row.categoryId, `${label}.categoryId`),
    amount: requireNonNegativeMoney(row.amount, `${label}.amount`),
    currency: 'TRY',
    createdAt: requireTimestamp(row.createdAt, `${label}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${label}.updatedAt`),
  };
}

function validateRecurringTransaction(value: unknown, label: string): RecurringTransaction {
  const row = requireObject(value, label);
  const type = requireOneOf(row.type, TRANSACTION_TYPES, `${label}.type`);
  const startDate = requireDate(row.startDate, `${label}.startDate`);
  const nextRunDate = requireDate(row.nextRunDate, `${label}.nextRunDate`);
  const endDate = optionalDate(row.endDate, `${label}.endDate`);
  if (endDate && endDate < startDate) {
    throw new BackupValidationError(`${label}.endDate cannot be before startDate.`);
  }
  return {
    id: requireId(row.id, `${label}.id`),
    type,
    amount: requirePositiveMoney(row.amount, `${label}.amount`),
    currency: requireOneOf(row.currency, SUPPORTED_CURRENCIES, `${label}.currency`),
    title: requireString(row.title, `${label}.title`, MAX_TITLE_LENGTH),
    categoryId: requireId(row.categoryId, `${label}.categoryId`),
    method: requireOneOf(row.method, SUPPORTED_METHODS, `${label}.method`),
    frequency: requireOneOf(row.frequency, RECURRING_FREQUENCIES, `${label}.frequency`),
    startDate,
    ...(endDate ? { endDate } : {}),
    nextRunDate,
    isActive: requireBoolean(row.isActive, `${label}.isActive`),
    createdAt: requireTimestamp(row.createdAt, `${label}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${label}.updatedAt`),
  };
}

function validateConversion(value: unknown, label: string): Conversion {
  const row = requireObject(value, label);
  return {
    id: requireId(row.id, `${label}.id`),
    fromCurrency: requireOneOf(row.fromCurrency, SUPPORTED_CURRENCIES, `${label}.fromCurrency`),
    toCurrency: requireOneOf(row.toCurrency, SUPPORTED_CURRENCIES, `${label}.toCurrency`),
    fromMethod: requireOneOf(row.fromMethod, SUPPORTED_METHODS, `${label}.fromMethod`),
    toMethod: requireOneOf(row.toMethod, SUPPORTED_METHODS, `${label}.toMethod`),
    fromAmount: requirePositiveMoney(row.fromAmount, `${label}.fromAmount`),
    toAmount: requirePositiveMoney(row.toAmount, `${label}.toAmount`),
    date: requireDate(row.date, `${label}.date`),
    ...optionalTimestampField(row, 'occurredAt', label),
    ...optionalStringField(row, 'note', label, MAX_NOTE_LENGTH),
    createdAt: requireTimestamp(row.createdAt, `${label}.createdAt`),
    ...optionalTimestampField(row, 'updatedAt', label),
  };
}

function validateSettings(value: unknown, label: string): Settings {
  const row = requireObject(value, label);
  if (row.defaultCurrency !== 'TRY') {
    throw new BackupValidationError(`${label}.defaultCurrency must be TRY.`);
  }
  return {
    id: requireId(row.id, `${label}.id`),
    defaultCurrency: 'TRY',
    lastUsedMethod: requireOneOf(row.lastUsedMethod, SUPPORTED_METHODS, `${label}.lastUsedMethod`),
    setupCompleted: requireBoolean(row.setupCompleted, `${label}.setupCompleted`),
    ...optionalBooleanField(row, 'aiCategorizationEnabled', label),
    ...optionalBooleanField(row, 'darkModeEnabled', label),
    ...optionalTimestampField(row, 'lastSyncAt', label),
    createdAt: requireTimestamp(row.createdAt, `${label}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${label}.updatedAt`),
  };
}

function validateArray<T>(
  value: unknown,
  label: string,
  validator: (value: unknown, label: string) => T
): T[] {
  if (!Array.isArray(value)) throw new BackupValidationError(`${label} must be an array.`);
  if (value.length > MAX_RECORDS_PER_TABLE) {
    throw new BackupValidationError(`${label} contains too many records.`);
  }
  return value.map((item, index) => validator(item, `${label}[${index}]`));
}

function requireObject(value: unknown, label: string): UnknownRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BackupValidationError(`${label} must be an object.`);
  }
  return value as UnknownRow;
}

function requireId(value: unknown, label: string): string {
  return requireString(value, label, MAX_ID_LENGTH);
}

function requireString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new BackupValidationError(`${label} must be a non-empty string up to ${maxLength} characters.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new BackupValidationError(`${label} must be boolean.`);
  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BackupValidationError(`${label} must be a finite number.`);
  }
  return value;
}

function requirePositiveMoney(value: unknown, label: string): number {
  const amount = requireFiniteNumber(value, label);
  if (amount <= 0) throw new BackupValidationError(`${label} must be greater than zero.`);
  return amount;
}

function requireNonNegativeMoney(value: unknown, label: string): number {
  const amount = requireFiniteNumber(value, label);
  if (amount < 0) throw new BackupValidationError(`${label} cannot be negative.`);
  return amount;
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = requireString(value, label, 100);
  if (!Number.isFinite(new Date(timestamp).getTime())) {
    throw new BackupValidationError(`${label} must be a valid timestamp.`);
  }
  return timestamp;
}

function requireDate(value: unknown, label: string): string {
  const date = requireString(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BackupValidationError(`${label} must use YYYY-MM-DD.`);
  }
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new BackupValidationError(`${label} is not a valid calendar date.`);
  }
  return date;
}

function optionalDate(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireDate(value, label);
}

function requireMonth(value: unknown, label: string): string {
  const month = requireString(value, label, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new BackupValidationError(`${label} must use YYYY-MM.`);
  }
  return month;
}

function requireOneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new BackupValidationError(`${label} contains an unsupported value.`);
  }
  return value as T[number];
}

function optionalStringField(
  row: UnknownRow,
  key: string,
  label: string,
  maxLength: number
): Record<string, string> {
  const value = row[key];
  if (value === undefined || value === null || value === '') return {};
  return { [key]: requireString(value, `${label}.${key}`, maxLength) };
}

function optionalBooleanField(
  row: UnknownRow,
  key: string,
  label: string
): Record<string, boolean> {
  const value = row[key];
  if (value === undefined || value === null) return {};
  return { [key]: requireBoolean(value, `${label}.${key}`) };
}

function optionalTimestampField(
  row: UnknownRow,
  key: string,
  label: string
): Record<string, string> {
  const value = row[key];
  if (value === undefined || value === null || value === '') return {};
  return { [key]: requireTimestamp(value, `${label}.${key}`) };
}

function optionalMonthField(
  row: UnknownRow,
  key: string,
  label: string
): Record<string, string> {
  const value = row[key];
  if (value === undefined || value === null || value === '') return {};
  return { [key]: requireMonth(value, `${label}.${key}`) };
}

function assertUniqueIds<T extends { id: string }>(label: string, rows: T[]): void {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new BackupValidationError(`${label} contains duplicate id ${row.id}.`);
    ids.add(row.id);
  }
}

function getExpectedBalanceIds(): Set<string> {
  return new Set(
    SUPPORTED_CURRENCIES.flatMap((currency) =>
      SUPPORTED_METHODS.map((method) => getBalanceId(currency, method))
    )
  );
}

function sortById<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

function countCanonicalRecords(data: CanonicalBackupData): number {
  return (
    data.transactions.length +
    data.balanceCheckpoints.length +
    data.categories.length +
    data.monthlyBudgets.length +
    data.categoryBudgets.length +
    data.recurringTransactions.length +
    data.conversions.length +
    data.settings.length
  );
}

