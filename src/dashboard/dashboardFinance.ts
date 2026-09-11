import type { Currency, MonthlyBudget } from '@/types';

export function selectMonthlyBudgetForCurrency(
  budgets: MonthlyBudget[] | undefined,
  currency: Currency
): MonthlyBudget | null | undefined {
  if (budgets === undefined) return undefined;
  return budgets.find((budget) => budget.currency === currency) ?? null;
}

export function ratesForCurrency<T>(
  rates: T,
  loadedQuoteCurrency: Currency | null,
  currentQuoteCurrency: Currency,
  empty: T
): T {
  return loadedQuoteCurrency === currentQuoteCurrency ? rates : empty;
}

type BalanceLike = { currency: Currency; amount: number };

/**
 * Dashboard shortcuts should only surface currencies enabled for new activity,
 * but the headline available-money total must still include archived holdings.
 */
export function selectDashboardBalanceScopes<T extends BalanceLike>(
  balances: T[],
  activeCurrencies: Currency[]
): { availableBalances: T[]; activeBalances: T[] } {
  const active = new Set(activeCurrencies);
  return {
    availableBalances: balances.filter((balance) => balance.amount !== 0),
    activeBalances: balances.filter((balance) => active.has(balance.currency)),
  };
}
