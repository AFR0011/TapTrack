'use client';

import { motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { clampPercent } from '@/format';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';


function formatTRY(value: number) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ₺';
}

function formatCurrency(value: number, currency: string) {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺';
  const locale = currency === 'TRY' ? 'tr-TR' : 'en-US';
  return symbol + new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default function DashboardSummary() {
  const balances = useLiveQuery(() => db.balances.toArray(), [], []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []);
  const currentMonth = getCurrentMonth();
  const monthlyBudget = useLiveQuery(
    () => db.monthlyBudgets.where('month').equals(currentMonth).first(),
    [currentMonth]
  );
  const today = formatLocalDate(new Date());

  const todaySpending = transactions
    .filter((t) => t.type === 'expense' && t.currency === 'TRY' && t.date === today)
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlySpending = transactions
    .filter((t) => t.type === 'expense' && t.currency === 'TRY' && t.date.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amount, 0);
  const budgetAvailable = (monthlyBudget?.totalBudget ?? 0) + (monthlyBudget?.rolloverFromPreviousMonth ?? 0);
  const remaining = budgetAvailable - monthlySpending;
  const budgetUsed = budgetAvailable > 0 ? clampPercent((monthlySpending / budgetAvailable) * 100) : 0;

  return (
    <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      {/* Month status card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' as const }}
        className="rounded-2xl border border-white/60 bg-white/90 p-5 shadow-glass backdrop-blur-sm transition-shadow hover:shadow-glass-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-500">Month status</h2>
            <p className="mt-1 text-2xl font-bold text-slate-950 animate-count-up">
              <AnimatedNumber value={monthlySpending} format={formatTRY} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-slate-500">Remaining</p>
            <p className={`mt-1 text-lg font-bold transition-colors ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              <AnimatedNumber value={remaining} format={formatTRY} />
            </p>
          </div>
        </div>

        {/* Budget progress bar */}
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${budgetUsed > 100 ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-violet-500'}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(budgetUsed, 100)}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
          />
        </div>

        <div className="mt-3 flex justify-between text-xs font-medium text-slate-500">
          <span>
            Today:{' '}
            <span className="font-semibold text-slate-700">
              <AnimatedNumber value={todaySpending} format={formatTRY} />
            </span>
          </span>
          <span>Budget: {budgetAvailable > 0 ? formatTRY(budgetAvailable) : 'Not set'}</span>
        </div>
      </motion.div>

      {/* Balances card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' as const, delay: 0.07 }}
        className="rounded-2xl border border-white/60 bg-white/90 p-5 shadow-glass backdrop-blur-sm transition-shadow hover:shadow-glass-lg"
      >
        <h2 className="text-sm font-semibold text-slate-500">Balances</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {balances.map((balance, i) => (
            <motion.div
              key={balance.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.25, ease: 'easeOut' }}
              className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/50 px-3 py-2 shadow-highlight transition-all hover:from-blue-50 hover:to-violet-50/50"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {balance.currency} {balance.method}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-950">
                <AnimatedNumber
                  value={balance.amount}
                  format={(v) => formatCurrency(v, balance.currency)}
                />
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
