'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { formatMoney } from '@/format';
import type { Transaction } from '@/types';

export default function RecentTransactions() {
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []);
  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const dateDiff = b.date.localeCompare(a.date);
        if (dateDiff !== 0) return dateDiff;
        return b.createdAt.localeCompare(a.createdAt);
      }),
    [transactions]
  );

  const filteredTransactions = sortedTransactions.filter((transaction: Transaction) => {
    if (filter === 'all') return true;
    return transaction.type === filter;
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs shadow-slate-200/50 transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Recent transactions</h2>
          <p className="text-sm text-slate-500">Latest local activity across all currencies.</p>
        </div>
        <div className="flex gap-1">
          {(['all', 'income', 'expense'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setFilter(option)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-all ${
                filter === option
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-50">
        {filteredTransactions.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-medium text-slate-500">No transactions yet.</p>
          </div>
        ) : (
          filteredTransactions.slice(0, 10).map((transaction) => (
            <div key={transaction.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 transition-colors hover:bg-slate-50/50">
              <div>
                <p className="text-sm font-semibold text-slate-950">{transaction.title}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-normal text-slate-500">
                  {transaction.date} / {transaction.method} / {transaction.categoryId}
                </p>
              </div>
              <p
                className={`text-right text-sm font-semibold transition-colors ${
                  transaction.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {transaction.type === 'income' ? '+' : '-'}
                {formatMoney(transaction.amount, transaction.currency)}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-slate-100 p-4">
        <Link href="/transactions" className="text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700">
          Open transactions
        </Link>
      </div>
    </section>
  );
}
