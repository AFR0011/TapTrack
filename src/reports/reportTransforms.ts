import type { CategoryBudget, MonthlyBudget, Transaction } from '@/types';

export function getBudgetPerformance(
  month: string,
  monthlyBudget: MonthlyBudget | null,
  categoryBudgets: CategoryBudget[],
  transactions: Transaction[]
) {
  const monthTransactions = transactions.filter((transaction) => transaction.date.startsWith(month));
  const totalBudget = monthlyBudget?.totalBudget ?? 0;
  const rollover = monthlyBudget?.rolloverFromPreviousMonth ?? 0;
  const available = totalBudget + rollover;
  const expenseTransactions = monthTransactions.filter(
    (transaction) => transaction.type === 'expense' && transaction.currency === 'TRY'
  );
  const totalSpent = expenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    totalBudget,
    rollover,
    available,
    totalSpent,
    remaining: available - totalSpent,
    categoryBudgets: categoryBudgets.map((budget) => {
      const spent = expenseTransactions
        .filter((transaction) => transaction.categoryId === budget.categoryId)
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      return {
        categoryId: budget.categoryId,
        budget: budget.amount,
        spent,
        remaining: budget.amount - spent,
      };
    }),
  };
}
