'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import {
  getAdjustmentHistory,
  getMonthlyReconciliationState,
} from '@/balances/reconciliationService';
import { OPEN_BALANCE_CHECK_EVENT } from '@/balances/reconciliationEvents';
import { resolveActiveCurrencies } from '@/currencies/activeCurrencySelection';
import { formatMoney } from '@/format';
import BalancesLoadingFrame from '@/components/BalancesLoadingFrame';
import { AdaptiveSheet } from '@/components/ui/AdaptiveSheet';
import { Button } from '@/components/ui/Button';
import { cn, focusVisibleRing } from '@/lib/cn';
import type { Balance, BalanceCheckpoint, Currency, Method } from '@/types';

type BalanceGroup = [Currency, Balance[]];

export default function BalancesWorkspace() {
  const balances = useLiveQuery(() => db.balances.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const adjustments = useLiveQuery(() => getAdjustmentHistory());
  const reconciliationState = useLiveQuery(() => getMonthlyReconciliationState(undefined, db), []);
  const [selectedBalanceId, setSelectedBalanceId] = useState<string | null>(null);

  const activeCurrencies = useMemo(
    () => (settings ? resolveActiveCurrencies(settings, balances ?? []) : []),
    [balances, settings]
  );

  const { activeGroups, archivedGroups } = useMemo(() => {
    const active = new Set(activeCurrencies);
    return {
      activeGroups: groupBalances(
        (balances ?? []).filter((balance) => active.has(balance.currency)),
        activeCurrencies
      ),
      archivedGroups: groupBalances((balances ?? []).filter((balance) => !active.has(balance.currency))),
    };
  }, [activeCurrencies, balances]);

  const selectedBalance =
    balances?.find((balance) => balance.id === selectedBalanceId) ?? null;
  const selectedHistory = useMemo(
    () =>
      selectedBalance
        ? (adjustments ?? []).filter((checkpoint) => checkpoint.balanceId === selectedBalance.id)
        : [],
    [adjustments, selectedBalance]
  );
  const checkCount = useMemo(
    () => new Set((adjustments ?? []).map((checkpoint) => checkpoint.month ?? checkpoint.date)).size,
    [adjustments]
  );

  if (
    balances === undefined ||
    settings === undefined ||
    adjustments === undefined ||
    reconciliationState === undefined
  ) {
    return <BalancesLoadingFrame />;
  }

  const requestBalanceCheck = () => {
    setSelectedBalanceId(null);
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event(OPEN_BALANCE_CHECK_EVENT));
    });
  };

  return (
    <div className="space-y-5 sm:space-y-6" data-layout="balances-content">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-primary">Balances</h1>
          <p className="mt-1 text-sm font-medium text-muted">
            What you have right now, by currency and method.
          </p>
        </div>
        {reconciliationState.required ? (
          <Button variant="secondary" onClick={requestBalanceCheck} className="self-start sm:self-auto">
            Check balances
          </Button>
        ) : null}
      </header>

      <section aria-labelledby="current-balances-title">
        <h2 id="current-balances-title" className="sr-only">Current balances</h2>
        {activeGroups.length === 0 ? (
          <div className="rounded-[1.5rem] bg-surface px-6 py-10 text-center shadow-[0_8px_28px_rgba(15,23,42,0.04)] ring-1 ring-subtle/70 dark:shadow-none">
            <p className="text-sm font-semibold text-secondary">No active balances yet.</p>
          </div>
        ) : (
          <BalanceGrid
            groups={activeGroups}
            onSelect={setSelectedBalanceId}
            dataLayout="balances-grid"
          />
        )}
      </section>

      {archivedGroups.length > 0 ? (
        <details className="group overflow-hidden rounded-[1.35rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.04)] ring-1 ring-subtle/70 dark:shadow-none">
          <summary
            className={cn(
              'flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 select-none [&::-webkit-details-marker]:hidden',
              focusVisibleRing
            )}
          >
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-primary">Archived currencies</h2>
              <p className="mt-0.5 text-xs font-medium text-muted">
                {archivedGroups.length} currenc{archivedGroups.length === 1 ? 'y' : 'ies'} kept for history
              </p>
            </div>
            <Chevron className="text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-subtle p-4 sm:p-5">
            <BalanceGrid groups={archivedGroups} muted onSelect={setSelectedBalanceId} />
          </div>
        </details>
      ) : null}

      {adjustments.length > 0 ? (
        <details className="group overflow-hidden rounded-[1.35rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.04)] ring-1 ring-subtle/70 dark:shadow-none">
          <summary
            className={cn(
              'flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 select-none [&::-webkit-details-marker]:hidden',
              focusVisibleRing
            )}
          >
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-primary">Balance check history</h2>
              <p className="mt-0.5 text-xs font-medium text-muted">
                {checkCount} monthly check{checkCount === 1 ? '' : 's'} recorded
              </p>
            </div>
            <Chevron className="text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="divide-y divide-subtle border-t border-subtle">
            {adjustments.map((checkpoint) => (
              <AdjustmentRow key={checkpoint.id} checkpoint={checkpoint} />
            ))}
          </div>
        </details>
      ) : null}

      <AdaptiveSheet
        open={Boolean(selectedBalance)}
        title={selectedBalance ? `${selectedBalance.currency} · ${capitalizeMethod(selectedBalance.method)}` : 'Balance'}
        description="Current balance and balance-check history."
        onClose={() => setSelectedBalanceId(null)}
        size="sm"
        footer={
          reconciliationState.required ? (
            <div className="flex justify-end">
              <Button onClick={requestBalanceCheck} className="w-full sm:w-auto">
                Check balances
              </Button>
            </div>
          ) : undefined
        }
      >
        {selectedBalance ? (
          <BalanceDetail balance={selectedBalance} history={selectedHistory} />
        ) : null}
      </AdaptiveSheet>
    </div>
  );
}

