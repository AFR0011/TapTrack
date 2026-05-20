'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { formatMoney } from '@/format';
import type { Transaction } from '@/types';

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 12, transition: { duration: 0.15 } },
};

export default function RecentTransactions() {
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

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
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay: 0.14 }}
      className="rounded-2xl border border-white/60 bg-white/90 shadow-glass backdrop-blur-sm transition-shadow hover:shadow-glass-lg"
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Recent transactions</h2>
          <p className="text-sm text-slate-500">Latest local activity across all currencies.</p>
        </div>
        <div className="flex gap-1">
          {(['all', 'income', 'expense'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`relative rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-all ${
                filter === option ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {filter === option && (
                <motion.span
                  layoutId="filter-pill"
                  className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10">{option}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-slate-50">
        {filteredTransactions.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-semibold text-slate-700">No matching activity yet.</p>
            <p className="mt-1 text-sm font-medium text-slate-500">Log a transaction with the quick command above.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredTransactions.slice(0, 10).map((transaction, index) => {
              const category = categoryMap.get(transaction.categoryId);

              return (
                <motion.div
                  key={transaction.id}
                  layout
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.22, ease: 'easeOut', delay: index * 0.025 }}
                  className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{transaction.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-normal text-slate-400">
                      <span>{transaction.date}</span>
                      <span>{transaction.method}</span>
                      <span className="flex items-center gap-1 normal-case text-slate-500">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: category?.color ?? '#64748b' }} />
                        {category?.name ?? 'Unknown category'}
                        {category?.icon ? <span className="text-slate-400">({category.icon})</span> : null}
                      </span>
                    </div>
                  </div>
                  <p
                    className={`text-right text-sm font-bold tabular-nums transition-colors ${
                      transaction.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {transaction.type === 'income' ? '+' : '-'}
                    {formatMoney(transaction.amount, transaction.currency)}
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <div className="border-t border-slate-100 p-4">
        <Link href="/app/transactions" className="text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700">
          Open transactions
        </Link>
      </div>
    </motion.section>
  );
}
