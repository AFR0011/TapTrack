'use client';

import { useEffect, useState } from 'react';
import DashboardSummary from '@/components/DashboardSummary';
import RecentTransactions from '@/components/RecentTransactions';
import { Skeleton } from '@/components/ui/Skeleton';

export default function Home() {
  const [currentMonth, setCurrentMonth] = useState('');

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const today = new Date();
      setCurrentMonth(today.toLocaleString('default', { month: 'long', year: 'numeric' }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="space-y-6">
      <header className="pt-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {currentMonth || <Skeleton className="h-3.5 w-28" aria-hidden="true" />}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em] text-primary">Dashboard</h1>
      </header>
      <DashboardSummary />
      <RecentTransactions />
    </div>
  );
}
