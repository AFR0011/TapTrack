import type { CategoryBudget, Currency, MonthlyBudget, Transaction } from '@/types';

export function getBudgetPerformance(
  month: string,
  monthlyBudget: MonthlyBudget | null,
  categoryBudgets: CategoryBudget[],
  transactions: Transaction[],
  fallbackCurrency: Currency = 'TRY'
) {
  const monthTransactions = transactions.filter((transaction) => transaction.date.startsWith(month));
  const currency = monthlyBudget?.currency ?? fallbackCurrency;
  const totalBudget = monthlyBudget?.totalBudget ?? 0;
  const rollover = monthlyBudget?.rolloverFromPreviousMonth ?? 0;
  const available = totalBudget + rollover;
  const expenseTransactions = monthTransactions.filter(
    (transaction) => transaction.type === 'expense' && transaction.currency === currency
  );
  const totalSpent = expenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    currency,
    totalBudget,
    rollover,
    available,
    totalSpent,
    remaining: available - totalSpent,
    categoryBudgets: categoryBudgets.map((budget) => {
      const budgetCurrency = budget.currency ?? currency;
      const spent = monthTransactions
        .filter(
          (transaction) =>
            transaction.type === 'expense' &&
            transaction.currency === budgetCurrency &&
            transaction.categoryId === budget.categoryId
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      return {
        categoryId: budget.categoryId,
        currency: budgetCurrency,
        budget: budget.amount,
        spent,
        remaining: budget.amount - spent,
      };
    }),
  };
}
