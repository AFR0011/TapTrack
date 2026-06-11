'use client';

import { useState, useEffect } from 'react';
import CommandInput from '@/components/CommandInput';
import DashboardSummary from '@/components/DashboardSummary';
import RecentTransactions from '@/components/RecentTransactions';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';

export default function Home() {
  const [currentMonth, setCurrentMonth] = useState('');

  useEffect(() => {
    const today = new Date();
    const month = today.toLocaleString('default', { month: 'long', year: 'numeric' });
    setCurrentMonth(month);
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={currentMonth || <Skeleton className="h-4 w-36" aria-hidden="true" />}
      />

      <CommandInput />
      <DashboardSummary />
      <RecentTransactions />
    </div>
  );
}
