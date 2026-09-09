import type { Category, Method, Transaction, TransactionType } from '@/types';

export type TransactionHistoryFilters = {
  query: string;
  fromDate: string;
  toDate: string;
  type: 'all' | TransactionType;
  method: 'all' | Method;
  categoryId: string;
};

export function filterTransactionHistory(
  transactions: Transaction[],
  categories: Category[],
  filters: TransactionHistoryFilters
): Transaction[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const query = filters.query.trim().toLowerCase();

  return transactions
    .filter((transaction) => !filters.fromDate || transaction.date >= filters.fromDate)
    .filter((transaction) => !filters.toDate || transaction.date <= filters.toDate)
    .filter((transaction) => filters.type === 'all' || transaction.type === filters.type)
    .filter((transaction) => filters.method === 'all' || transaction.method === filters.method)
    .filter(
      (transaction) =>
        filters.categoryId === 'all' || transaction.categoryId === filters.categoryId
    )
    .filter((transaction) => {
      if (!query) return true;
      const categoryName = categoryById.get(transaction.categoryId)?.name ?? '';
      return (
        transaction.title.toLowerCase().includes(query) ||
        (transaction.note ?? '').toLowerCase().includes(query) ||
        categoryName.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      return dateDiff !== 0 ? dateDiff : b.createdAt.localeCompare(a.createdAt);
    });
}
