'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';

export default function DashboardSummary() {
  const balances = useLiveQuery(() => db.balances.toArray(), [], []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []);
  const monthlyBudget = 20000;
  const today = formatLocalDate(new Date());
  const currentMonth = today.slice(0, 7);

  const tryBalance = balances
    .filter((balance) => balance.currency === 'TRY')
    .reduce((sum, balance) => sum + balance.amount, 0);
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-sm text-gray-600">Today Spent</h3>
        <p className="text-2xl font-bold text-red-600">{todaySpending.toLocaleString()} TRY</p>
      </div>
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-sm text-gray-600">Monthly Spent</h3>
        <p className="text-2xl font-bold text-gray-900">{monthlySpending.toLocaleString()} TRY</p>
      </div>
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-sm text-gray-600">Remaining</h3>
        <p className="text-2xl font-bold text-green-600">{(monthlyBudget - monthlySpending).toLocaleString()} TRY</p>
      </div>
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-sm text-gray-600">TRY Balance</h3>
        <p className="text-2xl font-bold text-gray-900">{tryBalance.toLocaleString()} TRY</p>
      </div>
    </div>
  );
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