function groupBalances(balances: Balance[], preferredOrder: Currency[] = []): BalanceGroup[] {
  const groups = new Map<Currency, Balance[]>();
  for (const balance of balances) {
    const rows = groups.get(balance.currency) ?? [];
    rows.push(balance);
    groups.set(balance.currency, rows);
  }

  const order = new Map(preferredOrder.map((currency, index) => [currency, index]));
  return [...groups.entries()].sort(([a], [b]) => {
    const aIndex = order.get(a);
    const bIndex = order.get(b);
    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
    if (aIndex !== undefined) return -1;
    if (bIndex !== undefined) return 1;
    return a.localeCompare(b);
  });
}

function BalanceGrid({
  groups,
  muted = false,
  onSelect,
  dataLayout,
}: {
  groups: BalanceGroup[];
  muted?: boolean;
  onSelect: (balanceId: string) => void;
  dataLayout?: string;
}) {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2" data-layout={dataLayout}>
      {groups.map(([currency, rows]) => (
        <BalanceGroupCard
          key={currency}
          currency={currency}
          rows={rows}
          muted={muted}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function BalanceGroupCard({
  currency,
  rows,
  muted,
  onSelect,
}: {
  currency: Currency;
  rows: Balance[];
  muted: boolean;
  onSelect: (balanceId: string) => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const sortedRows = rows
    .slice()
    .sort((a, b) => methodOrder(a.method) - methodOrder(b.method));

  return (
    <article
      className={cn(
        'min-w-0 overflow-hidden rounded-[1.5rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none',
        muted && 'bg-surface-muted/55'
      )}
      data-balance-currency={currency}
    >
      <div className="p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{currency}</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-3xl font-semibold tracking-tight tabular-nums text-primary">
            {formatMoney(total, currency)}
          </p>
          <span className="text-xs font-semibold text-muted">total</span>
        </div>
      </div>

      <div className="divide-y divide-subtle border-t border-subtle">
        {sortedRows.map((balance) => (
          <button
            key={balance.id}
            type="button"
            onClick={() => onSelect(balance.id)}
            aria-label={`View ${balance.currency} ${balance.method} balance`}
            data-balance-method={balance.method}
            className={cn(
              'group flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-muted/70',
              focusVisibleRing
            )}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-muted text-accent" aria-hidden="true">
              <MethodIcon method={balance.method} />
            </span>
            <span className="min-w-0 flex-1 text-sm font-semibold text-secondary">
              {capitalizeMethod(balance.method)}
            </span>
            <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-primary">
              {formatMoney(balance.amount, balance.currency)}
            </span>
            <Chevron className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </article>
  );
}

function BalanceDetail({ balance, history }: { balance: Balance; history: BalanceCheckpoint[] }) {
  const latest = history[0];

  return (
    <div>
      <section className="rounded-[1.4rem] bg-surface-muted p-5 ring-1 ring-subtle/70">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Current balance</p>
        <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-primary">
          {formatMoney(balance.amount, balance.currency)}
        </p>
        <p className="mt-3 text-sm font-medium text-muted">
          {latest ? `Last checked ${formatCheckpointDate(latest)}` : 'No balance checks recorded yet.'}
        </p>
      </section>

      <section className="mt-5" aria-labelledby="selected-balance-history-title">
        <h3 id="selected-balance-history-title" className="text-sm font-semibold text-primary">
          Balance checks
        </h3>
        {history.length === 0 ? (
          <p className="mt-2 text-sm font-medium leading-6 text-muted">
            This balance has no reconciliation history yet.
          </p>
        ) : (
          <div className="mt-2 divide-y divide-subtle rounded-[1.25rem] ring-1 ring-subtle/70">
            {history.map((checkpoint) => (
              <AdjustmentRow key={checkpoint.id} checkpoint={checkpoint} compact />
            ))}
          </div>
        )}
      </section>

      <p className="mt-4 text-xs font-medium leading-5 text-muted">
        Balance checks correct the ledger without treating the difference as income or spending.
      </p>
    </div>
  );
}

function AdjustmentRow({
  checkpoint,
  compact = false,
}: {
  checkpoint: BalanceCheckpoint;
  compact?: boolean;
}) {
  const deltaLabel =
    checkpoint.deltaAmount === 0
      ? 'Matched'
      : `${checkpoint.deltaAmount > 0 ? '+' : ''}${formatMoney(checkpoint.deltaAmount, checkpoint.currency)}`;

  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 py-3', compact && 'px-4')}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary">
          {compact ? formatCheckpointDate(checkpoint) : `${checkpoint.currency} ${capitalizeMethod(checkpoint.method)}`}
        </p>
        <p className="mt-0.5 text-xs font-medium text-muted">
          {compact
            ? `${formatMoney(checkpoint.observedAmount, checkpoint.currency)} recorded`
            : `${formatCheckpointDate(checkpoint)} · ${formatMoney(checkpoint.observedAmount, checkpoint.currency)} recorded`}
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          checkpoint.deltaAmount > 0
            ? 'text-success'
            : checkpoint.deltaAmount < 0
              ? 'text-danger'
              : 'text-muted'
        )}
      >
        {deltaLabel}
      </span>
    </div>
  );
}

function MethodIcon({ method }: { method: Method }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
      {method === 'card' ? (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M3 9h18M7 15h4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <path d="M7 9.5h.01M17 14.5h.01" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      )}
    </svg>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={cn('h-5 w-5', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function methodOrder(method: Method) {
  return method === 'card' ? 0 : 1;
}

function capitalizeMethod(method: Method) {
  return method === 'card' ? 'Card' : 'Cash';
}

function formatCheckpointDate(checkpoint: BalanceCheckpoint) {
  const value = checkpoint.month ? `${checkpoint.month}-01T00:00:00` : `${checkpoint.date}T00:00:00`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return checkpoint.month ?? checkpoint.date;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: 'numeric',
    ...(checkpoint.month ? {} : { day: 'numeric' as const }),
  }).format(date);
}
