'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField } from '@/components/ui/SelectField';
import { SkeletonListCard } from '@/components/ui/Skeleton';
import { db } from '@/database';
import { formatMoney } from '@/format';
import {
  filterTransactionHistory,
  type TransactionHistoryFilters,
} from '@/transactions/historyFilter';
import type { Category, Method, Transaction, TransactionType } from '@/types';

const PAGE_SIZE = 80;

const EMPTY_FILTERS: TransactionHistoryFilters = {
  query: '',
  fromDate: '',
  toDate: '',
  type: 'all',
  method: 'all',
  categoryId: 'all',
};

export default function TransactionsHistoryWorkspace() {
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const [filters, setFilters] = useState<TransactionHistoryFilters>(EMPTY_FILTERS);

  const filtered = useMemo(
    () =>
      transactions && categories
        ? filterTransactionHistory(transactions, categories, filters)
        : [],
    [categories, filters, transactions]
  );
  const categoryById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories]
  );
  const filterKey = [
    filters.query,
    filters.fromDate,
    filters.toDate,
    filters.type,
    filters.method,
    filters.categoryId,
  ].join('|');
  const hasFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'type' || key === 'method' || key === 'categoryId') return value !== 'all';
    return value !== '';
  });

  if (transactions === undefined || categories === undefined) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading transaction history">
        <PageHeader title="All transaction history" description="Browse your complete ledger." />
        <SkeletonListCard titleWidth="w-44" count={8} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="All transaction history"
        description="Browse any date range. Older rows load as you scroll."
      />

      <section className="rounded-2xl border border-subtle bg-surface p-4" aria-label="History filters">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Field
            label="Search"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="Title, note, or category"
            autoComplete="off"
          />
          <Field
            label="From"
            type="date"
            value={filters.fromDate}
            max={filters.toDate || undefined}
            onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))}
          />
          <Field
            label="To"
            type="date"
            value={filters.toDate}
            min={filters.fromDate || undefined}
            onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))}
          />
        </div>

        <details className="group mt-3 rounded-xl border border-subtle bg-surface-muted">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-secondary select-none [&::-webkit-details-marker]:hidden">
            <span>More filters</span>
            <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="grid gap-3 border-t border-subtle p-3 sm:grid-cols-3">
            <SelectField
              label="Type"
              value={filters.type}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  type: event.target.value as 'all' | TransactionType,
                }))
              }
              options={[
                { value: 'all', label: 'All types' },
                { value: 'expense', label: 'Expenses' },
                { value: 'income', label: 'Income' },
              ]}
            />
            <SelectField
              label="Method"
              value={filters.method}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  method: event.target.value as 'all' | Method,
                }))
              }
              options={[
                { value: 'all', label: 'All methods' },
                { value: 'card', label: 'Card' },
                { value: 'cash', label: 'Cash' },
              ]}
            />
            <SelectField
              label="Category"
              value={filters.categoryId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, categoryId: event.target.value }))
              }
              options={[
                { value: 'all', label: 'All categories' },
                ...categories
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((category) => ({ value: category.id, label: category.name })),
              ]}
            />
          </div>
        </details>

        <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted">
            {filtered.length === transactions.length && !hasFilters
              ? `${transactions.length} transaction${transactions.length === 1 ? '' : 's'} total`
              : `${filtered.length} matching transaction${filtered.length === 1 ? '' : 's'}`}
          </p>
          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          title={transactions.length === 0 ? 'No transactions yet' : 'No transactions match these filters'}
          description={
            transactions.length === 0
              ? 'Transactions will appear here after you add them.'
              : 'Try widening the date range or clearing a filter.'
          }
        />
      ) : (
        <LazyHistoryList
          key={filterKey}
          transactions={filtered}
          categoryById={categoryById}
        />
      )}
    </div>
  );
}

function LazyHistoryList({
  transactions,
  categoryById,
}: {
  transactions: Transaction[];
  categoryById: Map<string, Category>;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const visible = transactions.slice(0, visibleCount);
  const hasMore = visibleCount < transactions.length;
  const groups = useMemo(() => groupByDate(visible), [visible]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + PAGE_SIZE, transactions.length));
      },
      { rootMargin: '320px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, transactions.length]);

  return (
    <section aria-label="Transaction history" className="space-y-5">
      {groups.map(([date, rows]) => (
        <div key={date}>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {formatDateHeading(date)}
          </h2>
          <div className="divide-y divide-subtle overflow-hidden rounded-2xl border border-subtle bg-surface">
            {rows.map((transaction) => (
              <HistoryRow
                key={transaction.id}
                transaction={transaction}
                category={categoryById.get(transaction.categoryId)}
              />
            ))}
          </div>
        </div>
      ))}

      <div ref={sentinelRef} className="flex min-h-12 items-center justify-center" aria-live="polite">
        <span className="text-xs font-medium text-muted">
          {hasMore
            ? `Showing ${visible.length} of ${transactions.length}. Scroll for more.`
            : `Showing all ${transactions.length} transaction${transactions.length === 1 ? '' : 's'}.`}
        </span>
      </div>
    </section>
  );
}

function HistoryRow({ transaction, category }: { transaction: Transaction; category?: Category }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3">
      <CategoryIcon icon={category?.icon} color={category?.color} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-primary">{transaction.title}</p>
        <p className="mt-0.5 truncate text-xs font-medium text-muted">
          {category?.name ?? 'Uncategorized'} · {capitalize(transaction.method)}
          {transaction.note ? ` · ${transaction.note}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`text-sm font-bold tabular-nums ${
            transaction.type === 'income' ? 'text-success' : 'text-primary'
          }`}
        >
          {transaction.type === 'income' ? '+' : '-'}{formatMoney(transaction.amount, transaction.currency)}
        </p>
        <p className="mt-0.5 text-xs font-medium text-muted">{transaction.currency}</p>
      </div>
    </div>
  );
}

function groupByDate(transactions: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const rows = groups.get(transaction.date) ?? [];
    rows.push(transaction);
    groups.set(transaction.date, rows);
  }
  return [...groups.entries()];
}

function formatDateHeading(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
