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
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-primary">Dashboard</h1>
        {currentMonth ? <p className="text-sm font-medium text-muted">{currentMonth}</p> : null}
      </header>

      <CommandInput />
      <DashboardSummary />
      <RecentTransactions />
    </div>
  );
}
