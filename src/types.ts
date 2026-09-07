export const SUPPORTED_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export const SUPPORTED_METHODS = ['cash', 'card'] as const;
export const TRANSACTION_TYPES = ['income', 'expense'] as const;
export const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
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
  /**
   * Exact occurrence ordering when known. New same-day activity records this
   * automatically. Older/historical rows may omit it until ordering matters.
   */
  occurredAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  recurringSourceId?: string;
}

export type TransactionDraft = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Derived local cache only. Authoritative balance state is reconstructed from
 * balance checkpoints plus transactions and conversions.
 */
export interface Balance {
  id: string;
  currency: Currency;
  method: Method;
  amount: number;
  updatedAt: string;
}

export type BalanceCheckpointKind = 'opening' | 'reconciliation';

/**
 * Absolute balance observation. Opening checkpoints are written once during
 * setup (or migration). Reconciliation checkpoints record the real-world
 * balance observed by the user for a calendar month.
 */
export interface BalanceCheckpoint {
  id: string;
  balanceId: string;
  currency: Currency;
  method: Method;
  kind: BalanceCheckpointKind;
  observedAmount: number;
  deltaAmount: number;
  /** Local calendar date chosen/observed by the user, independent of timezone changes. */
  date: string;
  /** Exact UTC ordering boundary for activity before/after this checkpoint. */
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
  currency: 'TRY';
  createdAt: string;
  updatedAt: string;
}

export interface CategoryBudget {
  id: string;
  month: string;
  categoryId: string;
  amount: number;
  currency: 'TRY';
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
  /** See Transaction.occurredAt. */
  occurredAt?: string;
  note?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Discriminated kind: 'exchange' = currency swap, 'transfer' = same-currency method swap */
export type ConversionKind = 'exchange' | 'transfer';

export interface Settings {
  id: string;
  defaultCurrency: 'TRY';
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
}

/** Live exchange rates: values are "1 unit of currency = X TRY" */
export type ExchangeRates = {
  USD: number;
  EUR: number;
};
