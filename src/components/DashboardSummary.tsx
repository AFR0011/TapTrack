'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { clampPercent, formatMoney } from '@/format';

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
    .filter((transaction) => transaction.type === 'expense' && transaction.currency === 'TRY' && transaction.date === today)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthlySpending = transactions
    .filter(
      (transaction) =>
        transaction.type === 'expense' &&
        transaction.currency === 'TRY' &&
        transaction.date.startsWith(currentMonth)
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const budgetAvailable =
    (monthlyBudget?.totalBudget ?? 0) + (monthlyBudget?.rolloverFromPreviousMonth ?? 0);
  const remaining = budgetAvailable - monthlySpending;
  const budgetUsed = budgetAvailable > 0 ? clampPercent((monthlySpending / budgetAvailable) * 100) : 0;

  return (
    <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-500">Month status</h2>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{formatMoney(monthlySpending)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-slate-500">Remaining</p>
            <p className={`mt-1 text-lg font-semibold ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatMoney(remaining)}
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${budgetUsed}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-xs font-medium text-slate-500">
          <span>Today: {formatMoney(todaySpending)}</span>
          <span>Budget: {formatMoney(budgetAvailable)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500">Balances</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {balances.map((balance) => (
            <div key={balance.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-normal text-slate-500">
                {balance.currency} {balance.method}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {formatMoney(balance.amount, balance.currency)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
