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
  note?: string;
  createdAt: string;
  updatedAt: string;
  recurringSourceId?: string;
}

export type TransactionDraft = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

export interface Balance {
  id: string;
  currency: Currency;
  method: Method;
  amount: number;
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
  fromAmount: number;
  toAmount: number;
  method: Method;
  date: string;
  note?: string;
  createdAt: string;
}

export interface Settings {
  id: string;
  defaultCurrency: 'TRY';
  lastUsedMethod: Method;
  setupCompleted: boolean;
  aiCategorizationEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Live exchange rates: values are "1 unit of currency = X TRY" */
export type ExchangeRates = {
  USD: number;
  EUR: number;
};
