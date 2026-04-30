'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import type { Transaction } from '@/types';

export default function RecentTransactions() {
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []);
  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [transactions]
  );

  const filteredTransactions = sortedTransactions.filter((transaction: Transaction) => {
    if (filter === 'all') return true;
    return transaction.type === filter;
  });

  return (
    <div className="bg-white rounded-lg shadow mt-6">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Recent Transactions</h2>
      </div>
      <div className="p-4">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('income')}
            className={`px-3 py-1 rounded ${filter === 'income' ? 'bg-green-500 text-white' : 'bg-gray-100'}`}
          >
            Income
          </button>
          <button
            onClick={() => setFilter('expense')}
            className={`px-3 py-1 rounded ${filter === 'expense' ? 'bg-red-500 text-white' : 'bg-gray-100'}`}
          >
            Expense
          </button>
        </div>
        <div className="space-y-2">
          {filteredTransactions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No transactions yet</p>
          ) : (
            filteredTransactions.slice(0, 10).map((t) => (
              <div key={t.id} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <p className={`font-medium ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'income' ? '+' : '-'}{t.amount} {t.currency}
                  </p>
                  <p className="text-sm text-gray-600">{t.title}</p>
                </div>
                <span className="text-sm text-gray-500">{t.date}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
