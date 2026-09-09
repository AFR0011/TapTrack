import type { Currency, MonthlyBudget } from '@/types';

export function selectMonthlyBudgetForCurrency(
  budgets: MonthlyBudget[] | undefined,
  currency: Currency
): MonthlyBudget | null | undefined {
  if (budgets === undefined) return undefined;
  return budgets.find((budget) => budget.currency === currency) ?? null;
}

export function useRatesForCurrency<T>(
  rates: T,
  loadedQuoteCurrency: Currency | null,
  currentQuoteCurrency: Currency,
  empty: T
): T {
  return loadedQuoteCurrency === currentQuoteCurrency ? rates : empty;
}
