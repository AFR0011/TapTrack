export const DEFAULT_CURRENCY = 'TRY' as const;
/** Offline/bootstrap fallback only. The live supported-currency catalog comes from Frankfurter. */
export const SUPPORTED_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export const SUPPORTED_METHODS = ['cash', 'card'] as const;
export const TRANSACTION_TYPES = ['income', 'expense'] as const;
export const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;

/** ISO-style three-letter currency code validated at system boundaries. */
export type Currency = string;
export type Method = (typeof SUPPORTED_METHODS)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type Frequency = (typeof RECURRING_FREQUENCIES)[number];

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  title: string;
  categoryId: string;
  method: Method;
  date: string;
  /** Exact occurrence ordering when known. */
  occurredAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  recurringSourceId?: string;
}

export type TransactionDraft = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

/** Derived local cache only. */
export interface Balance {
  id: string;
  currency: Currency;
  method: Method;
  amount: number;
  updatedAt: string;
}

export type BalanceCheckpointKind = 'opening' | 'reconciliation';

export interface BalanceCheckpoint {
  id: string;
  balanceId: string;
  currency: Currency;
  method: Method;
  kind: BalanceCheckpointKind;
  observedAmount: number;
  deltaAmount: number;
  date: string;
  effectiveAt: string;
  month?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  isDefault: boolean;
  type: TransactionType;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyBudget {
  id: string;
  month: string;
  totalBudget: number;
  rolloverFromPreviousMonth: number;
  currency: Currency;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryBudget {
  id: string;
  month: string;
  categoryId: string;
  amount: number;
  currency: Currency;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  title: string;
  categoryId: string;
  method: Method;
  frequency: Frequency;
  startDate: string;
  endDate?: string;
  nextRunDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Conversion {
  id: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromMethod: Method;
  toMethod: Method;
  fromAmount: number;
  toAmount: number;
  date: string;
  occurredAt?: string;
  note?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ConversionKind = 'exchange' | 'transfer';

export interface Settings {
  id: string;
  /** Currency used for new entries, budgets, dashboard summaries, and reporting conversions. */
  defaultCurrency: Currency;
  lastUsedMethod: Method;
  setupCompleted: boolean;
  aiCategorizationEnabled?: boolean;
  darkModeEnabled?: boolean;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceMetadata {
  id: string;
  syncOwnerUserId: string;
  linkedAt: string;
  cloudRevision?: number;
  cloudGeneration?: string;
}

export type SyncOutboxOperation = 'upsert' | 'delete';

export interface SyncOutboxItem {
  id: string;
  operationId: string;
  tableName: string;
  operation: SyncOutboxOperation;
  recordId: string;
  record?: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
  lastAttemptAt?: string;
}

/** Legacy compatibility shape; new rate code uses arbitrary currency pairs. */
export type ExchangeRates = Record<string, number>;
