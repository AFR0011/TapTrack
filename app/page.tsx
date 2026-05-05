'use client';

import { useState, useEffect } from 'react';
import CommandInput from '@/components/CommandInput';
import DashboardSummary from '@/components/DashboardSummary';
import RecentTransactions from '@/components/RecentTransactions';

export default function Home() {
  const [currentMonth, setCurrentMonth] = useState('');

  useEffect(() => {
    const today = new Date();
    const month = today.toLocaleString('default', { month: 'long', year: 'numeric' });
    setCurrentMonth(month);
  }, []);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Dashboard</h1>
          <p className="text-sm font-medium text-slate-500">{currentMonth}</p>
        </div>
        <p className="max-w-lg text-sm leading-6 text-slate-500">
          Command-first logging with live balances, budget status, and recent activity.
        </p>
      </header>

      <CommandInput />
      <DashboardSummary />
      <RecentTransactions />
    </div>
  );
}
