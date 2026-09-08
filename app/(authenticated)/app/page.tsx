'use client';

import { useEffect, useState } from 'react';
import DashboardSummary from '@/components/DashboardSummary';
import RecentTransactions from '@/components/RecentTransactions';
import { PageHeader } from '@/components/ui/PageHeader';
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
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={currentMonth || <Skeleton className="h-4 w-36" aria-hidden="true" />}
      />
      <DashboardSummary />
      <RecentTransactions />
    </div>
  );
}
