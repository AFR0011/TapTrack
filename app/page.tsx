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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">TapTrack</h1>
          <p className="text-gray-600">{currentMonth}</p>
        </header>

        <CommandInput />

        <DashboardSummary />

        <RecentTransactions />
      </div>
    </div>
  );
}
